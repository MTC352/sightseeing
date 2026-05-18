import { NextResponse } from "next/server"
import { dbGetSettings, dbUpdateApiKeys, dbListDepartures, dbListTrips } from "@/lib/db/queries"
import { getTourCMSClient } from "@/lib/tourcms"

export const dynamic = "force-dynamic"

export interface DepartingSoonItem {
  tripId: string
  palisisId?: string
  tripTitle: string
  tripImage: string
  category: string
  city: string
  date: string
  time: string
  price: number
  priceDisplay: string
  spacesRemaining: number | null
  label: string
}

interface MemCache {
  departures: DepartingSoonItem[]
  cachedAt: number
}

let memCache: MemCache | null = null

function getLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`
  if (dateStr === todayStr) return "Today"
  if (dateStr === tomorrowStr) return "Tomorrow"
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short" })
}

export async function GET() {
  try {
    const settings = await dbGetSettings()
    const apiKeys = (settings.apiKeys ?? {}) as Record<string, string>

    const autoUpdate = apiKeys.departing_soon_auto_update === "true"
    const rawInterval = parseInt(apiKeys.departing_soon_interval ?? "300", 10)
    const interval = isNaN(rawInterval) || rawInterval < 60 ? 300 : rawInterval

    if (memCache && Date.now() - memCache.cachedAt < interval * 1000) {
      return NextResponse.json({
        ok: true,
        departures: memCache.departures,
        autoUpdate,
        interval,
        cachedAt: new Date(memCache.cachedAt).toISOString(),
        fromCache: true,
      })
    }

    const departures = await fetchFreshDepartures()
    memCache = { departures, cachedAt: Date.now() }

    return NextResponse.json({
      ok: true,
      departures,
      autoUpdate,
      interval,
      cachedAt: new Date(memCache.cachedAt).toISOString(),
      fromCache: false,
    })
  } catch (err) {
    console.error("[departing-soon] GET:", err)
    return NextResponse.json({ ok: false, departures: [], error: String(err) }, { status: 500 })
  }
}

async function fetchFreshDepartures(): Promise<DepartingSoonItem[]> {
  const tourcms = await getTourCMSClient()
  if (tourcms) {
    try {
      const items = await fetchFromTourCMS(tourcms)
      if (items.length > 0) return items
    } catch (err) {
      console.warn("[departing-soon] TourCMS failed, falling back to DB:", err)
    }
  }
  return fetchFromDB()
}

async function fetchFromTourCMS(
  tourcms: NonNullable<Awaited<ReturnType<typeof getTourCMSClient>>>
): Promise<DepartingSoonItem[]> {
  const allTrips = (await dbListTrips()) as Array<{
    id: string
    title: string
    palisis_id?: string
    image?: string
    category?: string
    city?: string
    price?: number
  }>
  const syncedTrips = allTrips.filter((t) => t.palisis_id)
  if (syncedTrips.length === 0) return []

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

  const items: DepartingSoonItem[] = []

  for (const trip of syncedTrips) {
    try {
      const result = await tourcms.showDatesAndDeals(trip.palisis_id!, {
        startdate_start: todayStr,
        startdate_end: in7Days,
      })
      if (!result.ok || !Array.isArray(result.dates) || result.dates.length === 0) continue

      const openSlots = result.dates.filter(
        (d: Record<string, unknown>) => !d.status || d.status === "OPEN" || d.status === "AVAILABLE"
      )
      if (openSlots.length === 0) continue

      const slot = openSlots[0] as Record<string, unknown>
      const price = parseFloat((slot.price_1 as string) ?? "0") || 0
      const spacesRemaining =
        slot.spaces_remaining != null ? Number(slot.spaces_remaining) : null

      items.push({
        tripId: trip.id,
        palisisId: trip.palisis_id,
        tripTitle: trip.title,
        tripImage: trip.image ?? "",
        category: trip.category ?? "Tours",
        city: trip.city ?? "Luxembourg",
        date: slot.start_date as string,
        time: (slot.start_time as string) ?? "09:00",
        price,
        priceDisplay: price > 0 ? `${price.toFixed(0)} €` : "Free",
        spacesRemaining,
        label: getLabel(slot.start_date as string),
      })
    } catch {
      /* skip this trip */
    }
  }

  return items
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    .slice(0, 5)
}

async function fetchFromDB(): Promise<DepartingSoonItem[]> {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  const deps = (await dbListDepartures()) as Array<{
    id: string
    tripId: string
    tripTitle: string
    tripImage: string
    category: string
    city: string
    date: string
    time: string
    spotsTotal: number
    spotsBooked: number
    price: number
    status: string
  }>

  const seen = new Set<string>()
  return deps
    .filter((d) => d.date >= todayStr && d.status !== "cancelled")
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    .filter((d) => {
      if (seen.has(d.tripId)) return false
      seen.add(d.tripId)
      return true
    })
    .slice(0, 5)
    .map((d) => {
      const remaining =
        d.spotsTotal > 0 ? Math.max(0, d.spotsTotal - (d.spotsBooked ?? 0)) : null
      const price = d.price ?? 0
      return {
        tripId: d.tripId,
        tripTitle: d.tripTitle,
        tripImage: d.tripImage ?? "",
        category: d.category ?? "Tours",
        city: d.city ?? "Luxembourg",
        date: d.date,
        time: d.time ?? "09:00",
        price,
        priceDisplay: price > 0 ? `${price} €` : "Free",
        spacesRemaining: remaining,
        label: getLabel(d.date),
      }
    })
}
