---
name: Planner itinerary explicit-request priority & drop narration
description: How chat-requested trips win over pre-existing cart trips when the day overflows, and how chat drop reasons are classified
---

# Explicit-request priority (`priorityTripIds`)

When the visitor asks the chat to build a day AROUND a specific trip ("add a food
tour and plan my day"), that trip must NOT be the one dropped if the day overflows.
The mechanism threads a `priorityTripIds` list through three layers:

1. **AI tool** — `buildItinerary` tool (`app/api/planner/route.ts`) has an optional
   `prioritizeTripIds` field; the model fills it only with trips the visitor singled
   out THIS turn (system-prompt rule 12, the EXPLICIT-REQUEST PRIORITY bullet).
2. **Client forward** — the auto-build effect in `app/planner/page.tsx` reads
   `out.prioritizeTripIds` from the tool output (filtered to ids that are in `steps`
   and not meal-break placeholders) and posts it as `priorityTripIds` on BOTH the
   preflight and the real `/api/itinerary` fetch bodies.
3. **Server** — `/api/itinerary` (`app/api/itinerary/route.ts`) floats priority trips
   to the FRONT of `ordered` before `buildSchedule` (scheduler places greedily and
   drops overflow at the END), AND seeds them first into the full-day auto-drop
   `keepIds` greedy fill so they survive the pre-schedule trim.

**Why:** the scheduler/auto-drop both shed trips deterministically (shortest-first
fit / drop-at-end); without forcing the requested trip to the front it could be the
casualty even though the visitor explicitly asked for it.

**How to apply:** keep all three layers in lockstep. The float only helps trips that
are still *candidates* (bookable that day) — a genuinely unavailable trip stays
unavailable, which is correct.

# Drop-reason narration (`lib/planner/drop-narration.ts`)

PURE helper classifies each dropped trip's reason into 6 categories
(unavailable | unconfirmed | duration | capacity | stopcap | fit) from BOTH machine
codes (NO_SLOTS/NO_PALISIS_LINK→unavailable, TOURCMS_ERROR→unconfirmed,
DOES_NOT_FIT_DURATION→duration) and the scheduler's human-readable sentences.
`buildPartialBuildMessage` writes the chat "Heads up…" text.

**Why:** the old chat message lumped EVERY drop as "isn't available on {date}", which
contradicted the canvas (which shows correct per-trip reasons). A "couldn't fit" trip
must NEVER be narrated as a no-availability drop. Alt-date suggestions are only shown
when at least one *genuinely-unavailable* trip exists.

**How to apply:** all scheduler drops are same-day FIT conflicts (capacity/stopcap/
slot-conflict/full-day/too-short) — never no-availability. Wired into both partial-
success sites in page.tsx (manual `handleOpenOrRebuildFromChat` + auto-build else
branch). Tested in `test/planner/drop-narration.test.mjs`.
