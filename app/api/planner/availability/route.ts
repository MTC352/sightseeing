import { NextResponse } from "next/server"
import { queryOne } from "@/lib/db"
import { dbListTrips } from "@/lib/db/queries"
import { getTourCMSConfig, showTourDatesAndDeals } from "@/lib/tourcms"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

/** Per-trip availability over the planner scan window. */
export interface PlannerTripAvailability {
  /** Has at least one bookable departure ON the selected date (false when no date). */
  availableOnSelectedDate: boolean
  /** Bookable dates within the scan window (YYYY-MM-DD, ascending, deduped). */
  availableDates: string[]
}

export interface PlannerAvailabilityResponse {
  /** The selected date echoed back (or null). */
  selectedDate: string | null
  /** Scan window actually used. */
  windowStart: string
  windowEnd: string
  windowDays: number
  trips: Record<string, PlannerTripAvailability>
}

const DEFAULT_WINDOW_DAYS = 30
const DAY_MS = 86_400_000

// Cache keyed by "windowStart|windowEnd|selectedDate"
const _cache = new Map<string, { data: PlannerAvailabilityResponse; expiresAt: number }>()

function prune() {
  const now = Date.now()
  for (const [k, v] of _cache) if (now >= v.expiresAt) _cache.delete(k)
}

function toYMD(d: Date) {
  return d.toISOString().split("T")[0]
}

/** Read admin-configured scan window length (days); fall back to 30. */
async function getWindowDays(): Promise<number> {
  try {
    const row = await queryOne<{ extra_config: Record<string, unknown> }>(
      `SELECT extra_config FROM ai_system_configs WHERE system_key = 'planner'`
    )
    const raw = row?.extra_config?.availabilityWindowDays
    const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10)
    if (Number.isFinite(n) && n >= 7 && n <= 120) return n
  } catch {
    // fall through to default
  }
  return DEFAULT_WINDOW_DAYS
}

export async function GET(req: Request) {
  schedulePrune()
  prune()
  const rl = rateLimit(req, { limit: 20, windowMs: 60_000 })
  if (!rl.allowed) return rl.response

  const { searchParams } = new URL(req.url)
  const dateParam = (searchParams.get("date") ?? "").trim()
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null

  const windowDays = await getWindowDays()
  const half = Math.floor(windowDays / 2)

  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  const todayStr = toYMD(now)

  // Window selection rule (admin-configurable W = windowDays):
  //  - no date OR (selectedDate - today) < W/2  -> [today, today+W]
  //  - else                                     -> [selectedDate-W/2, selectedDate+W/2]
  let windowStart: string
  let windowEnd: string
  if (!selectedDate) {
    windowStart = todayStr
    windowEnd = toYMD(new Date(now.getTime() + windowDays * DAY_MS))
  } else {
    const sel = new Date(`${selectedDate}T00:00:00.000Z`)
    const daysUntil = Math.round((sel.getTime() - now.getTime()) / DAY_MS)
    if (daysUntil < half) {
      windowStart = todayStr
      windowEnd = toYMD(new Date(now.getTime() + windowDays * DAY_MS))
    } else {
      windowStart = toYMD(new Date(sel.getTime() - half * DAY_MS))
      windowEnd = toYMD(new Date(sel.getTime() + half * DAY_MS))
    }
    // Never scan before today.
    if (windowStart < todayStr) windowStart = todayStr
  }

  const cacheKey = `${windowStart}|${windowEnd}|${selectedDate ?? ""}`
  const cached = _cache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data)
  }

  const [config, rows] = await Promise.all([
    getTourCMSConfig(),
    dbListTrips({ publicOnly: true }).catch(() => [] as unknown[]),
  ])

  const tcmsTrips = (rows as { id: string }[]).filter((r) => r.id.startsWith("tcms_"))

  const trips: Record<string, PlannerTripAvailability> = {}

  if (config && tcmsTrips.length > 0) {
    await Promise.all(
      tcmsTrips.map(async (row) => {
        const tourId = row.id.replace("tcms_", "")
        try {
          const { dates } = await showTourDatesAndDeals(config, tourId, {
            startdate_start: windowStart,
            startdate_end: windowEnd,
          })

          const bookable = new Set<string>()
          for (const d of dates) {
            if (!d.start_time || !d.start_date) continue
            const raw = d.spaces_remaining
            const unlimited = raw === "UNLIMITED"
            const spotsLeft = unlimited ? 99 : Math.max(0, parseInt(raw ?? "0", 10))
            if (unlimited || spotsLeft > 0) bookable.add(d.start_date)
          }

          const availableDates = Array.from(bookable).sort()
          trips[row.id] = {
            availableOnSelectedDate: selectedDate ? bookable.has(selectedDate) : false,
            availableDates,
          }
        } catch {
          // skip — trip will simply have no availability data
        }
      })
    )
  }

  const data: PlannerAvailabilityResponse = {
    selectedDate,
    windowStart,
    windowEnd,
    windowDays,
    trips,
  }

  _cache.set(cacheKey, { data, expiresAt: Date.now() + 5 * 60_000 })

  return NextResponse.json(data)
}
