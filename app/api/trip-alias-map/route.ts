import { NextResponse } from "next/server"
import { dbGetTripAliasMap } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

// Compiled trip-slug alias table consumed by proxy.ts over the internal loopback
// (the proxy runs on the edge and can't touch Postgres directly — same pattern
// as /api/redirects/map and /api/trip-slug). Each entry maps an alternate
// /trip/{alias} to the trip's current canonical slug so the proxy can issue a
// true 308. The proxy caches the response in-memory with a short TTL, so this is
// hit at most once per TTL window per instance, not per request.
export async function GET() {
  try {
    return NextResponse.json({ entries: await dbGetTripAliasMap() })
  } catch (err) {
    console.error("[trip-alias-map] GET error:", err)
    return NextResponse.json({ entries: [] })
  }
}
