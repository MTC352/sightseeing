import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth-server"
import { dbListTrips, dbUpdateTrip } from "@/lib/db/queries"
import { localizeImageUrls } from "@/lib/media-upload"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"
// Downloading many trip images can take a while — give the handler headroom.
export const maxDuration = 120

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

/**
 * POST /api/admin/media/backfill-trips
 *
 * One-shot maintenance action: scan every trip, download any remote
 * (http/https) featured- or gallery-image URLs onto our own system (recording
 * them in the media library), and rewrite the trip rows to point at the stored
 * local copies. Idempotent — already-local URLs and previously-imported remote
 * URLs are skipped (deduped by source_url + content hash). Fail-soft per image.
 *
 * Gated by the `files` permission (this route sits under /api/admin/media, which
 * the proxy maps to the Files section).
 */
export async function POST() {
  let session
  try {
    session = await requirePermission("files")
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }

  try {
    const trips = (await dbListTrips()) as Array<{
      id: string
      image?: string | null
      gallery?: string[] | null
    }>

    let tripsScanned = 0
    let tripsUpdated = 0
    let imagesImported = 0
    let imagesFailed = 0

    for (const trip of trips) {
      tripsScanned++
      const featured = typeof trip.image === "string" ? trip.image : ""
      const gallery = Array.isArray(trip.gallery) ? trip.gallery : []
      const remote = [featured, ...gallery].filter(
        (u): u is string => typeof u === "string" && /^https?:\/\//i.test(u),
      )
      if (remote.length === 0) continue

      const map = await localizeImageUrls(remote, session.id)
      imagesImported += map.size
      imagesFailed += remote.filter((u) => !map.has(u)).length
      if (map.size === 0) continue

      const newFeatured = featured ? map.get(featured) ?? featured : featured
      const newGallery = gallery.map((u) => map.get(u) ?? u)

      const featuredChanged = newFeatured !== featured
      const galleryChanged = newGallery.some((u, i) => u !== gallery[i])
      if (!featuredChanged && !galleryChanged) continue

      const payload: Record<string, unknown> = {}
      if (featuredChanged) payload.image = newFeatured
      if (galleryChanged) payload.gallery = newGallery
      await dbUpdateTrip(trip.id, payload)
      tripsUpdated++
    }

    void logActivity({
      actor: session,
      action: "file.backfill_trips",
      entityType: "file",
      summary: `Imported trip images into the media library: ${imagesImported} images across ${tripsUpdated} trips`,
      context: { tripsScanned, tripsUpdated, imagesImported, imagesFailed },
    })

    return NextResponse.json({
      ok: true,
      tripsScanned,
      tripsUpdated,
      imagesImported,
      imagesFailed,
    })
  } catch (err) {
    console.error("[admin/media/backfill-trips] error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backfill failed" },
      { status: 500 },
    )
  }
}
