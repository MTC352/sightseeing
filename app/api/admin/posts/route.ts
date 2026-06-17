import { NextResponse } from "next/server"
import { dbListPosts, dbCreatePost } from "@/lib/db/queries"
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

export async function GET() {
  try {
    await requirePermission("blog")
    return NextResponse.json(await dbListPosts())
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/posts] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("blog")
    const data = await req.json()
    if (!data.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }
    const post = await dbCreatePost(data)
    revalidatePath("/admin/blog")
    revalidatePath("/blog")
    void logActivity({
      actor: session,
      action: "post.create",
      entityType: "post",
      entityId: (post as { id?: string }).id,
      summary: `Created post "${(post as { title?: string }).title ?? data.title}"`,
    })
    return NextResponse.json(post, { status: 201 })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/posts] POST error:", err)
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 })
  }
}
