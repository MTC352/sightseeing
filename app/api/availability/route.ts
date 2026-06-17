import { NextResponse } from "next/server"
import { dbListTrips } from "@/lib/db/queries"
import { getTourCMSConfig, showTourDatesAndDeals } from "@/lib/tourcms"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export interface AvTimeslot {
  time: string
  spotsLeft: number
  spotsTotal: number
  rateName?: string   // variant name from DepartureDate.note, e.g. "Classical Tasting"
}

export interface AvSlotGroup {
  name: string           // variant name; "" = single unnamed group
  slots: AvTimeslot[]
}

export interface AvTripAvailability {
  /** Deduplicated flat list (best availability per time) — used for card chip preview */
  today: AvTimeslot[]
  tomorrow: AvTimeslot[]
  /** Grouped by variant name — used for the full-timeslot modal */
  todayGroups: AvSlotGroup[]
  tomorrowGroups: AvSlotGroup[]
  /** Earliest bookable date strictly AFTER tomorrow (YYYY-MM-DD), within the
   *  scan window. Non-date mode only — lets cards show "Next timeslot available
   *  on {date}" when there are no today/tomorrow slots. null when none found. */
  nextAvailableDate?: string | null
}

export type AvailabilityMap = Record<string, AvTripAvailability>

// Multi-key cache: keyed by "startDate|endDate"
const _cache = new Map<string, { data: AvailabilityMap; expiresAt: number }>()

function pruneAvailabilityCache() {
  const now = Date.now()
  for (const [key, entry] of _cache) {
    if (now >= entry.expiresAt) _cache.delete(key)
  }
}

function toYMD(d: Date) {
  return d.toISOString().split("T")[0]
}

/** Group a raw slot array by rateName, preserving insertion order. */
function buildGroups(slots: AvTimeslot[]): AvSlotGroup[] {
  const map = new Map<string, AvTimeslot[]>()
  for (const s of slots) {
    const key = s.rateName ?? ""
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return Array.from(map.entries()).map(([name, items]) => ({ name, slots: items }))
}

/** Deduplicate a slot list by time, keeping the entry with the highest spotsLeft. */
function deduplicateByTime(slots: AvTimeslot[]): AvTimeslot[] {
  const best = new Map<string, AvTimeslot>()
  for (const s of slots) {
    const existing = best.get(s.time)
    if (!existing || s.spotsLeft > existing.spotsLeft) {
      best.set(s.time, s)
    }
  }
  return Array.from(best.values()).sort((a, b) => a.time.localeCompare(b.time))
}

export async function GET(req: Request) {
  schedulePrune()
  pruneAvailabilityCache()
  const rl = rateLimit(req, { limit: 20, windowMs: 60_000 })
  if (!rl.allowed) return rl.response

  const { searchParams } = new URL(req.url)
  const rawDate = (searchParams.get("date") ?? "").trim()

  const now         = new Date()
  const todayStr    = toYMD(now)
  const tomorrowStr = toYMD(new Date(now.getTime() + 86_400_000))

  // Non-date mode scans a 30-day window (not just today/tomorrow) so we can
  // surface the next bookable date for trips with no today/tomorrow slots.
  const horizonStr = toYMD(new Date(now.getTime() + 30 * 86_400_000))

  // ── Validate + clamp the attacker-controlled `date` param ─────────────────
  // This endpoint is public and unauthenticated. The `date` value feeds both
  // the in-process cache key AND the upstream TourCMS date range, so an
  // unvalidated value lets a caller bust the cache with unlimited unique /
  // malformed strings and force a fresh ~18-call fan-out on every request.
  // We accept ONLY a real calendar date in YYYY-MM-DD form within the scan
  // window [today, today+30d]; anything else is rejected up front. This bounds
  // the number of distinct cache keys to the valid date window so repeated
  // requests collapse onto the cache instead of amplifying upstream calls.
  let dateParam = ""
  if (rawDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 })
    }
    const parsed = new Date(`${rawDate}T00:00:00Z`)
    // Reject non-real dates (e.g. 2026-02-31 rolls over) by round-tripping.
    if (isNaN(parsed.getTime()) || toYMD(parsed) !== rawDate) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 })
    }
    if (rawDate < todayStr || rawDate > horizonStr) {
      return NextResponse.json(
        { error: "Date out of range. Only the next 30 days are available." },
        { status: 400 },
      )
    }
    dateParam = rawDate
  }

  const startDate = dateParam || todayStr
  const endDate   = dateParam || horizonStr
  const dateMode  = dateParam !== ""

  const cacheKey = `${startDate}|${endDate}`
  const cached   = _cache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data)
  }

  const [config, rows] = await Promise.all([
    getTourCMSConfig(),
    dbListTrips({ publicOnly: true }).catch(() => [] as unknown[]),
  ])

  const tcmsTrips = (rows as { id: string }[]).filter(r => r.id.startsWith("tcms_"))

  if (!config || tcmsTrips.length === 0) {
    return NextResponse.json({})
  }

  const result: AvailabilityMap = {}

  await Promise.all(
    tcmsTrips.map(async (row) => {
      const tourId = row.id.replace("tcms_", "")
      try {
        const { dates } = await showTourDatesAndDeals(config, tourId, {
          startdate_start: startDate,
          startdate_end:   endDate,
        })

        const todayRaw: AvTimeslot[]    = []
        const tomorrowRaw: AvTimeslot[] = []
        let nextAvailableDate: string | null = null

        for (const d of dates) {
          if (!d.start_time) continue

          const raw      = d.spaces_remaining
          const unlimited = raw === "UNLIMITED"
          const spotsLeft  = unlimited ? 99 : Math.max(0, parseInt(raw ?? "0", 10))
          const spotsTotal = unlimited ? 100 : Math.max(spotsLeft + 8, 15)

          const slot: AvTimeslot = {
            time:      d.start_time.slice(0, 5),
            spotsLeft,
            spotsTotal,
            rateName:  d.note?.trim() || undefined,
          }

          if (dateMode) {
            todayRaw.push(slot)
          } else {
            if (d.start_date === todayStr)         todayRaw.push(slot)
            else if (d.start_date === tomorrowStr) tomorrowRaw.push(slot)
            else if (
              d.start_date &&
              d.start_date > tomorrowStr &&
              (unlimited || spotsLeft > 0)
            ) {
              // Track the earliest ACTUALLY-BOOKABLE date beyond tomorrow
              // (skip sold-out departures so the card never points users at
              // a date they can't book).
              if (!nextAvailableDate || d.start_date < nextAvailableDate) {
                nextAvailableDate = d.start_date
              }
            }
          }
        }

        result[row.id] = {
          today:          deduplicateByTime(todayRaw),
          tomorrow:       deduplicateByTime(tomorrowRaw),
          todayGroups:    buildGroups(todayRaw),
          tomorrowGroups: buildGroups(tomorrowRaw),
          nextAvailableDate: dateMode ? null : nextAvailableDate,
        }
      } catch {
        // skip — card falls back to dummy
      }
    })
  )

  _cache.set(cacheKey, {
    data:      result,
    expiresAt: Date.now() + (dateMode ? 60_000 : 5 * 60_000),
  })

  return NextResponse.json(result)
}
