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
  FORBIDS claiming nothing-available / suggesting a date-switch-for-zero; count===0 permits
  "try another date"; no-date stays count-only.
**Why:** the canvas (`/api/planner/availability`, party+cancel filtered) is the single source
of truth; the AI must defer to it, never reach a contradictory availability conclusion.

**Remove/clear chat tools.** `removeFromCart` + `clearCart` are CLIENT-side tools (no server
`execute`) like addToCart; handled in `onToolCall` (app/planner/page.tsx). They resolve against
the LIVE My Trip list (`cartSummaryForApiRef`, id-first then normalized-title substring) and
emit HONEST success/failure (refuse to confirm removing a trip not in the list). NOTE: addToCart
still uses weaker title resolution — long/suffixed titles (e.g. "... (OTA)") can mis-map; align
it with removeFromCart's matcher if revisiting.

**Why:** Previously the canvas waited on the first AI turn completing; when the AI key was
401 (common — both env and DB keys often fail) the canvas stuck on "Discovering…" forever
on reload. Decoupling fixed the infinite-loading reload bug and satisfies the product rule
that the canvas shows EVERY preference-matching trip, not an AI subset.

**How to apply:**
- Empty interests must STILL populate the canvas. Skipping all onboarding (`skipAll`) leaves `interests` empty by design, but `fallbackTrips` already degrades to weather/budget-scored top trips, so the canvas shows those. The interest gate exists in TWO places that must stay in lockstep: the `recommendedTrips` useMemo guard AND the canvas render branch (the `planner-recs-empty` "Tell the AI what you like" fallback). Gate the empty-state ONLY on `recommendedTrips.length === 0`, never on `interests.length`, or skip-all pins the canvas on "Finding your perfect trips…" while the chat claims it has options.
- Date is a FILTER (not visual-grouping-only): when a date is selected the canvas shows ONLY trips bookable on that date (the on-date group). The "Available on other dates" group is fallback-only — it renders strictly when `onDate.length === 0 && !availLoading && others.length > 0`, so a "this weekend"/date request never dilutes the canvas with the whole catalog yet is never left blank. **Why:** users asking "this weekend trips" saw all 18 catalog trips; they want only the available ones + the count. NOTE: "this weekend" resolves to a SINGLE Saturday startDate (merged date-resolution), so Sunday-only trips are excluded by design — making weekend a true Sat+Sun union would need a date-range model (prefs is single startDate).
- Availability comes from `/api/planner/availability` (admin-configurable window, default 30 days). The fetch effect must **clear `plannerAvail` to `{}` on every new scan and on failure** (fail-soft) so grouping never reflects a stale date.
- Single-pref editing: pills go through `applyDirectPref` (one field at a time). It supports wholesale `interests` array replacement (incl. empty) and includes interests in its unchanged-check. Editing a pill must NEVER restart onboarding or wipe chat history.
