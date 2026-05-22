import { NextResponse } from "next/server"
import { dbListTripTagOptions } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

/**
 * Admin helper that returns the distinct `trip_tags` across published
 * trips as planner-form { value, label } options. Used by the
 * "Load trip tags as defaults" button on the Trip Planner Chat admin
 * page so admins can populate the Interests list from the live catalog
 * with a single click.
 */
export async function GET() {
  try {
    const options = await dbListTripTagOptions()
    return NextResponse.json({ options })
  } catch (err) {
    console.error("[admin/trip-tags] GET error:", err)
    return NextResponse.json({ options: [] })
  }
}
