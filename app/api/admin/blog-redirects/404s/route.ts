import { NextResponse } from "next/server"
import { dbList404s, dbUpdate404Status } from "@/lib/db/queries"
import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}
function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET(req: Request) {
  try {
    await requirePermission("blog")
    const status = new URL(req.url).searchParams.get("status") ?? undefined
    return NextResponse.json(await dbList404s(status))
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/blog-redirects/404s] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    await requirePermission("blog")
    const { id, status } = await req.json()
    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 })
    }
    const updated = await dbUpdate404Status(id, status)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    revalidatePath("/admin/blog-redirects")
    return NextResponse.json(updated)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (err instanceof Error && err.message === "INVALID_STATUS") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }
    console.error("[admin/blog-redirects/404s] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
