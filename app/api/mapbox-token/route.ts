import { NextResponse } from "next/server"
import { dbGetSettings } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  const envToken =
    process.env.mapbox ??
    process.env.MAPBOX ??
    process.env.MAPBOX_TOKEN ??
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_mapbox ??
    process.env.NEXT_PUBLIC_MAPBOX ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ??
    ""

  if (envToken) return NextResponse.json({ token: envToken })

  try {
    const settings = await dbGetSettings()
    const dbToken = settings?.apiKeys?.mapbox ?? ""
    return NextResponse.json({ token: dbToken })
  } catch {
    return NextResponse.json({ token: "" })
  }
}
