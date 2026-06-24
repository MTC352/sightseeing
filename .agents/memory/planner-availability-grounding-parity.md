---
name: Planner availability grounding parity
description: The AI-grounding count/samples must use the same availability source as the visible canvas, or chat and canvas disagree.
---

# Planner availability grounding parity

On `/planner` there are two availability maps in `app/planner/page.tsx`:
- `plannerAvail` — the client's own `/api/planner/availability` whole-catalog scan.
- `effectiveAvail` — `plannerAvail` merged with the AI's per-trip `searchTrips` output
  (`aiAvailInfo.map`), but ONLY when the AI has pinned trips AND its data is tagged for
  the current `prefs.startDate`. Otherwise it equals `plannerAvail`.

**Rule:** anything the AI quotes about the canvas (canvasCount, matchingResolvedCount,
matchingOther, availableToday/availableTodaySamples, otherDateSamples, displayedTitles)
MUST derive from `effectiveAvail`, the SAME source the visible grouping uses
(`visibleCanvasTrips`). The single exception is `availabilityForApiRef` — the client's
raw whole-catalog snapshot sent to the server — which stays on `plannerAvail`; merging
AI output back into it would be circular (AI → client → server → AI).

**Why:** server now does a fresh scan by default, but the client still sends a "what the
visitor sees" count to ground the AI's narration. If that count comes from `plannerAvail`
while the canvas renders from `effectiveAvail`, the number the AI states can diverge from
the canvas in the exact stale-client/fresh-AI scenario — breaking the chat↔canvas-agree
invariant. `effectiveAvail` is a strict superset of `plannerAvail` (only adds same-date
AI overrides), so switching is safe.

**How to apply:** when adding any new AI-grounding signal derived from per-trip
availability, key it off `effectiveAvail`, not `plannerAvail`, and add `effectiveAvail`
to the deps.

## Related caveat — module-global per-request tool state
`/api/planner/route.ts` keeps per-request tool inputs in MODULE globals
(`_defaultVisitDate`, `_defaultPartySize`, `_plannerAvail`, `_availDate`) that
`searchTrips` reads at execution time. This is a pre-existing route-wide pattern with a
theoretical cross-request contamination risk under concurrency. Prompt-grounding already
captures a request-local copy. A real fix is request-scoped tool factories — a larger
refactor, not done as part of availability-sync work.
