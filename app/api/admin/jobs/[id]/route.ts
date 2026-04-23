import { NextResponse } from "next/server"
import { updateJob, deleteJob, getJob } from "@/lib/admin-store"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = getJob(id)
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(job)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await req.json()
  const updated = updateJob(id, data)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteJob(id)
  return NextResponse.json({ ok: true })
}
