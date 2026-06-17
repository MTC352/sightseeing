import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbUpdateTripTag, dbDeleteTripTag } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const session = await requirePermission("trips")
    const { slug } = await params
    const body = await req.json()
    const patch: Record<string, unknown> = {}
    if (typeof body?.label === "string") patch.label = body.label.trim()
    if (typeof body?.show_on_homepage === "boolean") patch.show_on_homepage = body.show_on_homepage
    if (Number.isFinite(body?.sort_order)) patch.sort_order = Number(body.sort_order)
    const tag = await dbUpdateTripTag(slug, patch)
    if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 })
    void logActivity({
      actor: session,
      action: "trip_tag.update",
      entityType: "trip_tag",
      entityId: slug,
      summary: `Updated trip tag "${(tag as { label?: string }).label ?? slug}"`,
    })
    revalidatePath("/")
    revalidatePath("/admin/trip-tags")
    return NextResponse.json(tag)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/trip-tags/:slug] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const session = await requirePermission("trips")
    const { slug } = await params
    await dbDeleteTripTag(slug)
    void logActivity({
      actor: session,
      action: "trip_tag.delete",
      entityType: "trip_tag",
      entityId: slug,
      summary: `Deleted trip tag "${slug}"`,
    })
    revalidatePath("/")
    revalidatePath("/admin/trip-tags")
    return NextResponse.json({ success: true })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/trip-tags/:slug] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
