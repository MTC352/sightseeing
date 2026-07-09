import { NextResponse } from "next/server"
import { dbGetContactInfo } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const info = await dbGetContactInfo()
    return NextResponse.json(info)
  } catch {
    return NextResponse.json(
      { address: "430-434 route de Longwy, L-1940 Luxembourg", email: "hello@sightseeing.lu", phone: "+352 266 51 2200" },
    )
  }
}
