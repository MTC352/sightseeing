import { NextResponse } from "next/server"
import { updatePost, deletePost, getPost } from "@/lib/admin-store"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = getPost(id)
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(post)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await req.json()
  const updated = updatePost(id, data)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deletePost(id)
  return NextResponse.json({ ok: true })
}
