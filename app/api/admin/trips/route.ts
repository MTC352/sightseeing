import { NextResponse } from "next/server"
import { dbListTrips, dbCreateTrip } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await dbListTrips())
  } catch (err) {
    console.error("[admin/trips] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const trip = await dbCreateTrip(data)
    return NextResponse.json(trip, { status: 201 })
  } catch (err) {
    console.error("[admin/trips] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
