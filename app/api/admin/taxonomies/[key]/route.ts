import { NextResponse } from "next/server"
import { dbDeleteTaxonomy, dbGetTaxonomy } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    await requirePermission("trips")
    const { key } = await params
    const taxonomy = await dbGetTaxonomy(key)
    if (!taxonomy) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(taxonomy)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/taxonomies/[key]] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const session = await requirePermission("trips")
    const { key } = await params
    await dbDeleteTaxonomy(key)
    void logActivity({
      actor: session,
      action: "taxonomy.delete",
      entityType: "taxonomy",
      entityId: key,
      summary: `Deleted taxonomy "${key}"`,
    })
    return NextResponse.json({ deleted: key })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/taxonomies/[key]] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
