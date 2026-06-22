import { query } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { decidePlannerHidden } from "@/lib/planner/visibility-decision"

/**
 * Shared "is the Trip Planner hidden from the public?" check.
 *
 * The `hidePublicPlanner` flag lives in `itinerary.extra_config` (the "Manage
 * Trip Planner" admin page). For backward compatibility during the migration
 * period we ALSO check `planner.extra_config` and OR the two flags, so the gate
 * works both before and after migration 012 runs.
 *
 * Logged-in admins always bypass the gate (they preview the planner while it is
 * hidden from the public). Fail-OPEN on any read error — never block the planner
 * because of a settings read failure.
 *
 * Used by BOTH the public visibility endpoint (GET /api/planner/visibility) and
 * the chat endpoint (POST /api/planner) so the server-side gate is enforced
 * consistently — the client-only visibility check is not a security boundary.
 */
export async function isPlannerHidden(): Promise<boolean> {
  try {
    const rows = await query<{ system_key: string; extra_config: Record<string, unknown> | null }>(
      `SELECT system_key, extra_config FROM ai_system_configs WHERE system_key IN ('itinerary', 'planner')`,
    )
    const itineraryRow = rows.find((r) => r.system_key === "itinerary")
    const plannerRow = rows.find((r) => r.system_key === "planner")

    const itineraryHide = itineraryRow?.extra_config?.hidePublicPlanner === true
    const plannerHide = plannerRow?.extra_config?.hidePublicPlanner === true
    if (!(itineraryHide || plannerHide)) return false

    // Admins bypass the gate (preview while hidden from the public).
    const session = await getSession().catch(() => null)
    return decidePlannerHidden({ itineraryHide, plannerHide, hasSession: !!session })
  } catch {
    // Fail-open: never block the planner because of a settings read error.
    return false
  }
}
