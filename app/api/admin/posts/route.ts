import { NextResponse } from "next/server"
import { createPost, listPosts } from "@/lib/admin-store"
import type { AdminPost } from "@/lib/admin-store"

export async function GET() {
  return NextResponse.json(listPosts())
}

export async function POST(req: Request) {
  const data: Omit<AdminPost, "id"> = await req.json()
  const post = createPost(data)
  return NextResponse.json(post, { status: 201 })
}
