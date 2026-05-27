import { NextResponse } from "next/server"
import { dbGetPageRevisions, dbCreatePageRevision } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    const revisions = await dbGetPageRevisions(id)
    return NextResponse.json(revisions)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/pages/[id]/revisions] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    const data = await req.json()
    const revision = await dbCreatePageRevision(id, data, data.label)
    return NextResponse.json(revision, { status: 201 })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/pages/[id]/revisions] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
