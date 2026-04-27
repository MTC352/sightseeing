import { NextResponse } from "next/server"
import { dbGetHelpArticle, dbUpdateHelpArticle, dbDeleteHelpArticle } from "@/lib/db/queries"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const article = await dbGetHelpArticle(id)
    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(article)
  } catch (err) {
    console.error("[admin/help/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await req.json()
    const updated = await dbUpdateHelpArticle(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error("[admin/help/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await dbDeleteHelpArticle(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[admin/help/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
