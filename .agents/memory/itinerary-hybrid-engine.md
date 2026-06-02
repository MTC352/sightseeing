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

## Availability source: datesndeals is PRIMARY (trip-page parity)
Per-trip availability in the route uses `showTourDatesAndDeals` (datesndeals) as the
PRIMARY source for BOTH the selected date's concrete timeslots AND the next-21-days
alternative-date scan — ONE call. This is the same feed `/api/availability` (the public
trip-page card) uses, so it gives exact parity with what the customer sees. `checkAvailability`
(checkavail) is a best-effort FALLBACK only when datesndeals yields no concrete slot.
**Why:** checkavail returns 0 `<component>` rows for fixed-departure tours unless a rate
quantity (`r{rate_id}=qty`) is supplied (needs a per-tour showTour we don't cheaply have),
so it falsely reported "no availability" for tours that DO have slots (e.g. BBQ tcms_14,
Insta tcms_23). Every build writes one `error_logs` row (source `itinerary`) with a per-trip
TripDiag (called/ok/source/status); `error-log.ts` prunes opportunistically (30-day TTL +
5000-row cap on source `itinerary`) so the audit log can't grow unbounded.

## Unavailable-reason rendering: enum codes vs free-text scheduler drops
`components/sidebar-itinerary.tsx` switches on `u.reason`. AvailABILITY reasons are
ALL_CAPS enum codes (`NO_PALISIS_LINK`, `TOURCMS_ERROR`, `DOES_NOT_FIT_DURATION`, `NO_SLOTS`).
SCHEDULER drops (trip IS available that date but can't be timed/seated in) carry a
HUMAN-READABLE sentence as the reason (see "Scheduler drop reasons must be TRUTHFUL" below for
the per-cause copy). The switch `default` MUST render free-text reasons verbatim (heuristic:
reason contains a lowercase letter ⇒ it's a sentence, show as-is) instead of collapsing to
"No openings in the next N days".
**Why:** a 4-hour 19:15–23:15 dinner tour (BBQ) is bookable but exceeds the day window, so the
scheduler drops it with a sentence reason. The old default mislabeled it "No openings in the
next 21 days" — the exact false message users reported. NO_SLOTS is the only code that legitimately
maps to the "No openings" copy.

## "Full day" duration = TRUE whole-day window (not the admin daytime window)
Single-day full-day plans (`isFullDay = !prefs.isMultiDay && prefs.duration === "full-day"`)
schedule from `dayStart=0` to `dayEnd = 24*60 + LATE_NIGHT_SPILL_MIN` (spill = 2h, exported)
so evening/late-night tours fit (e.g. BBQ tcms_14 19:15–23:15, or a cruise finishing ~01:00).
Half-day / 1-2h / unset / multi-day KEEP the admin `dayStartTime`/`dayEndTime` window.
The route's preflight `availableMinutes` for full-day must match (`24*60 + LATE_NIGHT_SPILL_MIN`)
or the duration-vs-budget conflict check falsely flags evening tours. `toHHMM` WRAPS past
midnight (`% 1440`) rather than clamping to 23:59, so post-24:00 finishes render correct
next-day times. **Why:** before this, full-day used the ~09:00–21:00 daytime window and any
tour ending after it was dropped with "No slot fit your selected time window".

## Scheduler is a FORWARD-ONLY cursor — order candidates by earliest FINISH (max-fit)
`buildSchedule` places trips with a single advancing `prev` cursor: each trip must start at/after
`prev.endMin + travel + buffer + earlyArrival`. So the VISIT ORDER decides how many trips fit.
Sort `orderedCandidates` by **earliest feasible FINISH time** (`earliestFeasibleSlot` start +
`durationMin`; Infinity stays Infinity), tie-break earliest start then title — the classic
interval-scheduling / earliest-deadline-first greedy that maximizes the COUNT of non-overlapping
trips placed. Used by BOTH the placement loop AND the drop loop.
**Why:** earliest-START ordering let ONE long full-day tour (e.g. 8h Nature & Castle, slot 09:30)
claim the whole day and evict 2 shorter daytime trips → FEWER total stops than dropping the one
long tour. Earliest-finish keeps the daytime stops and drops the single long tour instead.
**Evening invariant still holds:** an evening tour finishes latest ⇒ sorts LAST ⇒ never evicts
daytime stops. **Caveat:** this is a strong heuristic, NOT a proof — feasibility depends on dynamic
travel/buffer/meal insertion + day-budget anchoring after the first start, not independent fixed
intervals, so rare orderings can still fit fewer; accepted tradeoff for order-invariant max-fit.

## Scheduler drop reasons must be TRUTHFUL per cause (3 buckets + party capacity)
Every trip reaching the scheduler HAS bookable slots on the date (no-availability trips are
filtered upstream into `unavailableTrips`), so a scheduler drop is ALWAYS a same-day fit/seat
conflict — never "no availability". The drop loop picks the reason by cause:
- **party capacity** (tracked in `partyCapacityBlocked`: in-window slots existed but none seated
  the whole group; `delete`d if the trip is later placed on another day) → "Not enough seats left
  for your group of N…". Take this BEFORE the fit/window branches.
- **cap reached** (`allSteps.length >= targetStops`) → pace/length copy.
- **full-day or multi-day fit conflict** → "Couldn't fit alongside your other stops… give it a
  separate date or drop a stop".
- **shorter plan, window too tight** → "Doesn't fit your {duration} time window…".
**Why:** the old single "No slot fit your selected time window" lied for the common cases — a
long tour that simply needs its own day, and a group-too-big-for-seats drop, both read as a
generic timing failure. The sidebar (`sidebar-itinerary.tsx` switch `default`) renders these
free-text reasons verbatim (lowercase-letter heuristic).

## Rate limiting is PRODUCTION-ONLY (dev/preview bypass)
`lib/rate-limit.ts` returns `{allowed:true}` when `NODE_ENV !== "production"`. **Why:** in the
Replit dev environment ALL traffic (preview pane, HMR, screenshots, curl, Playwright e2e) egresses
through ONE shared reverse-proxy IP, so the per-IP sliding window collapses into a single global
bucket — a handful of preview requests exhaust the 10/min limit for the whole environment, making
the planner unusable and 429-blocking e2e. Production clients keep distinct real IPs (limit intact).
**How to apply:** don't try to "fix" e2e 429s by restarting/spacing calls — that's the shared-IP
bucket, not your code.

## Testing the scheduler
Whole-project `tsc` gets OOM-killed. Transpile the single file standalone:
`npx tsc lib/itinerary/scheduler.ts --target es2022 --module es2022 --moduleResolution bundler --skipLibCheck --outDir /tmp/x`,
then run a node `.mjs` that imports `./scheduler.js` with mock `computeLeg`/`cityTravelMin`.
Remember slots before `dayStartTime` are always rejected when writing window tests.
