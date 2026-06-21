import { NextResponse } from "next/server"
import { isPlannerHidden } from "@/lib/planner/visibility"

export const dynamic = "force-dynamic"

/**
 * Public endpoint that tells the site whether the Trip Planner should be
 * visible to the current visitor. The actual flag resolution (incl. the admin
 * bypass + fail-open behavior) lives in the shared `isPlannerHidden` helper so
 * the POST chat route enforces the SAME gate server-side.
 */
export async function GET() {
  const hidden = await isPlannerHidden()
  return NextResponse.json(
    { hidden },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  )
}
