---
name: Planner chat itinerary-card rebuild button
description: Why the chat "Rebuild for <date>" button must force a real /api/itinerary rebuild and never shortcut to just-open.
---

# Planner chat itinerary-card button: open vs rebuild

The chat itinerary card (`app/planner/page.tsx`, `handleOpenOrRebuildFromChat`)
renders either **"View Itinerary on Trip Canvas"** (loaded plan still matches) or
**"Rebuild for <date>"** (card went stale because the visitor changed the date).

**Rule: the "Rebuild" button must ALWAYS hit `/api/itinerary`.** It passes
`{ forceRebuild: cardStale }`; the pure decider `decideRebuildAction`
(`lib/planner/rebuild-decision.ts`) returns `"rebuild"` whenever `forceRebuild` is
set, bypassing the same-set + date-match just-open shortcut.

**Why:** changing the date auto-fires `handleRegenerateItinerary` (from
`applyDirectPref`), which can leave `centerItinerary` as a same-set plan whose
`visitDate` already equals the new date. The old shortcut (`sameSet && dateMatches`)
then made the explicit rebuild click a no-op **open** — the canvas header updates
to the new date (it reads `prefs.startDate`, not `centerItinerary.visitDate`) while
the schedule/times/availability are never recomputed. A legacy itinerary with no
`visitDate` also made `dateMatches` pass. Symptom reported: "Rebuild only updates
the date on canvas; sidebar Build Itinerary works."

**How to apply:** any new code path that re-opens vs rebuilds an itinerary from a
button labelled "Rebuild" must route through `decideRebuildAction` with
`forceRebuild:true`. Keep the non-stale "View" button on `forceRebuild:false` so it
stays an instant open with no API round-trip.
