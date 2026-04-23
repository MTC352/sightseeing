import { NextResponse } from "next/server"
import { updateTrip, deleteTrip, getTrip } from "@/lib/admin-store"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = getTrip(id)
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(trip)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await req.json()
  const updated = updateTrip(id, data)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteTrip(id)
  return NextResponse.json({ ok: true })
}
