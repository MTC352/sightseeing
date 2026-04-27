import { NextResponse } from "next/server"
import { dbGetTrip, dbUpdateTrip, dbDeleteTrip } from "@/lib/db/queries"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const trip = await dbGetTrip(id)
    if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(trip)
  } catch (err) {
    console.error("[admin/trips/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await req.json()
    const updated = await dbUpdateTrip(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error("[admin/trips/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await dbDeleteTrip(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[admin/trips/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
