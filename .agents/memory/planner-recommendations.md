---
name: Planner recommendations canvas
description: How the Trip Planner canvas builds its recommendation list and why it is decoupled from the AI chat.
---

# Trip Planner "Recommended for you" canvas

The canvas recommendation list is **deterministic and decoupled from the AI chat stream**.
`resultTrips = displayedAiTrips.length > 0 ? displayedAiTrips : recommendedTrips` — it prefers
the AI's `searchTrips` result when present, else falls back to `recommendedTrips` (a useMemo
derived from `fallbackTrips` deterministic scoring). The AI chat is a separate helper that
can adjust prefs, which flow back into the list.

**Interest values MUST come from the available tag vocabulary** (`formOptions.interests`,
mirrors server `interestVocab`). The AI's free-text themes are mapped to canonical tags in the
prompt, but ALL pref-write paths also filter interests to that allowlist so a non-existent tag
(e.g. "culture") can't slip in and silently match zero trips. Per the four-paths rule the
allowlist guard lives in: onToolCall merge, `applyDirectPref`, AND `extractPrefsFromChat`
hydration (a persisted bad tool-call must not repopulate junk on restore).

**Trip-count discipline.** `searchTrips.total` is the raw tag/keyword match count
and does NOT apply the canvas's date-availability + interest filter, so it is almost always
higher than what the visitor sees (caused "4 suitable trips" while canvas showed 1). The AI
must NEVER quote `searchTrips.total`. The canvas badge (`onDate.length`) is the authoritative
count. The chat MAY cite that exact on-screen number: the client mirrors it into
`canvasCountForApiRef` and sends it every turn in the transport body as
`canvas:{count,date,ready}`; the route injects a "LIVE TRIP CANVAS COUNT" prompt line ONLY
when `canvas.ready` (avail scan settled + has results) AND `canvas.date === visitDateYMD`
(date alignment). When that line is absent the AI falls back to the old rule (no count except
a day-count confirmed via getTripDatesAndDeals/getTripTimeslots). **Why:** chat↔canvas count
parity — the AI could otherwise quote a higher number than the canvas showed.

