import { NextResponse } from "next/server"

/**
 * Map a coded validation error thrown by the trip-redirect db functions
 * (dbCreateTripRedirect / dbUpdateTripRedirect) to a friendly HTTP response.
 * Returns null when the error isn't one we recognize (caller then 500s).
 */
export function tripRedirectError(err: unknown): NextResponse | null {
  const code = err instanceof Error ? err.message : ""
  const dup = !!err && typeof err === "object" && (err as { code?: string }).code === "23505"
  if (dup || code === "SLUG_TAKEN") {
    return NextResponse.json({ error: "That slug is already used by another trip or redirect" }, { status: 409 })
  }
  if (code === "INVALID_SLUG") {
    return NextResponse.json({ error: "Slug is invalid (empty, or looks like a numeric ID)" }, { status: 400 })
  }
  if (code === "SLUG_IS_CANONICAL") {
    return NextResponse.json({ error: "That is already this trip's canonical URL" }, { status: 400 })
  }
  if (code === "TRIP_NOT_FOUND") {
    return NextResponse.json({ error: "Pick a valid trip for this redirect" }, { status: 400 })
  }
  if (code === "NOT_CONFIGURED") {
    return NextResponse.json({ error: "Trip redirects aren't set up yet — run the trip_slug_aliases migration" }, { status: 400 })
  }
  return null
}
