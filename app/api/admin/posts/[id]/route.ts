import { NextResponse } from "next/server"
import { dbGetPost, dbUpdatePost, dbDeletePost } from "@/lib/db/queries"
import { revalidatePath } from "next/cache"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    const post = await dbGetPost(id)
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(post)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/posts/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    const data = await req.json()
    const updated = await dbUpdatePost(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const slug = (updated as { slug?: string }).slug
    revalidatePath("/admin/blog")
    revalidatePath(`/admin/blog/${id}`)
    if (slug) revalidatePath(`/blog/${slug}`)
    revalidatePath("/blog")
    return NextResponse.json(updated)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/posts/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    const post = await dbGetPost(id) as { slug?: string } | null
    await dbDeletePost(id)
    revalidatePath("/admin/blog")
    revalidatePath("/blog")
    if (post?.slug) revalidatePath(`/blog/${post.slug}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/posts/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
