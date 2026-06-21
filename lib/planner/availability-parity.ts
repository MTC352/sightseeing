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
