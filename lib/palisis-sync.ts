// ─────────────────────────────────────────────────────────────────────────────
// Single-trip Palisis sync helper.
//
// ⚠️  ONE-WAY ONLY: Palisis (TourCMS) → our DB.
// We NEVER push trip edits, prices, descriptions, or any data back to Palisis.
// Every sync re-fetches the tour from TourCMS and overrides our DB row.
// ─────────────────────────────────────────────────────────────────────────────

import { getTourCMSClient } from "@/lib/tourcms"
import { mapTourDetailToTrip, mappedToUpdatePayload } from "@/lib/palisis-mapper"
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
    // Preserve manually-set permalink if present
    const payload = mappedToUpdatePayload(mapped, { preservePermalink: !!local.permalink })
    payload.title = title
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
