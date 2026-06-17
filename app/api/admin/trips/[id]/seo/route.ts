import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbGetTrip, dbUpdateTrip } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import {
  computeSeoSections,
  summarizeScore,
  scoreInputFromFields,
  computeSourceHashes,
  type SeoFields,
} from "@/lib/seo/score"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v)
}

/**
 * Persist AI/admin-optimised SEO into the trip's import-safe seo_* columns.
 * Never touches the Palisis-owned base fields. Recomputes the score and the
 * per-field source-hash snapshot (for staleness detection) server-side.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("trips")
    const { id } = await params

    const trip = (await dbGetTrip(id)) as Record<string, unknown> | null
    if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 })

    const body = await req.json()
    const incoming = (body?.fields ?? {}) as Partial<SeoFields>
    // Partial mode: only the keys present in `incoming` are changed; every other
    // SEO field keeps its CURRENT stored value (no base-content snapshotting).
    // Used by the manual snippet editor so untouched fields are never modified.
    const partial = body?.partial === true

    const existing: SeoFields = {
      seoKeyword: str(trip.seoKeyword).trim(),
      seoTitle: str(trip.seoTitle).trim(),
      seoMetaDescription: str(trip.seoMetaDescription).trim(),
      seoBody: str(trip.seoBody),
      seoHighlights: Array.isArray(trip.seoHighlights)
        ? (trip.seoHighlights as unknown[]).map((h) => str(h).trim()).filter(Boolean)
        : [],
      seoSlug: str(trip.seoSlug).trim(),
    }

    const has = (k: keyof SeoFields) => Object.prototype.hasOwnProperty.call(incoming, k)
    const pick = <K extends keyof SeoFields>(k: K, normalized: SeoFields[K]): SeoFields[K] =>
      partial && !has(k) ? existing[k] : normalized

    const fields: SeoFields = {
      seoKeyword: pick("seoKeyword", str(incoming.seoKeyword).trim()),
      seoTitle: pick("seoTitle", str(incoming.seoTitle).trim()),
      seoMetaDescription: pick("seoMetaDescription", str(incoming.seoMetaDescription).trim()),
      seoBody: pick("seoBody", str(incoming.seoBody)),
      seoHighlights: pick(
        "seoHighlights",
        Array.isArray(incoming.seoHighlights)
          ? incoming.seoHighlights.map((h) => str(h).trim()).filter(Boolean)
          : [],
      ),
      seoSlug: pick("seoSlug", str(incoming.seoSlug).trim()),
    }

    const image = str(trip.image)
    const summary = summarizeScore(computeSeoSections(scoreInputFromFields(fields, image)))
    const sourceHashes = computeSourceHashes(trip)

    const updated = await dbUpdateTrip(id, {
      seoKeyword: fields.seoKeyword || null,
      seoTitle: fields.seoTitle || null,
      seoMetaDescription: fields.seoMetaDescription || null,
      seoBody: fields.seoBody || null,
      seoHighlights: fields.seoHighlights,
      seoSlug: fields.seoSlug || null,
      seoScore: summary.score,
      seoOptimizedAt: new Date().toISOString(),
      seoOptimizedBy: session.id,
      seoSourceHashes: JSON.stringify(sourceHashes),
    } as Record<string, unknown>)

    void logActivity({
      actor: session,
      action: "trip.seo.optimize",
      summary: `Optimised SEO for trip "${str(trip.title)}" (score ${summary.score})`,
      entityType: "trip",
      entityId: id,
      context: { score: summary.score, keyword: fields.seoKeyword },
    })

    revalidatePath(`/trip/${str(trip.permalink) || id}`)
    revalidatePath(`/admin/trips/${id}`)
    revalidatePath(`/admin/trips`)

    return NextResponse.json({
      ok: true,
      score: summary.score,
      passingCount: summary.passingCount,
      totalCount: summary.totalCount,
      seoOptimizedAt: (updated as Record<string, unknown> | null)?.seoOptimizedAt ?? new Date().toISOString(),
      fields,
    })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[trips/seo] error:", err)
    return NextResponse.json({ error: "Failed to save SEO" }, { status: 500 })
  }
}
