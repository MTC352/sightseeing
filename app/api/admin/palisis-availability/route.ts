import { NextResponse } from "next/server"
import { getTourCMSClient } from "@/lib/tourcms"
import { dbListTrips } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function POST() {
  try { await requireAdminSession() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const tourcms = await getTourCMSClient()

  if (!tourcms) {
    return NextResponse.json({
      ok: false,
      error: "TourCMS not configured — add credentials in Admin → Integrations or secrets",
      updated: 0,
      slots: [],
    }, { status: 503 })
  }

  // Get all our trips that have a palisis_id (synced from TourCMS)
  const allTrips = await dbListTrips() as Array<{
    id: string
    title: string
    palisis_id?: string
  }>
  const syncedTrips = allTrips.filter(t => t.palisis_id)

  if (syncedTrips.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "No trips with TourCMS IDs found — run the catalog import first",
      updated: 0,
      slots: [],
    })
  }

  // Fetch availability for the next 7 days for each synced trip
  const today   = new Date()
  const in7Days = new Date(today)
  in7Days.setDate(today.getDate() + 7)

  const startStr = today.toISOString().slice(0, 10)
  const endStr   = in7Days.toISOString().slice(0, 10)

  const slots: Array<{
    tripId: string
    tripTitle: string
    palisisId: string
    startDate: string
    startTime?: string
    endTime?: string
    price: string
    priceDisplay: string
    spacesRemaining: number | null
    status: string
    hasOffer: boolean
  }> = []

  let updated = 0

  for (const trip of syncedTrips) {
    const result = await tourcms.showDatesAndDeals(trip.palisis_id!, {
      startdate_start: startStr,
      startdate_end:   endStr,
    })

    if (!result.ok) {
      console.warn(`[palisis-availability] Failed for trip ${trip.palisis_id}: ${result.error}`)
      continue
    }

    for (const date of result.dates) {
      slots.push({
        tripId:          trip.id,
        tripTitle:       trip.title,
        palisisId:       trip.palisis_id!,
        startDate:       date.start_date,
        startTime:       date.start_time,
        endTime:         date.end_time,
        price:           date.price_1,
        priceDisplay:    date.price_1_display,
        spacesRemaining: date.spaces_remaining != null ? Number(date.spaces_remaining) : null,
        status:          date.status ?? "OPEN",
        hasOffer:        Number(date.special_offer_type ?? 0) > 0,
      })
    }

    updated++
  }

  return NextResponse.json({
    ok: true,
    updated,
    total: syncedTrips.length,
    slots,
    note: `Fetched availability from TourCMS for ${updated}/${syncedTrips.length} synced trips (next 7 days)`,
  })
}
