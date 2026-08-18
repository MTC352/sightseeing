import { NextResponse } from "next/server"
import { dbGetRedirectMap } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

// Compiled blog-redirect table consumed by proxy.ts over the internal loopback
// (the proxy runs on the edge and can't touch Postgres directly — same pattern
// as /api/trip-slug). Public: it only exposes already-public blog slugs. The
// proxy caches the response in-memory with a short TTL, so this is hit at most
// once per TTL window per instance, not per request.
export async function GET() {
  try {
    return NextResponse.json({ entries: await dbGetRedirectMap() })
  } catch (err) {
    console.error("[redirects/map] GET error:", err)
    return NextResponse.json({ entries: [] })
  }
}
