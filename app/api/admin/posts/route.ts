import { NextResponse } from "next/server"
import { dbListPosts, dbCreatePost } from "@/lib/db/queries"
import { revalidatePath } from "next/cache"

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
    if (!data.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }
    const post = await dbCreatePost(data)
    revalidatePath("/admin/blog")
    revalidatePath("/blog")
    return NextResponse.json(post, { status: 201 })
  } catch (err) {
    console.error("[admin/posts] POST error:", err)
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 })
  }
}
