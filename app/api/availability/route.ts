import { NextResponse } from "next/server"
import { dbListTrips } from "@/lib/db/queries"
import { getTourCMSConfig, showTourDatesAndDeals } from "@/lib/tourcms"

export const dynamic = "force-dynamic"

interface Timeslot { time: string; spotsLeft: number; spotsTotal: number }
interface TripAvailability { today: Timeslot[]; tomorrow: Timeslot[] }
type AvailabilityMap = Record<string, TripAvailability>

// Multi-key cache: keyed by "startDate|endDate|timeFrom|timeTo"
const _cache = new Map<string, { data: AvailabilityMap; expiresAt: number }>()

function toYMD(d: Date) {
  return d.toISOString().split("T")[0]
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const dateParam = searchParams.get("date")    ?? ""
  const timeFrom  = searchParams.get("timeFrom") ?? ""
  const timeTo    = searchParams.get("timeTo")   ?? ""

  const now         = new Date()
  const todayStr    = toYMD(now)
  const tomorrowStr = toYMD(new Date(now.getTime() + 86_400_000))

  // When a specific date is requested, query only that date (both start + end = same day)
  const startDate = dateParam || todayStr
  const endDate   = dateParam || tomorrowStr
  const dateMode  = dateParam !== ""           // true → user picked a date

  // Cache keyed by date range only — time/person filtering is done client-side
  const cacheKey = `${startDate}|${endDate}`
  const cached   = _cache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data)
  }

  const [config, rows] = await Promise.all([
    getTourCMSConfig(),
    dbListTrips().catch(() => [] as unknown[]),
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

        const todaySlots: Timeslot[]    = []
        const tomorrowSlots: Timeslot[] = []

        for (const d of dates) {
          if (!d.start_time) continue

          // Time filtering is now client-side — return all slots regardless of time
          const raw      = d.spaces_remaining
          const unlimited = raw === "UNLIMITED"
          const spotsLeft  = unlimited ? 99 : Math.max(0, parseInt(raw ?? "0", 10))
          const spotsTotal = unlimited ? 100 : Math.max(spotsLeft + 8, 15)
          const slot: Timeslot = {
            time: d.start_time,
            spotsLeft,
            spotsTotal,
          }

          if (dateMode) {
            // All matching slots go into the "today" bucket (= the selected date)
            todaySlots.push(slot)
          } else {
            if (d.start_date === todayStr)    todaySlots.push(slot)
            else if (d.start_date === tomorrowStr) tomorrowSlots.push(slot)
          }
        }

        result[row.id] = {
          today:    todaySlots.sort((a, b) => a.time.localeCompare(b.time)),
          tomorrow: tomorrowSlots.sort((a, b) => a.time.localeCompare(b.time)),
        }
      } catch {
        // skip — card falls back to dummy
      }
    })
  )

  // Date-specific queries: 1-min cache (user expects fresh slot data for their chosen date)
  // Default today/tomorrow: 5-min cache
  _cache.set(cacheKey, {
    data:      result,
    expiresAt: Date.now() + (dateMode ? 60_000 : 5 * 60_000),
  })

  return NextResponse.json(result)
}
