import { NextResponse } from "next/server"
import { dbGetPost, dbUpdatePost, dbDeletePost } from "@/lib/db/queries"
import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("blog")
    const { id } = await params
    const post = await dbGetPost(id)
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(post)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/posts/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("blog")
    const { id } = await params
    const data = await req.json()
    const updated = await dbUpdatePost(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const slug = (updated as { slug?: string }).slug
    revalidatePath("/admin/blog")
    revalidatePath(`/admin/blog/${id}`)
    if (slug) revalidatePath(`/blog/${slug}`)
    revalidatePath("/blog")
    void logActivity({
      actor: session,
      action: "post.update",
      entityType: "post",
      entityId: id,
      summary: `Updated post "${(updated as { title?: string }).title ?? id}"`,
    })
    return NextResponse.json(updated)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/posts/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("blog")
    const { id } = await params
    const post = await dbGetPost(id) as { slug?: string; title?: string } | null
    await dbDeletePost(id)
    revalidatePath("/admin/blog")
    revalidatePath("/blog")
    if (post?.slug) revalidatePath(`/blog/${post.slug}`)
    void logActivity({
      actor: session,
      action: "post.delete",
      entityType: "post",
      entityId: id,
      summary: `Deleted post "${post?.title ?? id}"`,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/posts/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
