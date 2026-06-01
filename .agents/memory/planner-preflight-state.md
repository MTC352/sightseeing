---
name: Planner preflight card state
description: Why restored itinerary chat cards need rehydration on refresh, and the default-deny gate.
---

# Planner buildItinerary card lifecycle

`app/planner/page.tsx` chat messages persist to localStorage (`sightseeing_chat_v1`),
but `preflightCardState` (the per-toolCallId map: checking | decision | ready) is
**volatile** and resets to `{}` on refresh.

The render gate is DEFAULT-DENY: a `tool-buildItinerary` card only shows the full
"Your Day Itinerary" timeline when its toolCallId is marked `ready`; otherwise it
shows the "Checking availability" / "Decision needed" stub.

**Consequence/bug:** after a refresh, restored cards have undefined state → stuck on
"Checking availability" forever. Fix = a one-time effect that marks all restored
buildItinerary toolCallIds `ready` and seeds `lastAutoBuiltToolCallIdRef` with the
latest so the auto-build effect doesn't redundantly re-run `/api/itinerary`.

**Also:** only the latest buildItinerary toolCallId (`lastItineraryToolCallId` memo)
renders the full card; older ones collapse to a one-line "Earlier plan — replaced"
note, so the chat never shows two competing day plans.

**How to apply:** when changing the build/preflight flow, preserve both the live
default-deny gate (new cards: undefined→checking→ready) AND the restored-session
rehydration (refresh: restored→ready).
