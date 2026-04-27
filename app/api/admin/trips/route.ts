import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
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
    if (!data.title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 })
    const trip = await dbCreateTrip(data)
    revalidatePath("/admin/trips")
    revalidatePath("/")
    return NextResponse.json(trip, { status: 201 })
  } catch (err) {
    console.error("[admin/trips] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
