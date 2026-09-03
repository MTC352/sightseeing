import { NextResponse } from "next/server"
import { dbGetTripRedirect, dbUpdateTripRedirect, dbDeleteTripRedirect, dbResolve404ByPath } from "@/lib/db/queries"
import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { tripRedirectError } from "@/lib/trip-redirect-http"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}
function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("trips")
    const { id } = await params
    const redirect = await dbGetTripRedirect(id)
    if (!redirect) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(redirect)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/trip-redirects/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("trips")
    const { id } = await params
    const data = await req.json()
    const updated = await dbUpdateTripRedirect(id, { tripId: data.tripId, slug: data.slug })
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const slug = (updated as { slug?: string })?.slug
    if (slug) await dbResolve404ByPath(`/trip/${slug}`)
    revalidatePath("/admin/trip-redirects")
    void logActivity({
      actor: session,
      action: "trip_redirect.update",
      entityType: "trip_redirect",
      entityId: id,
      summary: `Updated trip redirect /trip/${slug ?? id}`,
    })
    return NextResponse.json(updated)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const mapped = tripRedirectError(err)
    if (mapped) return mapped
    console.error("[admin/trip-redirects/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("trips")
    const { id } = await params
    const existing = (await dbGetTripRedirect(id)) as { slug?: string } | null
    await dbDeleteTripRedirect(id)
    revalidatePath("/admin/trip-redirects")
    void logActivity({
      actor: session,
      action: "trip_redirect.delete",
      entityType: "trip_redirect",
      entityId: id,
      summary: `Deleted trip redirect /trip/${existing?.slug ?? id}`,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/trip-redirects/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
