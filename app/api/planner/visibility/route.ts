import { NextResponse } from "next/server"
import { queryOne } from "@/lib/db"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * Public endpoint that tells the site whether the Trip Planner should be
 * visible to the current visitor.
 *
 * The admin can hide the planner page + nav link from the public via the
 * "hidePublicPlanner" flag in the planner AI behavior settings
 * (ai_system_configs.system_key='planner' extra_config). Logged-in admins
 * always see the planner regardless of the flag, so they can preview it.
 */
export async function GET() {
  try {
    const row = await queryOne<{ extra_config: Record<string, unknown> | null }>(
      `SELECT extra_config FROM ai_system_configs WHERE system_key = 'planner'`,
    )
    const hideFlag = row?.extra_config?.hidePublicPlanner === true
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
