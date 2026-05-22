import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbUpdateTripTag, dbDeleteTripTag } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const body = await req.json()
    const patch: Record<string, unknown> = {}
    if (typeof body?.label === "string") patch.label = body.label.trim()
    if (typeof body?.show_on_homepage === "boolean") patch.show_on_homepage = body.show_on_homepage
    if (Number.isFinite(body?.sort_order)) patch.sort_order = Number(body.sort_order)
    const tag = await dbUpdateTripTag(slug, patch)
    if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 })
    revalidatePath("/")
    revalidatePath("/admin/trip-tags")
    return NextResponse.json(tag)
  } catch (err) {
    console.error("[admin/trip-tags/:slug] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    await dbDeleteTripTag(slug)
    revalidatePath("/")
    revalidatePath("/admin/trip-tags")
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[admin/trip-tags/:slug] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
