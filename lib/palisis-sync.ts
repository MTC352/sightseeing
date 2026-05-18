// ─────────────────────────────────────────────────────────────────────────────
// Single-trip Palisis sync helper.
//
// ⚠️  ONE-WAY ONLY: Palisis (TourCMS) → our DB.
// We NEVER push trip edits, prices, descriptions, or any data back to Palisis.
// Every sync re-fetches the tour from TourCMS and overrides our DB row.
// ─────────────────────────────────────────────────────────────────────────────

import { getTourCMSClient } from "@/lib/tourcms"
import type { TourDetail } from "@/lib/tourcms"
import {
  dbListTrips,
  dbCreateTrip,
  dbUpdateTrip,
  dbInsertPalisisSyncLog,
} from "@/lib/db/queries"

export interface SingleSyncResult {
  ok: boolean
  action: "created" | "updated" | "skipped" | "error"
  palisisId: string
  tripId?: string
  title?: string
  error?: string
  duration_ms: number
}

function mapTourDetail(t: TourDetail) {
  const tourId = String(t.tour_id ?? "")
  const title  = String(t.tour_name_long ?? t.tour_name ?? "")
  const desc   = String(t.shortdesc ?? t.summary ?? "")
  const price  = parseFloat(String(t.from_price ?? "0")) || 0

  // Extract all gallery images from Palisis — images.image is an array of image objects
  const rawImages = t.images?.image
  const imageList = Array.isArray(rawImages) ? rawImages : (rawImages ? [rawImages] : [])
  // Pick the best URL for each image (xlarge → large → url → thumbnail)
  const galleryUrls: string[] = imageList
    .map(img => String(img.url_xlarge ?? img.url_large ?? img.url ?? img.url_thumbnail ?? ""))
    .filter(Boolean)

  // Featured image = first gallery image, or thumbnail fallback
  const image = galleryUrls[0] ?? String(t.thumbnail_image ?? "")
  // Full gallery = all distinct images; include thumbnail if nothing else
  const gallery = galleryUrls.length > 0
    ? galleryUrls
    : (t.thumbnail_image ? [String(t.thumbnail_image)] : [])

  const duration = String(t.duration_desc ?? t.duration ?? "")
  const location = String(t.location ?? "Luxembourg")
  const supplier = String((t as { supplier_name?: string }).supplier_name ?? "Sightseeing.lu")

  return {
    palisisId:   tourId,
    title,
    description: desc,
    price,
    duration,
    category:    "Tours",
    tags:        [] as string[],
    city:        location,
    provider:    supplier,
    image,
    gallery,
    highlights:  [] as string[],
    badge:       null,
    rating:      0,
    reviewCount: 0,
    featured:    false,
    featuredDeparture: false,
    status:      "published" as const,
    permalink:   String(t.book_url ?? t.tour_url ?? "") || null,
    originalPrice: null,
  }
}

/**
 * Sync a single trip from Palisis/TourCMS into our DB by palisis_id.
 * Always overrides existing row (or creates one if missing).
 *
 * @param triggerType — "webhook" | "manual" — recorded in palisis_sync_log
 * @param channelId   — optional TourCMS channel_id for the tour
 */
export async function syncSingleTripFromPalisis(
  palisisId: string,
  triggerType: "webhook" | "manual" = "manual",
  channelId?: number,
): Promise<SingleSyncResult> {
  const startedAt = Date.now()
  const id = String(palisisId).trim()

  if (!id) {
    return { ok: false, action: "error", palisisId: id, error: "Missing palisisId", duration_ms: 0 }
  }

  const tourcms = await getTourCMSClient()
  if (!tourcms) {
    const error = "TourCMS not configured"
    await dbInsertPalisisSyncLog({
      trigger_type: triggerType,
      action: "single_sync",
      palisis_id: id,
      note: `FAILED: ${error}`,
      changes: { ok: false, error, palisisId: id, duration_ms: Date.now() - startedAt },
    })
    return { ok: false, action: "error", palisisId: id, error, duration_ms: Date.now() - startedAt }
  }

  const detail = await tourcms.showTour(id, { show_options: "1" }, channelId)
  if (!detail.ok || !detail.tour) {
    const error = detail.error ?? "showTour failed"
    await dbInsertPalisisSyncLog({
      trigger_type: triggerType,
      action: "single_sync",
      palisis_id: id,
      note: `FAILED: ${error}`,
      changes: { ok: false, error, palisisId: id, duration_ms: Date.now() - startedAt },
    })
    return { ok: false, action: "error", palisisId: id, error, duration_ms: Date.now() - startedAt }
  }

  const mapped = mapTourDetail(detail.tour)
  const title  = mapped.title || `Tour ${id}`

  // Find existing trip by palisis_id
  const existing = await dbListTrips() as Array<{ id: string; palisis_id?: string; permalink?: string }>
  const local    = existing.find(t => t.palisis_id === id)

  let action: "created" | "updated"
  let tripId: string

  if (!local) {
    const created = await dbCreateTrip({ ...mapped, palisisId: id, title })
    tripId = (created as { id: string }).id
    action = "created"
  } else {
    await dbUpdateTrip(local.id, {
      title:       title,
      description: mapped.description,
      price:       mapped.price,
      duration:    mapped.duration,
      image:       mapped.image,
      gallery:     mapped.gallery,
      city:        mapped.city,
      provider:    mapped.provider,
      // Preserve manually-set permalink if present
      ...(local.permalink ? {} : { permalink: mapped.permalink }),
    })
    tripId = local.id
    action = "updated"
  }

  const duration_ms = Date.now() - startedAt

  await dbInsertPalisisSyncLog({
    trigger_type: triggerType,
    action: "single_sync",
    palisis_id: id,
    note: `${action === "created" ? "Created" : "Updated"} "${title}" via ${triggerType} (${(duration_ms / 1000).toFixed(2)}s)`,
    changes: {
      ok: true,
      palisisId: id,
      tripId,
      title,
      action,
      duration_ms,
      tours: [{ palisisId: id, title, action }],
    },
  })

  return { ok: true, action, palisisId: id, tripId, title, duration_ms }
}
