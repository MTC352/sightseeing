import { NextResponse } from "next/server"
import { dbGetRedirect, dbUpdateRedirect, dbDeleteRedirect, dbResolve404ByPath } from "@/lib/db/queries"
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("blog")
    const { id } = await params
    const redirect = await dbGetRedirect(id)
    if (!redirect) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(redirect)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/blog-redirects/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("blog")
    const { id } = await params
    const data = await req.json()
    const updated = await dbUpdateRedirect(id, { ...data, userId: session?.id })
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const source = (updated as { sourcePath?: string })?.sourcePath
    if (source) await dbResolve404ByPath(source)
    revalidatePath("/admin/blog-redirects")
    void logActivity({
      actor: session,
      action: "redirect.update",
      entityType: "blog_redirect",
      entityId: id,
      summary: `Updated redirect ${source ?? id}`,
    })
    return NextResponse.json(updated)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (isDuplicate(err)) return NextResponse.json({ error: "A redirect for that path already exists" }, { status: 409 })
    if (err instanceof Error && err.message === "INVALID_SOURCE") {
      return NextResponse.json({ error: "Old path is invalid" }, { status: 400 })
    }
    console.error("[admin/blog-redirects/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("blog")
    const { id } = await params
    const existing = await dbGetRedirect(id) as { sourcePath?: string } | null
    await dbDeleteRedirect(id)
    revalidatePath("/admin/blog-redirects")
    void logActivity({
      actor: session,
      action: "redirect.delete",
      entityType: "blog_redirect",
      entityId: id,
      summary: `Deleted redirect ${existing?.sourcePath ?? id}`,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/blog-redirects/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
