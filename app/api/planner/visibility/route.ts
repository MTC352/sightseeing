import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * Public endpoint that tells the site whether the Trip Planner should be
 * visible to the current visitor.
 *
 * The "hidePublicPlanner" flag now lives in itinerary.extra_config (the
 * "Manage Trip Planner" admin page). For backward compatibility during the
 * migration period, we also check planner.extra_config and OR the two flags —
 * so the gate works correctly both before and after migration 012 runs.
 *
 * Logged-in admins always see the planner regardless of the flag, so they
 * can preview it while it's hidden from the public.
 */
export async function GET() {
  try {
    const rows = await query<{ system_key: string; extra_config: Record<string, unknown> | null }>(
      `SELECT system_key, extra_config FROM ai_system_configs WHERE system_key IN ('itinerary', 'planner')`,
    )
    const itineraryRow = rows.find((r) => r.system_key === "itinerary")
    const plannerRow = rows.find((r) => r.system_key === "planner")

    // Prefer itinerary (canonical home after migration 012), fall back to planner
    // for sites that haven't run the migration yet.
    const itineraryHide = itineraryRow?.extra_config?.hidePublicPlanner === true
    const plannerHide = plannerRow?.extra_config?.hidePublicPlanner === true
    const hideFlag = itineraryHide || plannerHide

    // Admins bypass the gate (preview while hidden from the public).
    const session = await getSession().catch(() => null)
    const hidden = hideFlag && !session
    return NextResponse.json(
      { hidden },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  } catch (err) {
    console.error("[planner/visibility] GET error:", err)
    // Fail-open: never block the planner because of a settings read error.
    return NextResponse.json(
      { hidden: false },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  }
}
