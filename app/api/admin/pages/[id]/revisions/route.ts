import { NextResponse } from "next/server"
import { dbGetPageRevisions, dbCreatePageRevision } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("pages")
    const { id } = await params
    const revisions = await dbGetPageRevisions(id)
    return NextResponse.json(revisions)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/pages/[id]/revisions] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pages")
    const { id } = await params
    const data = await req.json()
    const revision = await dbCreatePageRevision(id, data, data.label)
    void logActivity({
      actor: session,
      action: "page_revision.create",
      entityType: "page_revision",
      entityId: String((revision as { id?: string | number } | null)?.id ?? id),
      summary: `Created revision for page ${id}`,
      context: { pageId: id },
    })
    return NextResponse.json(revision, { status: 201 })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/pages/[id]/revisions] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
