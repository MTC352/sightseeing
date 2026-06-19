---
name: Planner recommendations canvas
description: How the Trip Planner canvas builds its recommendation list and why it is decoupled from the AI chat.
---

# Trip Planner "Recommended for you" canvas

The canvas recommendation list is **deterministic and decoupled from the AI chat stream**.
`resultTrips = recommendedTrips` (a useMemo derived from `fallbackTrips` deterministic
scoring), NOT from the AI's selected/streamed trips. The AI chat is a separate helper that
can adjust prefs, which flow back into the list.

**Why:** Previously the canvas waited on the first AI turn completing; when the AI key was
401 (common — both env and DB keys often fail) the canvas stuck on "Discovering…" forever
on reload. Decoupling fixed the infinite-loading reload bug and satisfies the product rule
that the canvas shows EVERY preference-matching trip, not an AI subset.

**How to apply:**
- Empty interests must STILL populate the canvas. Skipping all onboarding (`skipAll`) leaves `interests` empty by design, but `fallbackTrips` already degrades to weather/budget-scored top trips, so the canvas shows those. The interest gate exists in TWO places that must stay in lockstep: the `recommendedTrips` useMemo guard AND the canvas render branch (the `planner-recs-empty` "Tell the AI what you like" fallback). Gate the empty-state ONLY on `recommendedTrips.length === 0`, never on `interests.length`, or skip-all pins the canvas on "Finding your perfect trips…" while the chat claims it has options.
- Date is a FILTER (not visual-grouping-only): when a date is selected the canvas shows ONLY trips bookable on that date (the on-date group). The "Available on other dates" group is fallback-only — it renders strictly when `onDate.length === 0 && !availLoading && others.length > 0`, so a "this weekend"/date request never dilutes the canvas with the whole catalog yet is never left blank. **Why:** users asking "this weekend trips" saw all 18 catalog trips; they want only the available ones + the count. NOTE: "this weekend" resolves to a SINGLE Saturday startDate (merged date-resolution), so Sunday-only trips are excluded by design — making weekend a true Sat+Sun union would need a date-range model (prefs is single startDate).
- Availability comes from `/api/planner/availability` (admin-configurable window, default 30 days). The fetch effect must **clear `plannerAvail` to `{}` on every new scan and on failure** (fail-soft) so grouping never reflects a stale date.
- Single-pref editing: pills go through `applyDirectPref` (one field at a time). It supports wholesale `interests` array replacement (incl. empty) and includes interests in its unchanged-check. Editing a pill must NEVER restart onboarding or wipe chat history.
