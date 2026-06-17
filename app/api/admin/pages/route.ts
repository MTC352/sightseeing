import { NextResponse } from "next/server"
import { dbListPages, dbCreatePage } from "@/lib/db/queries"
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
    await requirePermission("pages")
    return NextResponse.json(await dbListPages())
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/pages] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("pages")
    const data = await req.json()
    if (!data.slug || !data.title) {
      return NextResponse.json({ error: "slug and title are required" }, { status: 400 })
    }
    const page = await dbCreatePage(data)
    void logActivity({
      actor: session,
      action: "page.create",
      entityType: "page",
      entityId: (page as { id?: string | number } | null)?.id,
      summary: `Created page "${data.title}"`,
    })
    return NextResponse.json(page, { status: 201 })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/pages] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
