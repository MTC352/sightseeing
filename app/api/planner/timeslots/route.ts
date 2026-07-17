import { NextResponse } from "next/server"
import { dbGetTrip } from "@/lib/db/queries"
import { query } from "@/lib/db"
import { getTourCMSConfig, checkAvailability, type AvailabilityComponent } from "@/lib/tourcms"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"
import { MAX_SELECTED_DATE_DAYS, MAX_PARTY_SIZE } from "@/lib/planner/availability-scan"

export const dynamic = "force-dynamic"

// Per-trip-per-day cache keyed by "palisisId|todayYMD" (5-min TTL)
const _timeslotsCache = new Map<string, { data: PlannerTimeslotsResponse; expiresAt: number }>()

function pruneTimeslotsCache() {
  const now = Date.now()
  for (const [key, entry] of _timeslotsCache) {
    if (now >= entry.expiresAt) _timeslotsCache.delete(key)
  }
}

export interface PlannerTimeslot {
  time: string                       // HH:MM (24h)
  spotsLeft: number | null           // null = UNLIMITED
  spotsTotal: number | null          // null when unknown
  priceDisplay?: string
  currency?: string
  componentKey?: string
  componentName?: string             // variant/rate name from TourCMS note field
}

export interface TimeslotGroup {
  name: string                       // category/variant name; "" = single unnamed group
  slots: PlannerTimeslot[]
}

export interface PlannerTimeslotsResponse {
  ok: boolean
  tripId: string
  palisisId: string | null
  today: PlannerTimeslot[]
  tomorrow: PlannerTimeslot[]
  todayGroups: TimeslotGroup[]
  tomorrowGroups: TimeslotGroup[]
  /** Slots for the explicitly requested `date` param (when provided). */
  forDate?: PlannerTimeslot[]
  forDateGroups?: TimeslotGroup[]
  forDateYMD?: string
  error?: string
  providerError?: string | null
}

function todayYMD(): string {
  return new Date().toISOString().split("T")[0]
}
function addDaysYMD(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split("T")[0]
}

async function resolvePalisisId(tripId: string): Promise<string | null> {
  let row = (await dbGetTrip(tripId, { publicOnly: true }).catch(() => null)) as Record<string, unknown> | null

  if (!row && /^\d+$/.test(tripId)) {
    try {
      const rows = (await query(
        `SELECT id, palisis_id FROM trips WHERE palisis_id = $1 AND status = 'published' LIMIT 1`,
        [tripId],
      )) as Array<Record<string, unknown>>
      if (rows && rows.length > 0) row = rows[0]
    } catch { /* ignore */ }
  }

  if (!row) return null

  const fromRow =
    (row.palisis_id as string | undefined) ??
    (row.palisisId as string | undefined) ??
    null
  return fromRow ? String(fromRow) : null
}

/** Group availability components by their variant name (c.note), sorted by start time. */
function buildGroups(components: AvailabilityComponent[]): { groups: TimeslotGroup[]; flat: PlannerTimeslot[] } {
  const sorted = components.slice().sort((a, b) => {
    const aT = a.start_time_utcseconds ? parseInt(a.start_time_utcseconds, 10) : 0
    const bT = b.start_time_utcseconds ? parseInt(b.start_time_utcseconds, 10) : 0
    return aT - bT
  })

  const groupMap = new Map<string, PlannerTimeslot[]>()

  for (const c of sorted) {
    const time = (c.start_time ?? "").slice(0, 5)
    if (!time) continue

    const raw = c.spaces_remaining
    const unlimited = raw === "UNLIMITED"
    const spotsLeft = unlimited
      ? null
      : Math.max(0, parseInt(raw ?? "0", 10) || 0)

    const slot: PlannerTimeslot = {
      time,
      spotsLeft,
      spotsTotal: null,
      priceDisplay: c.total_price_display ?? undefined,
      currency: c.sale_currency ?? undefined,
      componentKey: c.component_key ?? undefined,
      componentName: c.note?.trim() || undefined,
    }

    const groupKey = c.note?.trim() ?? ""
    if (!groupMap.has(groupKey)) groupMap.set(groupKey, [])
    groupMap.get(groupKey)!.push(slot)
  }

  const groups: TimeslotGroup[] = Array.from(groupMap.entries()).map(([name, slots]) => ({ name, slots }))
  const flat = groups.flatMap((g) => g.slots)

  return { groups, flat }
}

