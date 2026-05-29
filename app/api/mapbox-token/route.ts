import { NextResponse } from "next/server"
import { dbGetSettings } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

function isSafePublicToken(token: string): boolean {
  return typeof token === "string" && token.startsWith("pk.")
}

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

  if (envToken) {
    if (!isSafePublicToken(envToken)) {
      return NextResponse.json({ token: "" })
    }
    return NextResponse.json({ token: envToken })
  }

  try {
    const settings = await dbGetSettings()
    const dbToken = settings?.apiKeys?.mapbox ?? ""
    if (!isSafePublicToken(dbToken)) {
      return NextResponse.json({ token: "" })
    }
    return NextResponse.json({ token: dbToken })
  } catch {
    return NextResponse.json({ token: "" })
  }
}
