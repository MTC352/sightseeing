/**
 * Pure decision helper for the planner's single-day availability parity check
 * (used by getTripDatesAndDeals in app/api/planner/route.ts).
 *
 * Context (see memory: itinerary-availability-parity): the bulk TourCMS
 * `datesndeals` feed UNDER-reports — it can return ZERO dates for a day that is
 * in fact bookable. So when the caller asks about ONE exact day and the calendar
 * came back empty, we re-check that day with the authoritative real-time
 * `checkAvailability` widget.
 *
 * CRITICAL: a FAILED checkavail call must NEVER be reported as "no slots". If we
 * cannot confirm emptiness (the call threw → null, or returned ok:false), the
 * tool must surface a TOURCMS_ERROR so the model says "availability temporarily
 * unavailable" instead of falsely telling the visitor there are no openings.
 *
 * Decisions:
 *  - "error"     → checkavail failed (null or ok:false); cannot confirm → surface error.
 *  - "has-slots" → checkavail ok with ≥1 component; recover those slots.
 *  - "empty"     → checkavail ok with 0 components; a genuine "no slots" answer.
 */
export type SingleDayFallbackDecision = "error" | "has-slots" | "empty"

export function interpretSingleDayFallback(
  av: { ok: boolean; components?: unknown[] } | null | undefined,
): SingleDayFallbackDecision {
  if (!av || !av.ok) return "error"
  return (av.components?.length ?? 0) > 0 ? "has-slots" : "empty"
}

/**
 * Pure classifier for a single trip's visit-date availability, used by
 * searchTrips grounding in app/api/planner/route.ts.
 *
 * Context (see memory: planner-recommendations / itinerary-availability-parity):
 * the planner availability snapshot can report a trip as bookable on the date
 * (`onDate`), bookable only on OTHER dates (`dates`), or — critically — as
 * `unknown` when BOTH TourCMS sources (datesndeals + checkavail) failed for the
 * date. An `unknown` trip is an INCIDENT, NOT a closure, and must never be
 * reported to the visitor as "not available".
 *
 * Classes:
 *  - "available"   → bookable on the visit date.
 *  - "unconfirmed" → availability could not be determined (dual-source failure).
 *  - "alternative" → not on the visit date, but bookable on other listed dates.
 *  - "none"        → confidently not bookable on the visit date.
 *
 * Precedence matters: `onDate` wins over everything; `unknown` is checked BEFORE
 * other-dates so an incident is never downgraded to a confident verdict.
 */
export type TripAvailabilityClass = "available" | "unconfirmed" | "alternative" | "none"

export function classifyTripAvailability(
  av: { onDate?: boolean; unknown?: boolean; dates?: string[] | null } | null | undefined,
): TripAvailabilityClass {
  if (av?.onDate === true) return "available"
  if (av?.unknown === true) return "unconfirmed"
  if ((av?.dates?.length ?? 0) > 0) return "alternative"
  return "none"
}

/**
 * Whether the visit date is CONFIDENTLY empty for a set of returned trips: no
 * trip is bookable AND none are merely unconfirmed. If every miss is an
 * unconfirmed incident this is false, so the AI never tells the visitor the day
 * is closed on the basis of a provider outage.
 */
export function isConfidentNoneAvailable(availableCount: number, unconfirmedCount: number): boolean {
  return availableCount === 0 && unconfirmedCount === 0
}

/**
 * Whether a canvas count is TRUSTWORTHY enough to ground the AI as authoritative
 * (i.e. safe to inject the "LIVE TRIP CANVAS COUNT / AVAILABILITY GROUND TRUTH"
 * line). A 0 count must NEVER be surfaced as a confident "no trips bookable"
 * when it is the product of a provider incident rather than a real empty day.
 *
 * Rules:
 *  - A FAILED availability scan (network/HTTP error, null body) is never
 *    trustworthy — the empty map it leaves behind is "couldn't confirm", not
 *    "zero available".
 *  - A count > 0 is always trustworthy (we have concrete bookable trips).
 *  - A count === 0 is trustworthy ONLY if at least one matching trip got a
 *    DEFINITIVE answer (`matchingResolvedCount > 0`). If every matching trip is
 *    `unknown` (dual-source TourCMS failure), the 0 is an incident, not a
 *    closure, so it must not be grounded as a confident empty day.
 *
 * **Why:** the planner chat repeatedly told visitors a day/trip was "not
 * available" off the back of a 0 count that actually came from a failed or
 * all-unknown scan — the exact zero-misinformation regression this guards.
 */
export function isCanvasCountTrustworthy(args: {
  scanFailed: boolean
  canvasCount: number
  matchingResolvedCount: number
}): boolean {
  if (args.scanFailed) return false
  if (args.canvasCount > 0) return true
  return args.matchingResolvedCount > 0
}

/**
 * Whether the `searchTrips` tool result may attach a per-trip availability
 * annotation (the block that can emit `noneAvailableOnVisitDate`).
 *
 * **Why:** an EMPTY result set has `availableCount === 0` AND
 * `unconfirmedCount === 0`, so `isConfidentNoneAvailable` returns true — which
 * would falsely tell the visitor NOTHING runs that day. That is exactly the
 * "canvas shows Beaufort available today but chat says it isn't" misinformation
 * that surfaced when the model passed `maxResults: 0` and the search collapsed
 * to zero trips. There must be at least one returned trip before any per-trip
 * availability is asserted, AND the cached snapshot must belong to THIS request's
 * visit date (module-global snapshot can otherwise leak across requests).
 *
 * **How to apply:** gate the annotation block in the planner route with this.
 */
export function shouldAnnotateAvailability(args: {
  resultCount: number
  snapshotDate: string | null | undefined
  visitDate: string | null | undefined
  snapshotSize: number
}): boolean {
  return (
    args.resultCount > 0 &&
    !!args.snapshotDate &&
    args.snapshotDate === args.visitDate &&
    args.snapshotSize > 0
  )
}
