import { NextResponse } from "next/server"

export async function GET() {
  // Try all possible env var name patterns
  const token =
    process.env.mapbox ??
    process.env.MAPBOX ??
    process.env.MAPBOX_TOKEN ??
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_mapbox ??
    process.env.NEXT_PUBLIC_MAPBOX ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ??
    ""
  return NextResponse.json({ token })
}
