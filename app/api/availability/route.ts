import { NextResponse } from "next/server"
import { dbListTrips } from "@/lib/db/queries"
import { getTourCMSConfig, showTourDatesAndDeals } from "@/lib/tourcms"

export const dynamic = "force-dynamic"

interface Timeslot { time: string; spotsLeft: number; spotsTotal: number }
interface TripAvailability { today: Timeslot[]; tomorrow: Timeslot[] }
type AvailabilityMap = Record<string, TripAvailability>

let _cache: { data: AvailabilityMap; expiresAt: number } | null = null

function toYMD(d: Date) {
  return d.toISOString().split("T")[0]
}

export async function GET() {
  if (_cache && Date.now() < _cache.expiresAt) {
    return NextResponse.json(_cache.data)
  }

  const now       = new Date()
  const todayStr    = toYMD(now)
  const tomorrowStr = toYMD(new Date(now.getTime() + 86_400_000))

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
          startdate_start: todayStr,
          startdate_end:   tomorrowStr,
        })

        const todaySlots: Timeslot[]    = []
        const tomorrowSlots: Timeslot[] = []

        for (const d of dates) {
          if (!d.start_time) continue
          const raw      = d.spaces_remaining
          const unlimited = raw === "UNLIMITED"
          const spotsLeft  = unlimited ? 99 : Math.max(0, parseInt(raw ?? "0", 10))
          const spotsTotal = unlimited ? 100 : Math.max(spotsLeft + 8, 15)
          const slot: Timeslot = { time: d.start_time, spotsLeft, spotsTotal }
          if (d.start_date === todayStr)    todaySlots.push(slot)
          else if (d.start_date === tomorrowStr) tomorrowSlots.push(slot)
        }

        result[row.id] = {
          today:    todaySlots.sort((a, b) => a.time.localeCompare(b.time)),
          tomorrow: tomorrowSlots.sort((a, b) => a.time.localeCompare(b.time)),
        }
      } catch {
        // skip — this trip's availability will fall back to dummy on the client
      }
    })
  )

  _cache = { data: result, expiresAt: Date.now() + 5 * 60 * 1000 }
  return NextResponse.json(result)
}
