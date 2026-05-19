import { NextResponse } from "next/server"
import { dbGetTrip } from "@/lib/db/queries"
import { query } from "@/lib/db"
import { getTourCMSConfig, checkAvailability, type AvailabilityComponent } from "@/lib/tourcms"

export const dynamic = "force-dynamic"

export interface PlannerTimeslot {
  time: string                       // HH:MM (24h)
  spotsLeft: number | null           // null = UNLIMITED
  spotsTotal: number | null          // null when unknown
  priceDisplay?: string
  currency?: string
  componentKey?: string
}

export interface PlannerTimeslotsResponse {
  ok: boolean
  tripId: string
  palisisId: string | null
  today: PlannerTimeslot[]
  tomorrow: PlannerTimeslot[]
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
  let row = (await dbGetTrip(tripId).catch(() => null)) as Record<string, unknown> | null
  if (!row && /^\d+$/.test(tripId)) {
    try {
      const rows = (await query(
        `SELECT id, palisis_id FROM trips WHERE palisis_id = $1 LIMIT 1`,
        [tripId],
      )) as Array<Record<string, unknown>>
      if (rows && rows.length > 0) row = rows[0]
    } catch { /* ignore */ }
  }
  const fromRow =
    (row?.palisis_id as string | undefined) ??
    (row?.palisisId as string | undefined) ??
    null
  if (fromRow) return String(fromRow)
  if (tripId.startsWith("tcms_")) return tripId.slice("tcms_".length)
  if (/^\d+$/.test(tripId)) return tripId
  return null
}

function normalizeComponents(components: AvailabilityComponent[]): PlannerTimeslot[] {
  return components
    .slice()
    .sort((a, b) => {
      const aT = a.start_time_utcseconds ? parseInt(a.start_time_utcseconds, 10) : 0
      const bT = b.start_time_utcseconds ? parseInt(b.start_time_utcseconds, 10) : 0
      return aT - bT
    })
    .map((c) => {
      const raw = c.spaces_remaining
      const unlimited = raw === "UNLIMITED"
      const spotsLeft = unlimited
        ? null
        : Math.max(0, parseInt(raw ?? "0", 10) || 0)
      // Show HH:MM only
      const time = (c.start_time ?? "").slice(0, 5)
      return {
        time,
        spotsLeft,
        spotsTotal: null,
        priceDisplay: c.total_price_display ?? undefined,
        currency: c.sale_currency ?? undefined,
        componentKey: c.component_key ?? undefined,
      } satisfies PlannerTimeslot
    })
    .filter((s) => s.time.length > 0)
}

async function fetchSlotsForDate(
  config: NonNullable<Awaited<ReturnType<typeof getTourCMSConfig>>>,
  palisisId: string,
  date: string,
): Promise<{ ok: boolean; slots: PlannerTimeslot[]; providerError?: string }> {
  const res = await checkAvailability(config, palisisId, { date, show_pickups: "0" })
  if (!res.ok) return { ok: false, slots: [], providerError: res.error }
  return { ok: true, slots: normalizeComponents(res.components) }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tripId = searchParams.get("tripId") ?? ""
  if (!tripId) {
    return NextResponse.json<PlannerTimeslotsResponse>(
      { ok: false, tripId: "", palisisId: null, today: [], tomorrow: [], error: "MISSING_TRIP_ID" },
      { status: 400 },
    )
  }

  const config = await getTourCMSConfig()
  if (!config) {
    return NextResponse.json<PlannerTimeslotsResponse>(
      { ok: false, tripId, palisisId: null, today: [], tomorrow: [], error: "TOURCMS_NOT_CONFIGURED" },
      { status: 200 },
    )
  }

  const palisisId = await resolvePalisisId(tripId)
  if (!palisisId) {
    return NextResponse.json<PlannerTimeslotsResponse>(
      { ok: false, tripId, palisisId: null, today: [], tomorrow: [], error: "NO_PALISIS_LINK" },
      { status: 200 },
    )
  }

  const today = todayYMD()
  const tomorrow = addDaysYMD(today, 1)
  const [todayRes, tomorrowRes] = await Promise.all([
    fetchSlotsForDate(config, palisisId, today),
    fetchSlotsForDate(config, palisisId, tomorrow),
  ])

  if (!todayRes.ok && !tomorrowRes.ok) {
    return NextResponse.json<PlannerTimeslotsResponse>(
      {
        ok: false,
        tripId,
        palisisId,
        today: [],
        tomorrow: [],
        error: "TOURCMS_ERROR",
        providerError: todayRes.providerError ?? tomorrowRes.providerError ?? null,
      },
      { status: 200 },
    )
  }

  return NextResponse.json<PlannerTimeslotsResponse>({
    ok: true,
    tripId,
    palisisId,
    today: todayRes.slots,
    tomorrow: tomorrowRes.slots,
  })
}
