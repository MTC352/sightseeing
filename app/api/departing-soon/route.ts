import { NextResponse } from "next/server"
import { dbGetSettings, dbListDepartures, dbListTrips } from "@/lib/db/queries"
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

interface FetchMeta {
  source: "tourcms" | "db" | "empty"
  tourcmsConfigured: boolean
  tripsWithPalisisId: number
  tourcmsCallsAttempted: number
  tourcmsCallsFailed: number
  tourcmsErrors: string[]
  warning?: string
}

interface MemCache {
  departures: DepartingSoonItem[]
  cachedAt: number
  meta: FetchMeta
}

let memCache: MemCache | null = null

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function getLabel(dateStr: string): string {
  const ts = todayStr()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`
  if (dateStr === ts) return "Today"
  if (dateStr === tomorrowStr) return "Tomorrow"
  const [y, m, day] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, day).toLocaleDateString("en-GB", { weekday: "short" })
}

/** Returns true only if the slot is still in the future (not yet departed). */
function isInFuture(dateStr: string, timeStr: string): boolean {
  const now = new Date()
  const [hh, mm] = (timeStr ?? "00:00").split(":").map(Number)
  // Build a Date in local time for the slot
  const slotDate = new Date(dateStr + "T00:00:00")
  slotDate.setHours(hh, mm, 0, 0)
  return slotDate > now
}

export async function GET() {
  try {
    const settings = await dbGetSettings()
    const apiKeys = (settings.apiKeys ?? {}) as Record<string, string>

    const autoUpdate = apiKeys.departing_soon_auto_update === "true"
    const rawInterval = parseInt(apiKeys.departing_soon_interval ?? "300", 10)
    const interval = isNaN(rawInterval) || rawInterval < 60 ? 300 : rawInterval

    if (memCache && Date.now() - memCache.cachedAt < interval * 1000) {
      // Validate cached items — bust if any departure has already passed
      const stillValid = memCache.departures.every((d) => isInFuture(d.date, d.time))
      if (stillValid) {
        return NextResponse.json({
          ok: true,
          departures: memCache.departures,
          autoUpdate,
          interval,
          cachedAt: new Date(memCache.cachedAt).toISOString(),
          fromCache: true,
          meta: memCache.meta,
        })
      }
      // One or more cached items have departed — invalidate and re-fetch below
      memCache = null
    }

    const { departures, meta } = await fetchFreshDepartures()
    memCache = { departures, cachedAt: Date.now(), meta }

    // Surface failure modes loudly so silent fallbacks don't go unnoticed
    if (meta.source === "empty") {
      console.warn("[departing-soon] Returning empty list — meta:", meta)
    } else if (meta.source === "db" && meta.tourcmsConfigured) {
      console.warn("[departing-soon] TourCMS configured but fell back to DB — meta:", meta)
    } else if (meta.tourcmsCallsFailed > 0) {
      console.warn(
        `[departing-soon] ${meta.tourcmsCallsFailed}/${meta.tourcmsCallsAttempted} TourCMS calls failed:`,
        meta.tourcmsErrors.slice(0, 5),
      )
    }

    return NextResponse.json({
      ok: true,
      departures,
      autoUpdate,
      interval,
      cachedAt: new Date(memCache.cachedAt).toISOString(),
      fromCache: false,
      meta,
    })
  } catch (err) {
    console.error("[departing-soon] GET:", err)
    return NextResponse.json({ ok: false, departures: [], error: String(err) }, { status: 500 })
  }
}

async function fetchFreshDepartures(): Promise<{ departures: DepartingSoonItem[]; meta: FetchMeta }> {
  const tourcms = await getTourCMSClient()
  const tourcmsConfigured = tourcms !== null

  if (!tourcmsConfigured) {
    console.warn("[departing-soon] TourCMS client not configured (missing apiKey/channelId in integrations table) — using DB fallback")
  }

  if (tourcms) {
    try {
      const { items, meta } = await fetchFromTourCMS(tourcms)
      if (items.length > 0) {
        return { departures: items, meta: { ...meta, source: "tourcms", tourcmsConfigured } }
      }
      // TourCMS returned nothing — fall through to DB but record the meta
      const dbItems = await fetchFromDB()
      return {
        departures: dbItems,
        meta: {
          ...meta,
          source: dbItems.length > 0 ? "db" : "empty",
          tourcmsConfigured,
          warning: meta.tripsWithPalisisId === 0
            ? "No trips in DB have a palisis_id — run a Palisis import"
            : "TourCMS returned no open future slots for any synced trip",
        },
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.warn("[departing-soon] TourCMS fetch threw, falling back to DB:", errMsg)
      const dbItems = await fetchFromDB()
      return {
        departures: dbItems,
        meta: {
          source: dbItems.length > 0 ? "db" : "empty",
          tourcmsConfigured,
          tripsWithPalisisId: 0,
          tourcmsCallsAttempted: 0,
          tourcmsCallsFailed: 0,
          tourcmsErrors: [errMsg],
          warning: `TourCMS fetch failed: ${errMsg}`,
        },
      }
    }
  }

  const dbItems = await fetchFromDB()
  return {
    departures: dbItems,
    meta: {
      source: dbItems.length > 0 ? "db" : "empty",
      tourcmsConfigured: false,
      tripsWithPalisisId: 0,
      tourcmsCallsAttempted: 0,
      tourcmsCallsFailed: 0,
      tourcmsErrors: [],
      warning: "TourCMS credentials not configured — set palisis + palisisChannelId in /admin/integrations",
    },
  }
}

async function fetchFromTourCMS(
  tourcms: NonNullable<Awaited<ReturnType<typeof getTourCMSClient>>>
): Promise<{ items: DepartingSoonItem[]; meta: FetchMeta }> {
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

  const meta: FetchMeta = {
    source: "tourcms",
    tourcmsConfigured: true,
    tripsWithPalisisId: syncedTrips.length,
    tourcmsCallsAttempted: 0,
    tourcmsCallsFailed: 0,
    tourcmsErrors: [],
  }

  if (syncedTrips.length === 0) return { items: [], meta }

  const ts = todayStr()
  const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

  const items: DepartingSoonItem[] = []

  for (const trip of syncedTrips) {
    meta.tourcmsCallsAttempted++
    try {
      const result = await tourcms.showDatesAndDeals(trip.palisis_id!, {
        startdate_start: ts,
        startdate_end: in7Days,
      })
      if (!result.ok) {
        meta.tourcmsCallsFailed++
        const errStr = `trip ${trip.id}/palisis ${trip.palisis_id}: ${result.error ?? "unknown"}`
        meta.tourcmsErrors.push(errStr)
        console.warn("[departing-soon] showDatesAndDeals failed:", errStr)
        continue
      }
      if (!Array.isArray(result.dates) || result.dates.length === 0) continue

      // Keep only open slots that haven't departed yet
      const openSlots = (result.dates as Record<string, unknown>[]).filter((d) => {
        const status = d.status as string | undefined
        const isOpen = !status || status === "OPEN" || status === "AVAILABLE"
        if (!isOpen) return false
        return isInFuture(d.start_date as string, (d.start_time as string) ?? "00:00")
      })
      if (openSlots.length === 0) continue

      // Pick the earliest remaining slot
      openSlots.sort((a, b) =>
        `${a.start_date}T${a.start_time ?? "00:00"}`.localeCompare(
          `${b.start_date}T${b.start_time ?? "00:00"}`
        )
      )
      const slot = openSlots[0]
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
    } catch (err) {
      meta.tourcmsCallsFailed++
      const errMsg = err instanceof Error ? err.message : String(err)
      const errStr = `trip ${trip.id}/palisis ${trip.palisis_id}: ${errMsg}`
      meta.tourcmsErrors.push(errStr)
      console.warn("[departing-soon] showDatesAndDeals threw:", errStr)
    }
  }

  const sorted = items
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    .slice(0, 5)
  return { items: sorted, meta }
}

async function fetchFromDB(): Promise<DepartingSoonItem[]> {
  const ts = todayStr()

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
    .filter(
      (d) =>
        d.status !== "cancelled" &&
        d.date >= ts &&
        isInFuture(d.date, d.time)
    )
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
