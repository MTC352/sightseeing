import { NextResponse } from "next/server"
import { dbListTaxonomies, dbCreateTaxonomy, dbUpsertTaxonomies } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await dbListTaxonomies())
  } catch (err) {
    console.error("[admin/taxonomies] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    if (!data.key) return NextResponse.json({ error: "key is required" }, { status: 400 })
    const taxonomy = await dbCreateTaxonomy({
      key: String(data.key).toLowerCase().replace(/\s+/g, "_"),
      label: data.label ?? data.key,
      value: data.value ?? "",
      groupKey: data.groupKey ?? String(data.key).split("_")[0],
    })
    return NextResponse.json(taxonomy, { status: 201 })
  } catch (err) {
    console.error("[admin/taxonomies] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const data = await req.json()
    if (!Array.isArray(data)) return NextResponse.json({ error: "Expected array of {key, value}" }, { status: 400 })
    const count = await dbUpsertTaxonomies(data as { key: string; value: string }[])
    return NextResponse.json({ updated: count })
  } catch (err) {
    console.error("[admin/taxonomies] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
