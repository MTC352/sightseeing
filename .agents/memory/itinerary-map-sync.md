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
`departureGeo`/`endGeo`), falling back to a city approximation; exact-duplicate
coords get a tiny golden-angle fan-out so shared locations cluster yet stay clickable.
