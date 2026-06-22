/**
 * Pure decision for the planner visibility gate, split out from the DB/session
 * I/O in visibility.ts so the rule is unit-testable (no imports).
 *
 *  - hidden only when a hide flag is set (itinerary OR planner, for migration
 *    backward-compat) AND there is no admin session (admins preview while hidden).
 *  - never hidden when no flag is set, regardless of session.
 */
export function decidePlannerHidden(opts: {
  itineraryHide?: boolean
  plannerHide?: boolean
  hasSession: boolean
}): boolean {
  const hideFlag = opts.itineraryHide === true || opts.plannerHide === true
  if (!hideFlag) return false
  return !opts.hasSession
}
