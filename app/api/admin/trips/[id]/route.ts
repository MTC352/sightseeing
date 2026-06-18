import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbGetTrip, dbUpdateTrip, dbDeleteTrip, dbGetIntegration } from "@/lib/db/queries"
import { resolvePolicy, isFieldEditable, TRIP_FIELDS, type TripFieldPolicy } from "@/lib/trip-field-policy"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { liveScoreForTrip } from "@/lib/seo/score"
import { syncGoogleRatingForTrip } from "@/lib/google-rating-sync"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

/**
 * Defense-in-depth: strip any field the current policy marks "readonly"
 * from an incoming PATCH body. The UI already gates inputs, but a stale
 * client or hand-crafted request must NEVER overwrite a read-only field
 * (these are typically owned by Palisis one-way sync).
 */
/**
 * SEO is owned exclusively by the AI optimizer route (`/api/admin/trips/[id]/seo`),
 * exactly like Palisis owns the base catalog fields. The trip edit form spreads its
 * whole `form` object into this PATCH, and that `form` is seeded once at mount — so
 * after an "Optimize SEO via AI → Accept & Save" it still carries the STALE (pre-
 * optimize, usually null) seo_* values. Letting them through would clobber the freshly
 * persisted SEO (the "saved SEO still shows No SEO / old data" bug). We therefore strip
 * every SEO-owned key here before writing; the score is still recomputed below.
 */
const SEO_OWNED_KEYS = new Set([
  "seoKeyword", "seoTitle", "seoMetaDescription", "seoBody", "seoHighlights",
  "seoSlug", "seoScore", "seoOptimizedAt", "seoOptimizedBy", "seoSourceHashes",
])

async function filterByPolicy<T extends Record<string, unknown>>(data: T): Promise<{ filtered: Partial<T>; stripped: string[] }> {
  let policy: TripFieldPolicy
  try {
    const row = (await dbGetIntegration("trip_field_policy")) as { value?: string } | null
    const stored = row?.value ? JSON.parse(row.value) : null
    policy = resolvePolicy(stored)
  } catch {
    policy = resolvePolicy(null)
  }
  const known = new Set(TRIP_FIELDS.map(f => f.key))
  const filtered: Record<string, unknown> = {}
  const stripped: string[] = []
  for (const [k, v] of Object.entries(data)) {
    if (known.has(k) && !isFieldEditable(policy, k)) {
      stripped.push(k)
      continue
    }
    filtered[k] = v
  }
  return { filtered: filtered as Partial<T>, stripped }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("trips")
    const { id } = await params
    const trip = await dbGetTrip(id)
    if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(trip)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/trips/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("trips")
    const { id } = await params
    const data = await req.json()
    // Defense-in-depth: SEO-owned columns are written ONLY by the /seo route.
    for (const k of SEO_OWNED_KEYS) {
      if (k in (data as Record<string, unknown>)) delete (data as Record<string, unknown>)[k]
    }
    const { filtered, stripped } = await filterByPolicy(data as Record<string, unknown>)
    if (stripped.length) {
      console.warn(`[admin/trips/${id}] PATCH: stripped read-only fields:`, stripped)
    }
    const updated = await dbUpdateTrip(id, filtered)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Auto-refresh the SEO score so it never represents stale content. We do NOT
    // regenerate the optimised seo_* text here (that requires the AI optimizer) —
    // staleness vs the last optimization is tracked separately via seo_source_hashes
    // and surfaced as an "Outdated" badge. But the deterministic score IS recomputed
    // from the trip's current effective fields (image/highlights/slug/seo_* etc.) so
    // the stored number always matches what the optimizer shows.
    let finalTrip = updated as Record<string, unknown>
    if (finalTrip.seoOptimizedAt) {
      const freshScore = liveScoreForTrip(finalTrip)
      if (freshScore !== finalTrip.seoScore) {
        const rescored = await dbUpdateTrip(id, { seoScore: freshScore })
        if (rescored) finalTrip = rescored as Record<string, unknown>
      }
    }

    revalidatePath("/admin/trips")
    revalidatePath("/")
    void logActivity({
      actor: session,
      action: "trip.update",
      entityType: "trip",
      entityId: id,
      summary: `Updated trip "${(finalTrip as { title?: string }).title ?? id}"`,
    })

    // When a Google Business URL is saved, immediately sync the rating so
    // preview cards show the correct star rating / review count right away.
    if (filtered.googleBusinessUrl) {
      void syncGoogleRatingForTrip(id).catch(() => {})
    }

    return NextResponse.json({ ...finalTrip, _strippedReadOnly: stripped.length ? stripped : undefined })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/trips/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("trips")
    const { id } = await params
    await dbDeleteTrip(id)
    revalidatePath("/admin/trips")
    revalidatePath("/")
    void logActivity({
      actor: session,
      action: "trip.delete",
      entityType: "trip",
      entityId: id,
      summary: `Deleted trip ${id}`,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/trips/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
