import { NextResponse } from "next/server"
import { dbGetPost, dbUpdatePost, dbDeletePost } from "@/lib/db/queries"
import { revalidatePath } from "next/cache"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const post = await dbGetPost(id)
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(post)
  } catch (err) {
    console.error("[admin/posts/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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
    console.error("[admin/posts/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const post = await dbGetPost(id) as { slug?: string } | null
    await dbDeletePost(id)
    revalidatePath("/admin/blog")
    revalidatePath("/blog")
    if (post?.slug) revalidatePath(`/blog/${post.slug}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[admin/posts/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