**Canvas↔chat AVAILABILITY consistency (turn-1 ground truth).** The AI used to claim "no
trips available today" while the canvas badge showed N>0. Two-part cause + fix:
- *Timing:* the auto-seed message fired ~300ms after onboarding, BEFORE the 1-3s availability
  scan settled, so `canvas.ready=false` on turn 1 → no count/ground-truth line injected → AI
  free-wheeled. FIX: gate the auto-seed send on a `seedAvailReady` latch that opens when the
  availability scan settles (or a re-arming 6s fail-safe). The latch MUST be re-closed at BOTH
  lifecycle points where a new seed cycle begins — `resetPrefs()` and `handleOnboardingComplete()`
  (the latter because, while prefs are null, an empty-date avail scan's `.finally` prematurely
  reopens the latch before the new date's scan runs). The fail-safe deliberately trades strict
  grounding for liveness under >6s latency.
- *Prompt:* the count line only governed *quoting* a number, never *asserting* unavailability.
  FIX: when ready & date-matched, count>0 injects an "AVAILABILITY GROUND TRUTH" directive that
  FORBIDS claiming nothing-available / suggesting a date-switch-for-zero; no-date stays count-only.

**Zero-matches branch is DIRECTIVE, not permissive.** count===0 (date-matched) used to merely
permit "try another date", which let the model still falsely announce "the Trip Canvas now shows
<interest> today". Now it FORBIDS claiming the canvas shows/has/displays any matching trip for the
date, and hands the model two grounded recommendation paths so it acts like a human recommender,
not a questioner: **OPTION A** = the matching trip's other bookable dates, **OPTION B** = the
closest SIMILAR trip bookable that same day (recommend BY NAME + call searchTrips to refresh the
canvas, keeping chat↔canvas in sync). The client computes the extra payload in
`canvasCountForApiRef`: `otherDatesCount`/`otherDateSamples` (matching trips on OTHER dates, pretty
dates), `availableTodayCount`, and `availableTodaySamples` (catalog trips bookable on the date,
ranked by tag overlap with `prefs.interests`, top 3). All bounded to ≤3 samples for token budget;
effect writes only the ref (no setState). Route passes them through to `buildCanvasCountLine`.
**Canvas-provided dates are an explicit EXCEPTION to rule 9b-PRE** (never quote availability
without a tool call) — they come from the canvas's own verified live scan, so the model MAY quote
them directly. General rule #9 ("BE A RECOMMENDER, NOT A QUESTIONER") reinforces leading with a
concrete pick rather than only asking. **Why:** the AI hallucinated canvas state on zero-match
days; grounding it with real alt-dates + similar-trips makes the chat accurate AND useful.
**Why:** the canvas (`/api/planner/availability`, party+cancel filtered) is the single source
of truth; the AI must defer to it, never reach a contradictory availability conclusion.

**Remove/clear chat tools.** `removeFromCart` + `clearCart` are CLIENT-side tools (no server
`execute`) like addToCart; handled in `onToolCall` (app/planner/page.tsx). All three now share
ONE matcher — `resolveCartToolAction` (lib/planner/trip-match.ts) — resolving against the LIVE
My Trip list (id-first then normalized-title substring) and emitting HONEST success/failure
(refuse to confirm removing a trip not in the list). Keep any future cart-tool matching going
through `resolveCartToolAction` so add/remove/clear stay aligned.

**Why:** Previously the canvas waited on the first AI turn completing; when the AI key was
401 (common — both env and DB keys often fail) the canvas stuck on "Discovering…" forever
on reload. Decoupling fixed the infinite-loading reload bug and satisfies the product rule
that the canvas shows EVERY preference-matching trip, not an AI subset.

**How to apply:**
- Empty interests must STILL populate the canvas. Skipping all onboarding (`skipAll`) leaves `interests` empty by design, but `fallbackTrips` already degrades to weather/budget-scored top trips, so the canvas shows those. The interest gate exists in TWO places that must stay in lockstep: the `recommendedTrips` useMemo guard AND the canvas render branch (the `planner-recs-empty` "Tell the AI what you like" fallback). Gate the empty-state ONLY on `recommendedTrips.length === 0`, never on `interests.length`, or skip-all pins the canvas on "Finding your perfect trips…" while the chat claims it has options.
- Date is a FILTER (not visual-grouping-only): when a date is selected the canvas shows ONLY trips bookable on that date (the on-date group). The "Available on other dates" group is fallback-only — it renders strictly when `onDate.length === 0 && !availLoading && others.length > 0`, so a "this weekend"/date request never dilutes the canvas with the whole catalog yet is never left blank. **Why:** users asking "this weekend trips" saw all 18 catalog trips; they want only the available ones + the count. NOTE: "this weekend" resolves to a SINGLE Saturday startDate (merged date-resolution), so Sunday-only trips are excluded by design — making weekend a true Sat+Sun union would need a date-range model (prefs is single startDate).
- Availability comes from `/api/planner/availability` (admin-configurable window, default 30 days). The fetch effect must **clear `plannerAvail` to `{}` on every new scan and on failure** (fail-soft) so grouping never reflects a stale date.
- Single-pref editing: pills go through `applyDirectPref` (one field at a time). It supports wholesale `interests` array replacement (incl. empty) and includes interests in its unchanged-check. Editing a pill must NEVER restart onboarding or wipe chat history.

**Search-turn canvas-line staleness (anti-hallucination).** The "LIVE TRIP CANVAS COUNT"
prompt line is built from the request body, which carries the canvas state as it was BEFORE
the AI's `searchTrips` runs — so on the turn the AI searches a NEW interest set, that line
reflects the OLD (often count>0) set and the AI would falsely claim "the canvas now shows X
for that date." The fix: the client also sends a per-turn `availability` snapshot
(`availabilityForApiRef` = `{date, trips:{id:{onDate,dates[]}}}`, whole-catalog, only when a
date is set + scan settled). The server trusts it only when `snapshot.date === visitDateYMD`,
and `searchTripsTool` annotates its OWN result with an `availability` object computed for the
EXACT trips it returned (`availableOnVisitDateCount`, `noneAvailableOnVisitDate`,
`alternativeDates`, `similarAvailableOnVisitDate`). System rule **9-AVAIL** makes this
tool-result authoritative over the canvas line.
**Why:** the canvas line is structurally one turn behind on a search; only a value computed
DURING/AFTER the search is trustworthy for "does this run that day".
**How to apply:** any new per-turn truth the AI must not contradict has to be returned BY the
tool that changes the canvas, not injected from the pre-search request body. Server-side
per-request context (`_plannerAvail`/`_availDate`, like `_liveWeather`/`_defaultVisitDate`)
is module-global here — gate any grounding on `_availDate === _defaultVisitDate` so a
concurrent request's snapshot can't leak.

**Theme-level availability grounding (only suggest bookable interests).** The AI used to
re-suggest interest THEMES it had already ruled out on the unchanged visit date (said "no
museums today", then for a rainy follow-up suggested "museums or cultural tours"). Per-trip
availability only reaches the AI AFTER a searchTrips call; there was no standing per-turn
signal for which THEMES have a trip bookable that day. Fix: fold the same client availability
snapshot up to the interest level (`computeAvailableInterests` in lib/planner/available-interests.ts)
and inject an "AVAILABLE INTERESTS / NOT BOOKABLE ON <date>" block every turn; system rule
**9-AVAIL-INTERESTS** forbids proposing any theme not in AVAILABLE (overrides the generic
rule-2 weather "suggest indoor/culture" advice).
**Why:** weather/"what if it rains" prompts make the model freely name categories; without a
theme-level allowlist it names empty ones and contradicts itself a turn later.
**How to apply:** a theme is `available` if ANY tagged catalog trip is available; only
`unavailableOnDate` when ≥1 tagged trip is confidently off AND none available; unknown-only
themes (unconfirmed/not-scanned) are OMITTED from both lists so an outage is never shown as a
closure. Gate injection on `_availDate === visitDateYMD` (same module-global rule as the snapshot).

**Startup runs TWO availability scans — never trust the wrong one as turn-1 ground truth.**
On the planner page the availability effect fires a no-date WINDOW scan (`?party=N`, every
trip `availableOnSelectedDate=false`) before the date-specific scan (`?date=…`). If the
no-date scan's `.finally` opens the auto-seed gate first, turn-1 sees `canvasCount=0` while
`availableTodayCount>0` → the AI is fed the ZERO-MATCH "try another date" branch even though
trips ARE bookable today; the canvas later corrects to N but the stale seeded message stays.
**Why:** the seed gate (`seedAvailReady`) and the AI grounding refs (`canvasCountForApiRef`,
`availabilityForApiRef`) must reflect the SELECTED date's scan, not whichever settles first.
**How to apply:** track `availLoadedDate` (date the loaded `plannerAvail` reflects; `null`=no
scan, `""`=no-date scan), derive `availLoadedMatchesDate`, and gate `canvasCountForApiRef.ready`
+ the `availabilityForApiRef` snapshot on it. Re-close the seed gate at the START of every scan
(only the matching scan reopens it), and latch `didSendInitial` INSIDE the 300ms seed timeout
(not before) so a no-date→date gate flip cancels the pending send instead of permanently
blocking it — the cleanup `clearTimeout` keeps at most one pending, so no double-send.
