import { NextResponse } from "next/server"
import { listPosts } from "@/lib/admin-store"

export const dynamic = "force-dynamic"

export async function GET() {
  const posts = listPosts().filter((p) => p.status === "published")
  return NextResponse.json(posts)
}
