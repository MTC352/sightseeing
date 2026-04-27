import { NextResponse } from "next/server"
import { dbRestorePageRevision } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> }
) {
  try {
    const { id, revisionId } = await params
    const result = await dbRestorePageRevision(id, revisionId)
    if (!result) return NextResponse.json({ error: "Revision not found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (err) {
    console.error("[admin/pages/[id]/revisions/[revisionId]/restore] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
