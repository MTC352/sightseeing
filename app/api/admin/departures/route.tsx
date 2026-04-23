import { NextRequest, NextResponse } from "next/server"
import { listDepartures, getDeparture, createDeparture, updateDeparture, deleteDeparture } from "@/lib/admin-store"

export function GET() {
  return NextResponse.json(listDepartures())
}

export async function POST(req: NextRequest) {
  const data = await req.json()
  const dep = createDeparture(data)
  return NextResponse.json(dep, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const { id, ...data } = await req.json()
  const updated = updateDeparture(id, data)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
  deleteDeparture(id)
  return NextResponse.json({ ok: true })
}