async function fetchSlotsForDate(
  config: NonNullable<Awaited<ReturnType<typeof getTourCMSConfig>>>,
  palisisId: string,
  date: string,
  partySize = 1,
): Promise<{ ok: boolean; groups: TimeslotGroup[]; flat: PlannerTimeslot[]; providerError?: string }> {
  // TourCMS checkavail returns ZERO <component> rows unless at least one rate
  // quantity (r{rate_id}=qty) is requested. When the planner visitor never
  // picked a head-count we MUST still send a default of 1 person, otherwise the
  // timeslot widget always comes back empty. r1 maps to the first rate id (an
  // adult on every Luxembourg tour).
  const res = await checkAvailability(config, palisisId, { date, show_pickups: "0", r1: partySize })
  if (!res.ok) return { ok: false, groups: [], flat: [], providerError: res.error }
  const { groups, flat } = buildGroups(res.components)
  return { ok: true, groups, flat }
}

export async function GET(req: Request) {
  schedulePrune()
  pruneTimeslotsCache()
  const rl = rateLimit(req, { limit: 30, windowMs: 60_000 })
  if (!rl.allowed) return rl.response
  // Shared cross-instance per-IP limit.  Fail-open on DB error.
  const { sharedRateLimit: srl, getClientIp: gcip } = await import("@/lib/shared-rate-limit")
  const tsClientIp = gcip(req)
  const sharedTs = await srl(`timeslots:${tsClientIp}`, { limit: 30, windowMs: 60_000 })
  if (!sharedTs.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } })
  }

  const { searchParams } = new URL(req.url)
  const tripId = searchParams.get("tripId") ?? ""
  // Default party size to 1 person when the visitor never picked a head-count —
  // checkavail returns no timeslots without a rate quantity (see fetchSlotsForDate).
  // Cap at MAX_PARTY_SIZE: the full 1-20 range would let an attacker cycle through
  // party values to bust the per-trip cache and burn TourCMS quota.
  const partyRaw = parseInt((searchParams.get("party") ?? "1").trim(), 10)
  const partySize = Number.isFinite(partyRaw) ? Math.min(MAX_PARTY_SIZE, Math.max(1, partyRaw)) : 1
  // Optional explicit date: when the canvas has a future visit date selected, the
  // trip card fetches slots for THAT date (not just today/tomorrow).
  // Reject dates beyond MAX_SELECTED_DATE_DAYS to prevent cache-busting via
  // arbitrary far-future dates (each unique date forces a new TourCMS call).
  const rawDateParam = searchParams.get("date") ?? null
  let dateParam: string | null = null
  if (rawDateParam && /^\d{4}-\d{2}-\d{2}$/.test(rawDateParam)) {
    const daysAhead = Math.round(
      (new Date(`${rawDateParam}T00:00:00.000Z`).getTime() - Date.now()) / 86_400_000,
    )
    if (daysAhead >= 0 && daysAhead <= MAX_SELECTED_DATE_DAYS) {
      dateParam = rawDateParam
    } else if (daysAhead > MAX_SELECTED_DATE_DAYS) {
      return NextResponse.json(
        { error: "Date is too far in the future." },
        { status: 400 },
      )
    }
    // Past dates fall through as null — today/tomorrow slots are returned instead.
  }

  if (!tripId) {
    return NextResponse.json<PlannerTimeslotsResponse>(
      { ok: false, tripId: "", palisisId: null, today: [], tomorrow: [], todayGroups: [], tomorrowGroups: [], error: "MISSING_TRIP_ID" },
      { status: 400 },
    )
  }

  const config = await getTourCMSConfig()
  if (!config) {
    return NextResponse.json<PlannerTimeslotsResponse>(
      { ok: false, tripId, palisisId: null, today: [], tomorrow: [], todayGroups: [], tomorrowGroups: [], error: "TOURCMS_NOT_CONFIGURED" },
      { status: 200 },
    )
  }

  const palisisId = await resolvePalisisId(tripId)
  if (!palisisId) {
    return NextResponse.json<PlannerTimeslotsResponse>(
      { ok: false, tripId, palisisId: null, today: [], tomorrow: [], todayGroups: [], tomorrowGroups: [], error: "NO_PALISIS_LINK" },
      { status: 200 },
    )
  }

  const today = todayYMD()
  const cacheKey = `${palisisId}|${today}|p${partySize}`
  const cached = _timeslotsCache.get(cacheKey)

  // When a specific future date was requested, fetch slots just for that date
  // (the canvas needs the exact times for the visit date, not today/tomorrow).
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam !== today) {
    const forDateCacheKey = `${palisisId}|${dateParam}|p${partySize}`
    const forDateCached = _timeslotsCache.get(forDateCacheKey)
    if (forDateCached && Date.now() < forDateCached.expiresAt) {
      const base = (cached && Date.now() < cached.expiresAt) ? cached.data : { ok: true, tripId, palisisId, today: [], tomorrow: [], todayGroups: [], tomorrowGroups: [] }
      return NextResponse.json<PlannerTimeslotsResponse>({
        ...base,
        ...forDateCached.data,
        tripId,
      })
    }
    // Fetch today/tomorrow (cached path) + forDate in parallel.
    const forDateFetch = fetchSlotsForDate(config, palisisId, dateParam, partySize)
    let base: PlannerTimeslotsResponse
    if (cached && Date.now() < cached.expiresAt) {
      base = cached.data
    } else {
      const tomorrow = addDaysYMD(today, 1)
      const [todayRes, tomorrowRes] = await Promise.all([
        fetchSlotsForDate(config, palisisId, today, partySize),
        fetchSlotsForDate(config, palisisId, tomorrow, partySize),
      ])
      base = {
        ok: todayRes.ok || tomorrowRes.ok,
        tripId,
        palisisId,
        today: todayRes.flat,
        tomorrow: tomorrowRes.flat,
        todayGroups: todayRes.groups,
        tomorrowGroups: tomorrowRes.groups,
      }
      _timeslotsCache.set(cacheKey, { data: base, expiresAt: Date.now() + 5 * 60_000 })
    }
    const forDateRes = await forDateFetch
    const forDatePayload: PlannerTimeslotsResponse = {
      ...base,
      tripId,
      forDate: forDateRes.flat,
      forDateGroups: forDateRes.groups,
      forDateYMD: dateParam,
      ok: base.ok || forDateRes.ok,
    }
    _timeslotsCache.set(forDateCacheKey, { data: forDatePayload, expiresAt: Date.now() + 5 * 60_000 })
    return NextResponse.json<PlannerTimeslotsResponse>(forDatePayload)
  }

  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json<PlannerTimeslotsResponse>({ ...cached.data, tripId })
  }

  const tomorrow = addDaysYMD(today, 1)
  const [todayRes, tomorrowRes] = await Promise.all([
    fetchSlotsForDate(config, palisisId, today, partySize),
    fetchSlotsForDate(config, palisisId, tomorrow, partySize),
  ])

  if (!todayRes.ok && !tomorrowRes.ok) {
    return NextResponse.json<PlannerTimeslotsResponse>(
      {
        ok: false,
        tripId,
        palisisId,
        today: [],
        tomorrow: [],
        todayGroups: [],
        tomorrowGroups: [],
        error: "TOURCMS_ERROR",
        providerError: todayRes.providerError ?? tomorrowRes.providerError ?? null,
      },
      { status: 200 },
    )
  }

  const payload: PlannerTimeslotsResponse = {
    ok: true,
    tripId,
    palisisId,
    today: todayRes.flat,
    tomorrow: tomorrowRes.flat,
    todayGroups: todayRes.groups,
    tomorrowGroups: tomorrowRes.groups,
  }
  _timeslotsCache.set(cacheKey, { data: payload, expiresAt: Date.now() + 5 * 60_000 })
  return NextResponse.json<PlannerTimeslotsResponse>(payload)
}
