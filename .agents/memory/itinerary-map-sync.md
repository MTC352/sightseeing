---
name: Itinerary list↔map index alignment
description: How the planner itinerary panel and the Mapbox widget agree on stop/leg indices for bidirectional sync.
---

# Itinerary list↔map sync index space

The Trip Planner itinerary view has two synced surfaces: the list panel and the
Mapbox widget. Clicking a stop/leg in one highlights it in the other.

**Rule:** all shared active-index state (`activeStopIndex`, `activeLegIndex`) is in
**full-step space** — indices into the complete `itinerary.steps` array, which is
what the panel renders and indexes by.

**Why:** the map renders only a *subset* of steps — it skips any step whose trip
cannot be resolved against the in-memory trip catalog (cart items + loaded trips).
If the map used its own local 0..N rendering index while the panel used full-step
indices, the two diverge the moment one step is skipped (stale/persisted plans), so
clicks highlight the wrong pin/card.

**How to apply:** the planner builds ONE memo that emits `{trips, coords, stepIndices}`
together so they can never drift; `stepIndices[k]` is the full-step index of the
k-th rendered marker (identity `[0,1,2,…]` when nothing is skipped). The map takes a
`itineraryStepIndices` prop and translates: pin highlight compares
`stepIndices[i] === activeStopIndex`, the click callback fires `stepIndices[i]`, and
each route leg feature is tagged `legIndex: stepIndices[i]` (the from-stop's full
index) so the panel's per-from-step travel boxes line up. If you ever add a third
synced surface or change skipping, keep everything in full-step space and translate
at the map boundary only.

Marker placement uses real per-stop geocodes (`step.lat/lng` from the scheduler's
`departureGeo`/`endGeo`), falling back to a city approximation.

**Route line vs markers (3-surface parity):** the planner shows the SAME route on
three surfaces — canvas Mapbox map, PDF static map, and the "open in maps" deep link.
Markers/pins render for EVERY stop (city-jitter fallback when a stop lacks a geocode),
but the ROUTE line must only connect stops with a REAL geocode. Both the PDF
(`itinerary-pdf.ts`, `hasCoords` filter) and the canvas (`sightseeing-map.tsx`,
`routePoints` = real-coord stops only) drop non-geocoded stops from the line so the
two are byte-for-byte identical. **Why:** routing through a fake jittered point draws
a phantom detour on the canvas that the PDF/deep-link never show. In the common
case (all stops geocoded) `routePoints` == every marker so the line is unchanged.

**Per-leg travel mode is keyed by FROM-stop full-step index everywhere.** A
`legMethods` map (`drive|walk|cycle`, type `TravelMethod` exported from
`sidebar-itinerary.tsx`) is keyed by the from-stop's full-step index — the SAME key
in the sidebar selector, canvas (`legMethods[fromStepIdx]`→Mapbox profile), and PDF
(`coordSteps[k].idx`→per-leg polyline + dominant Google `travelmode`). Defaults come
from the shared `recommendedTravelMethod(leg)` (planner SEEDS state from it, keyed by
trip-set fingerprint, so user overrides survive benign rerenders but reset when the
trip set changes). **Gotchas:** (1) Google deep link is single-mode → use the
*dominant* selected mode, so it can't be pixel-identical to Mapbox; canvas↔PDF ARE.
(2) `has`/`recommendedTravelMethod` must treat `cycleMin` as first-class (cycle-only
legs exist in theory) or the selector wrongly shows "unavailable". (3) cap/default
changes for legMethods must touch sidebar selector + planner seed effect + both route
builders.

**Pin shape & overlap (teardrop, not circles):** markers are a CSS teardrop —
outer box `28x40`, a `28x28` circle at top with a `border-top:12px` `::after`
triangle hanging below so the tail's bottom vertex lands at **y=40 = the box
bottom**. Mapbox `anchor:"bottom"` puts that vertex on the coordinate.

**Why the geometry must line up exactly:** stops that share a location keep the
SAME coordinate (no geographic fan-out anymore) and instead each pin *leans* by a
different angle (`computeTilts`, symmetric about vertical) so they fan out like a
bouquet with every tip on the same spot. The lean is an inline `rotate()` on
`.sightseeing-pin-lean` with `transform-origin: bottom center` — that pivot is the
tip ONLY because the tip is at the box bottom. The number counter-rotates
(`rotate(-tilt)`) to stay upright.

**How to apply / gotchas:** (1) keep hover/active `scale()` on
`.sightseeing-pin-shape`, never on `.sightseeing-pin-lean`, or it clobbers the
per-pin inline rotate. (2) the shape's scale `transform-origin` must be the real
tip `50% 40px` (12px below the 28px circle), not `center bottom`, or scaling lifts
the tip ~1.4px off the coordinate. The map can't be verified in headless tests
(no WebGL), so this geometry is reasoned, not screenshot-confirmed.
