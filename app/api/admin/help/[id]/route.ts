import { NextResponse } from "next/server"
import { getHelpArticle, updateHelpArticle, deleteHelpArticle } from "@/lib/admin-store"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const article = getHelpArticle(id)
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(article)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await req.json()
  const updated = updateHelpArticle(id, data)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ok = deleteHelpArticle(id)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: true })
}
