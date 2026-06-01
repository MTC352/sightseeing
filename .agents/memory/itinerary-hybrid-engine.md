---
name: Itinerary hybrid engine
description: How the AI Trip Planner builds itineraries (AI selects, deterministic code times) and the non-obvious timing/exclusion rules.
---

# Itinerary hybrid engine (sightseeing.lu)

`POST /api/itinerary` is a HYBRID: AI ONLY selects/orders WHICH trips; deterministic
`lib/itinerary/scheduler.ts` (`buildSchedule`) locks ALL timing. AI steps
(`lib/itinerary/ai.ts` `selectAndOrder`/`narrate`) are fail-soft — return `null` on
failure so the route falls back to `deterministicOrder` + a generated summary. The
Anthropic key (env `ANTHROPIC_API_KEY` and DB `integrations.anthropic`) is often
invalid (401) in this repl, so the deterministic path is what actually runs — never
assume AI output is present.

## Inter-stop gap = travel + buffer + earlyArrival (THREE separate components)
**Rule:** earliest next start = `prevEnd + travelMin + bufferTimeBetweenStops + earlyArrival`.
- `earlyArrival` is a FIXED 5 min courtesy margin (`EARLY_ARRIVAL_MIN`), **independent** of
  the admin buffer — always on so visitors reach the meeting point a few min early.
- `bufferTimeBetweenStops` is the admin-configurable breathing room (default 30).
**Why:** a regression once folded the admin buffer INTO earlyArrival (clamped 5–10), so a
buffer of 30 only enforced ~10 min. Keep them separate. The same three components must be
subtracted in the break/meal gap math (`freeAfterTravel`) and the meal `neededStart`.
**Both global buffers (travel + 5-min arrival) are always applied — not user-toggleable.**

## Max stops cap is admin-set and NOT user-overridable
`HARD_MAX_STOPS = 5`. Effective cap = `min(adminMaxStopsPerDay, 5)`, clamped INSIDE
`buildSchedule` (so passing raw `maxStopsPerDay` is safe). Cap applies AFTER fit. The cap
comes from settings, never from user prefs.

## Meals: included by default, user can OPT OUT
Lunch/dinner auto-insert on full-day/multi-day plans (admin `autoInsertMealBreaks`, default
true), and are ALWAYS skipped right after a food trip (`isFoodTrip`/`prev.isFood`). The user
can opt out via `SchedulerPrefs.excludeMeals` — derived in the route from a "no lunch / no
meal" exclusion (the "Skip lunch break" chip sets `exclusions: ["no-lunch"]`) or NL hint. An
explicit user meal window still wins over the admin default. `excludeMeals` must ALSO gate
auto-coffee (`coffeeWanted`) — otherwise skipping lunch just refills the gap with coffee.

## no-early-morning is OPT-IN only (default false)
`excludeEarlyMorning` (cutoff 10:00) is true ONLY when the user explicitly asks — via the
"No early starts" chip (`exclusions: ["no-early-morning"]`) or NL hints matching
`/no[-\s]?early|sleep[-\s]?in|late[-\s]?start/i` in exclusions/interests. Do NOT match bare
"early morning" — that over-triggers. Empty exclusions ⇒ early slots allowed.
Note: slots before `dayStartTime` (default 09:00) are rejected by the day window regardless —
not the same thing as the early-morning exclusion.

## Single-pref chips bypass AI (planner page)
In `app/planner/page.tsx`, when a plan is on the canvas, suggestion chips can carry an
optional `patch` (`Partial<Preferences>`). Clicking calls `applyDirectPref` which merges
ONLY that field into `prefsRef.current` synchronously, persists prefs, and rebuilds via
`handleRegenerateItinerary` — no AI round-trip. `handleRegenerateItinerary` reads
`prefsRef.current` (not closure prefs) so the immediate rebuild sees the new value.

## Testing the scheduler
Whole-project `tsc` gets OOM-killed. Transpile the single file standalone:
`npx tsc lib/itinerary/scheduler.ts --target es2022 --module es2022 --moduleResolution bundler --skipLibCheck --outDir /tmp/x`,
then run a node `.mjs` that imports `./scheduler.js` with mock `computeLeg`/`cityTravelMin`.
Remember slots before `dayStartTime` are always rejected when writing window tests.
