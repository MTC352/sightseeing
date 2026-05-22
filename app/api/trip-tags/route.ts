import { NextResponse } from "next/server"
import { dbListTripTags, dbListHomepageTripTagsWithCounts } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

/**
 * Public Trip Tags endpoint.
 *   GET /api/trip-tags             → { tags: TripTag[] }   (all)
 *   GET /api/trip-tags?homepage=1  → { tags: TripTagWithCount[] }  (only show_on_homepage, with trip counts)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const homepage = url.searchParams.get("homepage")
    if (homepage === "1" || homepage === "true") {
      const tags = await dbListHomepageTripTagsWithCounts()
      return NextResponse.json({ tags })
    }
    const tags = await dbListTripTags()
    return NextResponse.json({ tags })
  } catch (err) {
    console.error("[/api/trip-tags] GET error:", err)
    return NextResponse.json({ tags: [] })
  }
}
