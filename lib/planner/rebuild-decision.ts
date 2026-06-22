/**
 * Pure decision for the planner chat itinerary-card button:
 * should clicking it just OPEN the already-loaded plan, or REBUILD it via
 * /api/itinerary?
 *
 * Why this exists: the chat card shows either a "View Itinerary on Trip Canvas"
 * button (when the loaded plan still matches) or a "Rebuild for <date>" button
 * (when the visitor changed the date since the card was built). The bug we fix:
 * the rebuild button used to shortcut to "just open" whenever the trip set
 * matched and the date appeared to match, so it only updated the canvas date
 * label (read from prefs) while the schedule/availability was never recomputed.
 *
 * The button labelled "Rebuild" must ALWAYS rebuild. `forceRebuild` (true when
 * the card is stale) overrides the just-open shortcut unconditionally.
 */
export interface RebuildDecisionInput {
  /** Stale-card "Rebuild for <date>" button → always rebuild. */
  forceRebuild: boolean
  /** Is a plan already loaded on the canvas (centerItinerary present)? */
  hasExisting: boolean
  /** Do the requested trip ids exactly match the loaded plan's trip ids? */
  sameSet: boolean
  /** The loaded plan's build date (YYYY-MM-DD), if it recorded one. */
  existingVisitDate?: string | null
  /** The date currently selected in prefs (YYYY-MM-DD). */
  currentDate: string
}

export type RebuildDecision = "open" | "rebuild"

export function decideRebuildAction(input: RebuildDecisionInput): RebuildDecision {
  const { forceRebuild, hasExisting, sameSet, existingVisitDate, currentDate } = input
  // An explicit rebuild request never shortcuts.
  if (forceRebuild) return "rebuild"
  if (!hasExisting || !sameSet) return "rebuild"
  // A legacy plan with no recorded visitDate can't be proven fresh by date, but
  // the existing behavior treats a missing visitDate as "matches" — keep that
  // so non-stale "View" clicks stay instant. Date drift forces a rebuild.
  const dateMatches = !existingVisitDate || existingVisitDate === currentDate
  return dateMatches ? "open" : "rebuild"
}
