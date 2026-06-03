import { NextResponse } from "next/server"
import { dbRestorePageRevision } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> }
) {
  try {
    const session = await requireAdminSession()
    const { id, revisionId } = await params
    const result = await dbRestorePageRevision(id, revisionId)
    if (!result) return NextResponse.json({ error: "Revision not found" }, { status: 404 })
    void logActivity({
      actor: session,
      action: "page_revision.restore",
      entityType: "page_revision",
      entityId: revisionId,
      summary: `Restored revision ${revisionId} for page ${id}`,
    })
    return NextResponse.json(result)
  } catch (err: unknown) {
    if (err instanceof Error && (err as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[admin/pages/[id]/revisions/[revisionId]/restore] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
