// ─────────────────────────────────────────────────────────────────────────────
// Single-trip Palisis sync helper.
//
// ⚠️  ONE-WAY ONLY: Palisis (TourCMS) → our DB.
// We NEVER push trip edits, prices, descriptions, or any data back to Palisis.
// Every sync re-fetches the tour from TourCMS and overrides our DB row.
// ─────────────────────────────────────────────────────────────────────────────

import { getTourCMSClient } from "@/lib/tourcms"
import { mapTourDetailToTrip, mappedToUpdatePayload } from "@/lib/palisis-mapper"
import { localizeImageUrls } from "@/lib/media-upload"
import {
  dbListTrips,
  dbCreateTrip,
  dbUpdateTrip,
  dbInsertPalisisSyncLog,
  dbGetImportExcludedFields,
} from "@/lib/db/queries"

/**
 * Download a mapped trip's remote Palisis/TourCMS images onto our own system and
 * rewrite `mapped.image` / `mapped.gallery` to the stored local URLs, so the
 * imported trip references our media library instead of hot-linking the upstream
 * CDN. Mutates `mapped` in place. Fail-soft: any image that can't be downloaded
 * keeps its original remote URL.
 *
 * ⚠️ ONE-WAY: this only READS images from Palisis — it never pushes anything back.
 */
export async function localizeMappedImages(
  mapped: { image?: string; gallery?: string[] },
  uploadedBy: string | null = null,
): Promise<void> {
  const gallery = Array.isArray(mapped.gallery) ? mapped.gallery : []
  const all = [mapped.image, ...gallery].filter((u): u is string => typeof u === "string" && u.length > 0)
  if (all.length === 0) return

  const map = await localizeImageUrls(all, uploadedBy)
  if (map.size === 0) return

  if (gallery.length > 0) {
    mapped.gallery = gallery.map((u) => map.get(u) ?? u)
  }
  if (mapped.image) {
    mapped.image = map.get(mapped.image) ?? mapped.image
  }
}

export interface SingleSyncResult {
  ok: boolean
  action: "created" | "updated" | "skipped" | "error"
  palisisId: string
  tripId?: string
  title?: string
  error?: string
  duration_ms: number
}

/**
 * Sync a single trip from Palisis/TourCMS into our DB by palisis_id.
 * Always overrides existing row (or creates one if missing).
 *
 * Pulls the FULL `showTour` response (all rich fields — tour type, trip tags,
 * departure location, included/excluded, itinerary, etc.) and stores them via
 * the shared mapper.
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

  const mapped = mapTourDetailToTrip(detail.tour)
  // Download the tour's images onto our system (recorded in the media library)
  // and rewrite the URLs to local copies before persisting. Fail-soft.
  await localizeMappedImages(mapped)
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
    // Apply the admin-default override exclusions so manually-kept fields (e.g. a
    // hand-edited description) survive webhook/manual single-tour re-syncs too.
    const excludeFields = await dbGetImportExcludedFields()
    const payload = mappedToUpdatePayload(mapped, { preservePermalink: !!local.permalink, excludeFields })
    if (!excludeFields.includes("title")) payload.title = title
    await dbUpdateTrip(local.id, payload)
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
