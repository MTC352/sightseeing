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
