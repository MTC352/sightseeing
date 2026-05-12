import { NextResponse } from "next/server"
import { getTourCMSClient } from "@/lib/tourcms"
import { dbGetSettings, dbCreateTrip, dbUpdateTrip, dbListTrips } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

// ── Field mapping: TourCMS tour summary → our trips DB schema ─────────────────
function mapTourCMSTour(t: Record<string, unknown>) {
  const tourId   = String(t.tour_id   ?? "")
  const title    = String(t.tour_name_long ?? t.tour_name ?? "")
  const desc     = String(t.description ?? t.tagline ?? "")
  const price    = parseFloat(String(t.from_price ?? "0")) || 0
  const image    = String(t.image_url ?? "")
  const location = String(t.location_summary ?? t.location ?? "Luxembourg")
  const duration = String(t.duration_description ?? "")
  const supplier = String(t.supplier_name ?? "Sightseeing.lu")

  // TourCMS doesn't have a direct category field in search results —
  // we default to "Tours" and let admin override in /admin/trips/[id]
  return {
    palisisId:        tourId,
    title,
    description:      desc,
    price,
    duration,
    category:         "Tours",
    tags:             [] as string[],
    city:             location,
    provider:         supplier,
    image,
    highlights:       [] as string[],
    badge:            null,
    rating:           0,
    reviewCount:      0,
    featured:         false,
    featuredDeparture: false,
    status:           "draft" as const,
    permalink:        null,
    originalPrice:    null,
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { override?: boolean }
  const overrideAll = body.override === true

  const tourcms = await getTourCMSClient()

  if (!tourcms) {
    // No credentials — fall back to a warning (no mock import anymore)
    const settings = await dbGetSettings()
    const hasKey   = !!(settings?.apiKeys as Record<string, string>)?.palisis
    return NextResponse.json({
      ok: false,
      imported: 0,
      skipped: 0,
      total: 0,
      error: hasKey
        ? "TourCMS Channel ID missing — set TOURCMS_CHANNEL_ID in secrets"
        : "TourCMS not configured — add API key and Channel ID in Admin → Integrations or secrets",
    }, { status: 503 })
  }

  // Fetch full catalog from TourCMS
  // 404_tour_url=all → skip broken URL validation (we're API-driven)
  // has_sale=all     → include tours without upcoming dates too
  const result = await tourcms.searchTours({ "404_tour_url": "all", has_sale: "all", per_page: 200 })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, imported: 0, skipped: 0, total: 0 }, { status: 502 })
  }

  const tours     = result.tours
  const existing  = await dbListTrips() as Array<{ id: string; palisis_id?: string; title?: string; description?: string }>
  const byPalisis = new Map(existing.filter(t => t.palisis_id).map(t => [t.palisis_id!, t]))

  let imported = 0
  let skipped  = 0
  let updated  = 0
  const diffs: Array<{ palisisId: string; title: string; localTitle?: string }> = []

  for (const tour of tours) {
    const mapped    = mapTourCMSTour(tour as unknown as Record<string, unknown>)
    const localTrip = byPalisis.get(mapped.palisisId)

    try {
      if (!localTrip) {
        // New trip — create it
        await dbCreateTrip(mapped)
        imported++
      } else if (overrideAll) {
        // Bulk override mode — apply without confirmation
        await dbUpdateTrip(localTrip.id, {
          title:       mapped.title,
          description: mapped.description,
          price:       mapped.price,
          duration:    mapped.duration,
          image:       mapped.image,
          city:        mapped.city,
          provider:    mapped.provider,
        })
        updated++
      } else {
        // Check if there's a meaningful diff (title or description changed)
        const titleDiff = localTrip.title !== mapped.title
        const descDiff  = (localTrip.description ?? "") !== mapped.description
        if (titleDiff || descDiff) {
          diffs.push({
            palisisId:  mapped.palisisId,
            title:      mapped.title,
            localTitle: localTrip.title,
          })
        } else {
          skipped++
        }
      }
    } catch {
      skipped++
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    updated,
    skipped,
    total: tours.length,
    diffs,      // non-empty = admin should review before re-importing with override:true
    note: `Fetched ${tours.length} tours from TourCMS live catalog`,
  })
}
