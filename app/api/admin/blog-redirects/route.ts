import { NextResponse } from "next/server"
import { dbListRedirects, dbCreateRedirect, dbResolve404ByPath } from "@/lib/db/queries"
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
function isDuplicate(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "23505"
}

export async function GET() {
  try {
    await requirePermission("blog")
    return NextResponse.json(await dbListRedirects())
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/blog-redirects] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("blog")
    const data = await req.json()
    if (!data.sourcePath?.trim()) {
      return NextResponse.json({ error: "Old path is required" }, { status: 400 })
    }
    if (!data.postId?.trim()) {
      return NextResponse.json({ error: "Target post is required" }, { status: 400 })
    }
    const redirect = await dbCreateRedirect({
      sourcePath: data.sourcePath,
      postId: data.postId,
      statusCode: data.statusCode,
      enabled: data.enabled,
      userId: session?.id,
    })
    const source = (redirect as { sourcePath?: string })?.sourcePath
    if (source) await dbResolve404ByPath(source)
    revalidatePath("/admin/blog-redirects")
    void logActivity({
      actor: session,
      action: "redirect.create",
      entityType: "blog_redirect",
      entityId: (redirect as { id?: string })?.id,
      summary: `Created redirect ${source} → post ${(redirect as { postSlug?: string })?.postSlug ?? data.postId}`,
    })
    return NextResponse.json(redirect, { status: 201 })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (isDuplicate(err)) return NextResponse.json({ error: "A redirect for that path already exists" }, { status: 409 })
    if (err instanceof Error && err.message === "INVALID_SOURCE") {
      return NextResponse.json({ error: "Old path is invalid" }, { status: 400 })
    }
    console.error("[admin/blog-redirects] POST error:", err)
    return NextResponse.json({ error: "Failed to create redirect" }, { status: 500 })
  }
}
