---
name: Planner searchTrips limit-zero + empty-set availability
description: Why the planner chat reported a bookable trip as "not available today" — two compounding bugs in the searchTrips tool result.
---

# Planner searchTrips: maxResults:0 collapse + empty-set "none available"

Two compounding bugs made the planner chat tell visitors a trip was "not
available today" while the Trip Canvas correctly showed it bookable (e.g.
Beaufort on a day it ran 13:00–17:00).

## Bug 1 — `maxResults: 0` collapses results
The model (gpt-4o-mini) sometimes passes `maxResults: 0` intending "no cap".
`const limit = maxResults ?? catalogSize` keeps that `0` because `??` does NOT
treat `0` as nullish, so `results.slice(0, 0)` returns ZERO trips even when
matches exist.

**Rule:** any slice limit derived from model tool args must treat `0`,
negative, `NaN`, `Infinity` as "no cap" — only a finite cap `>= 1` caps. Use the
pure helper `resolveSearchLimit(maxResults, catalogSize)` in
`lib/planner/search-card.ts`, never inline `??`.

## Bug 2 — empty result set asserts "none available"
The availability annotation runs `isConfidentNoneAvailable(availCount, unconfirmed)`
= `availCount===0 && unconfirmed===0` → **true for an EMPTY result set**, so an
empty search falsely emits `noneAvailableOnVisitDate: true` (and the contradictory
`similarAvailableOnVisitDate` list — that exact contradictory pair was the screenshot).

**Rule:** never assert per-trip availability over zero returned trips. Gate the
annotation with `shouldAnnotateAvailability({resultCount, snapshotDate, visitDate,
snapshotSize})` in `lib/planner/availability-parity.ts` (requires `resultCount>0`
AND snapshot date == visit date AND non-empty snapshot).

**Why:** standing ground-truth prompt blocks (buildAvailabilityGroundTruth) do
NOT save you here — the AI trusts the `searchTrips` TOOL RESULT, so the tool
result itself must be self-consistent and never under-report availability.

## How to verify
Live end-to-end POST to `/api/planner` (the dev-domain harness) with a query for
a known-on-date trip — a single-turn POST finishes at `finishReason:tool-calls`
with no final text (harness artifact), but inspect the `tool-output-available`
event's `output.availability`: must show `availableOnVisitDateCount>0` and
`noneAvailableOnVisitDate:false`. Unit-tested in
`test/planner/search-card.test.mjs` + `test/planner/availability-grounding.test.mjs`.
