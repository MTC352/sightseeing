import { NextResponse } from "next/server"
import { getTourCMSClient } from "@/lib/tourcms"
import type { TourDetail, TourSummary } from "@/lib/tourcms"
import { dbGetSettings, dbCreateTrip, dbUpdateTrip, dbListTrips } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

// ── Field mapping: TourCMS Show Tour response → our trips DB schema ───────────
//
// Called with the full TourDetail from /c/tour/show.xml.
// Fields come from the lean TourSummary (listTours) as fallback
// when showTour is skipped (e.g. for unchanged tours in incremental sync).
//
function mapTourDetail(t: TourDetail | TourSummary) {
  const full = t as TourDetail

  const tourId  = String(t.tour_id ?? "")
  const title   = String(t.tour_name_long ?? t.tour_name ?? "")

  // Prefer rich description from showTour; fall back to lean summary fields
  const desc    = String(
    full.shortdesc ?? full.summary ?? (t as TourSummary).description ?? (t as TourSummary).tagline ?? ""
  )

  const price   = parseFloat(String(t.from_price ?? "0")) || 0

  // First image from the images[] array (showTour only), then lean thumbnail
  const images  = full.images?.image
  const image   = String(
    (Array.isArray(images) ? images[0]?.url ?? images[0]?.url_thumbnail : undefined)
    ?? (t as TourSummary).image_url
    ?? full.thumbnail_image
    ?? ""
  )

  // duration_desc from showTour is human-readable (e.g. "3 hours"); prefer it
  const duration = String(full.duration_desc ?? t.duration ?? (t as TourSummary).duration_description ?? "")

  const location = String(t.location ?? (t as TourSummary).location_summary ?? "Luxembourg")

  const supplier = String((t as TourSummary).supplier_name ?? "Sightseeing.lu")

  // Use the TourCMS book_url as the permalink if we don't already have one.
  // This allows /trip/[id] to surface the correct per-tour Palisis booking link.
  const palisisBookUrl = String(full.book_url ?? t.tour_url ?? "")

  return {
    palisisId:        tourId,
    title,
    description:      desc,
    price,
    duration,
    // Default category to "Tours" — admin can refine in /admin/trips/[id]
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
    // Store the per-tour Palisis booking URL so booking iframes can be dynamic
    permalink:        palisisBookUrl || null,
    originalPrice:    null,
  }
}

// ── POST /api/admin/palisis-import ────────────────────────────────────────────
//
// Correct import flow (as a Marketplace Agent):
//   1. GET /p/tours/list.xml  (channelId=0) — lean list of ALL tours
//   2. For each new tour: GET /c/tour/show.xml — full detail for DB storage
//   3. For existing tours in override mode: same
//   4. For existing tours without changes: skip (diff by title/description)
//
// This correctly uses listTours, NOT searchTours.
// searchTours (/c/tours/search.xml) is for customer-facing keyword search only.
//
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { override?: boolean }
  const overrideAll = body.override === true

  const tourcms = await getTourCMSClient()

  if (!tourcms) {
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

  // Step 1: Fetch lean tour list from /p/tours/list.xml (correct import endpoint)
  // We omit per_page to use TourCMS default (75), which is fine for most accounts.
  // Add per_page: 200 if needed for accounts with many tours.
  const listResult = await tourcms.listTours()

  if (!listResult.ok) {
    return NextResponse.json({
      ok: false,
      error: `TourCMS list failed: ${listResult.error}`,
      imported: 0,
      skipped: 0,
      total: 0,
    }, { status: 502 })
  }

  const tourList  = listResult.tours
  const existing  = await dbListTrips() as Array<{
    id: string
    palisis_id?: string
    title?: string
    description?: string
    permalink?: string
  }>
  const byPalisis = new Map(
    existing.filter(t => t.palisis_id).map(t => [t.palisis_id!, t])
  )

  let imported  = 0
  let skipped   = 0
  let updated   = 0
  let apiErrors = 0
  const diffs: Array<{ palisisId: string; title: string; localTitle?: string }> = []

  for (const lean of tourList) {
    const palisisId = String(lean.tour_id ?? "")
    if (!palisisId) { skipped++; continue }

    const localTrip = byPalisis.get(palisisId)

    try {
      if (!localTrip) {
        // ── New tour: fetch full detail then create in DB ──────────────────
        const detail = await tourcms.showTour(String(lean.tour_id), { show_options: "1" })
        if (!detail.ok || !detail.tour) {
          console.warn(`[palisis-import] showTour failed for ${palisisId}: ${detail.error}`)
          // Fall back to lean summary data so we don't skip the tour entirely
          await dbCreateTrip(mapTourDetail(lean))
          apiErrors++
        } else {
          await dbCreateTrip(mapTourDetail(detail.tour))
        }
        imported++

      } else if (overrideAll) {
        // ── Bulk override: re-fetch full detail and apply ──────────────────
        const detail = await tourcms.showTour(String(lean.tour_id), { show_options: "1" })
        if (!detail.ok || !detail.tour) {
          console.warn(`[palisis-import] showTour failed for ${palisisId}: ${detail.error}`)
          apiErrors++
          skipped++
          continue
        }
        const mapped = mapTourDetail(detail.tour)
        await dbUpdateTrip(localTrip.id, {
          title:       mapped.title,
          description: mapped.description,
          price:       mapped.price,
          duration:    mapped.duration,
          image:       mapped.image,
          city:        mapped.city,
          provider:    mapped.provider,
          // Only update permalink if the local trip doesn't already have a custom one
          ...(localTrip.permalink ? {} : { permalink: mapped.permalink }),
        })
        updated++

      } else {
        // ── Existing tour, no override: compare title/description ──────────
        // Use lean list data for the comparison (no extra API call)
        const leanMapped = mapTourDetail(lean)
        const titleDiff  = localTrip.title !== leanMapped.title
        const descDiff   = (localTrip.description ?? "") !== leanMapped.description

        if (titleDiff || descDiff) {
          diffs.push({
            palisisId,
            title:      leanMapped.title,
            localTitle: localTrip.title,
          })
        } else {
          skipped++
        }
      }
    } catch (err) {
      console.error(`[palisis-import] Error processing tour ${palisisId}:`, err)
      skipped++
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    updated,
    skipped,
    total: tourList.length,
    apiErrors: apiErrors > 0 ? apiErrors : undefined,
    diffs,
    note: [
      `Fetched ${tourList.length} tours from TourCMS via /p/tours/list.xml.`,
      imported > 0  ? `${imported} new trips created (with full detail from /c/tour/show.xml).` : null,
      updated  > 0  ? `${updated} existing trips updated (override mode).` : null,
      diffs.length > 0 ? `${diffs.length} trips have upstream changes — re-import with override:true to apply.` : null,
      apiErrors > 0 ? `${apiErrors} tours fell back to lean data (showTour API error).` : null,
    ].filter(Boolean).join(" "),
  })
}
