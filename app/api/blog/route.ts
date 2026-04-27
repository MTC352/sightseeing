import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const posts = await query(`
      SELECT id, slug, title, excerpt, image, author, category, tags,
             status, published_at as "publishedAt", read_time as "readTime",
             created_at, updated_at
      FROM blog_posts WHERE status = 'published'
      ORDER BY COALESCE(published_at, created_at) DESC
    `)
    return NextResponse.json(posts)
  } catch (err) {
    console.error("[api/blog] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
