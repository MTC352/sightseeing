import { NextResponse } from "next/server"
import { blogStore } from "@/lib/admin-store"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  
  // Find post by slug
  let post = null
  for (const p of blogStore.values()) {
    if (p.slug === slug && p.status === "published") {
      post = p
      break
    }
  }

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 })
  }

  return NextResponse.json(post)
}
