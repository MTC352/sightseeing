import { NextResponse } from "next/server"
import { dbListTaxonomies, dbCreateTaxonomy, dbUpsertTaxonomies } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET() {
  try {
    await requireAdminSession()
    return NextResponse.json(await dbListTaxonomies())
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/taxonomies] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAdminSession()
    const data = await req.json()
    if (!data.key) return NextResponse.json({ error: "key is required" }, { status: 400 })
    const taxonomy = await dbCreateTaxonomy({
      key: String(data.key).toLowerCase().replace(/\s+/g, "_"),
      label: data.label ?? data.key,
      value: data.value ?? "",
      groupKey: data.groupKey ?? String(data.key).split("_")[0],
    })
    void logActivity({
      actor: session,
      action: "taxonomy.create",
      entityType: "taxonomy",
      entityId: (taxonomy as { key?: string } | null)?.key ?? String(data.key),
      summary: `Created taxonomy "${data.label ?? data.key}"`,
    })
    return NextResponse.json(taxonomy, { status: 201 })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/taxonomies] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession()
    const data = await req.json()
    if (!Array.isArray(data)) return NextResponse.json({ error: "Expected array of {key, value}" }, { status: 400 })
    const count = await dbUpsertTaxonomies(data as { key: string; value: string }[])
    void logActivity({
      actor: session,
      action: "taxonomy.update",
      entityType: "taxonomy",
      summary: `Updated ${count} taxonomy value(s)`,
    })
    return NextResponse.json({ updated: count })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/taxonomies] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
