import { NextResponse } from "next/server"
import { createTrip, listTrips } from "@/lib/admin-store"
import type { AdminTrip } from "@/lib/admin-store"

export async function GET() {
  return NextResponse.json(listTrips())
}

export async function POST(req: Request) {
  const data: Omit<AdminTrip, "id"> = await req.json()
  const trip = createTrip(data)
  return NextResponse.json(trip, { status: 201 })
}
