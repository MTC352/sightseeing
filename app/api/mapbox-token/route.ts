import { NextResponse } from "next/server"
import { dbGetSettings } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

function isSafePublicToken(token: string): boolean {
  return typeof token === "string" && token.startsWith("pk.")
}

function envMapboxToken(): string {
  return (
    process.env.mapbox ??
    process.env.MAPBOX ??
    process.env.MAPBOX_TOKEN ??
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_mapbox ??
    process.env.NEXT_PUBLIC_MAPBOX ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ??
    ""
  )
}

export async function GET() {
  // Admin panel (DB integrations) is the source of truth. Env is only a
  // fallback for local/dev where the DB key may not be configured yet — so a
  // key saved in /admin/integrations always wins over a stale env var.
  let token = ""
  try {
    const settings = await dbGetSettings()
    token = settings?.apiKeys?.mapbox ?? ""
  } catch {
    /* DB unavailable — fall through to env */
  }
  if (!token) token = envMapboxToken()

  if (!isSafePublicToken(token)) {
    return NextResponse.json({ token: "" })
  }
  return NextResponse.json({ token })
}
