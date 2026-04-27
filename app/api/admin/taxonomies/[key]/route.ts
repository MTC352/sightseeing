import { NextResponse } from "next/server"
import { dbDeleteTaxonomy, dbGetTaxonomy } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const taxonomy = await dbGetTaxonomy(key)
    if (!taxonomy) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(taxonomy)
  } catch (err) {
    console.error("[admin/taxonomies/[key]] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    await dbDeleteTaxonomy(key)
    return NextResponse.json({ deleted: key })
  } catch (err) {
    console.error("[admin/taxonomies/[key]] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
