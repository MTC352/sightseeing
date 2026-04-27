import { NextResponse } from "next/server"
import { queryOne } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const post = await queryOne(`
      SELECT id, slug, title, excerpt, body, image, author, category, tags,
             status, published_at as "publishedAt", read_time as "readTime",
             seo_title as "seoTitle", seo_description as "seoDescription",
             created_at, updated_at
      FROM blog_posts WHERE slug = $1 AND status = 'published'
    `, [slug])

    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })
    return NextResponse.json(post)
  } catch (err) {
    console.error("[api/blog/:slug] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
