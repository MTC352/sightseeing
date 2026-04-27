import { NextResponse } from "next/server"
import { dbListPosts, dbCreatePost } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await dbListPosts())
  } catch (err) {
    console.error("[admin/posts] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const post = await dbCreatePost(data)
    return NextResponse.json(post, { status: 201 })
  } catch (err) {
    console.error("[admin/posts] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
