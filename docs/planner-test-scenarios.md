# Trip Planner — Test Scenarios (living document)

> **Purpose:** the single source of truth for what the Trip Planner must do. Every
> time a new planner behavior, bug, or edge case is discovered, ADD it here so the
> next automated test run covers it. When asked to "test the trip planner", run
> through **all** scenarios in this file.
>
> Covers three surfaces: **Chat**, **Canvas update**, **Interactions**.
>
> Site PIN gate: enter `3462` if prompted. Planner path: `/planner`. Chat persists to
> localStorage `sightseeing_chat_v1`; prefs mirror to cookie `sightseeing_prefs` +
> localStorage `sightseeing_prefs_v1`; working list `sightseeing_planner_list_v1`.
> Note: the headless test browser has NO WebGL, so a "Failed to initialize WebGL"
> map error is EXPECTED and is never a failure.

---

## A. Trip Planner CHAT

- **A1. Onboarding — full flow.** Answer every step (group/party → interests →
  duration/days → budget → date). Chat + recommendations load; prefs persist.
- **A2. Onboarding — skip ONE step (`skipStep`).** The skipped step gets a sensible
  default; remaining answered steps keep their values; flow advances.
- **A3. Onboarding — skip ALL (`skipAll`).** Defaults fill every unanswered field
  (incl. EMPTY interests). **Canvas MUST still populate with trips** — regression
  guard for the "canvas stuck on Finding your perfect trips… while chat says it has
  options" bug. No perpetual spinner.
- **A4. Send a free-text chat message.** AI responds; recommendations/canvas may
  update via `searchTrips`. Composer never freezes (even on error status).
- **A5. AI tool calls render correctly:** `searchTrips` (canvas grid updates),
  `showWeather` (temp card), `showWeatherAlert` (single "Perfect Day…"/rainy card),
  `updatePreferences` (prefs bar reflects change), `offerCoupon` (coupon card),
  `getTripDetails` (details in chat), `buildItinerary` (itinerary on canvas).
- **A6. Weather card is NOT duplicated.** At most ONE weather-alert card in chat at
  any time, including after re-renders. Regression guard for the duplicate-message
  (duplicate React key) crash.
- **A7. Suggestion chips — direct-pref chips.** Chips with a `patch` (e.g. duration,
  date, no-early-morning) apply ONE field via `applyDirectPref` and rebuild
  deterministically WITHOUT an AI round-trip.
- **A8. Suggestion chips — AI-routed chips.** Chips without a patch send text through
  the AI (`handleSend`) and produce a normal assistant turn.
- **A9. AI error / fallback.** If the AI key is invalid/unreachable, chat shows a
  friendly "⚠️ couldn't reach the AI" bubble, the canvas falls back to the
  deterministic scored grid, and the composer re-enables.
- **A10. Chat persistence across reload.** After a conversation, reload the page; the
  prior chat restores from localStorage and the seed message is NOT re-fired.
- **A11. Feedback thumbs up/down** on an assistant message registers (button state
  changes) without errors.

## B. Trip CANVAS update

- **B1. Recommended-for-you grid** populates with preference-matched trips once prefs
  are known (deterministic, decoupled from the AI stream).
- **B2. Weather header** shows current temperature + condition (sunny/rainy/cloudy
  icon) for Luxembourg.
- **B3. Discovering/loading state** shows skeleton cards only briefly and resolves —
  never an infinite "Finding your perfect trips…" when trips exist.
- **B4. Empty-interests canvas (ties to A3).** With no interests chosen, the canvas
  shows weather/budget-scored top trips, never blank.
- **B5. Availability date grouping.** With a date chosen, trips bookable on that date
  float to the top / group separately from unavailable-on-date trips.
- **B6. Map expand/collapse** toggles; numbered itinerary pins vs. search-result pins
  render (verify via DOM/geocoding, not WebGL canvas).
- **B7. Itinerary rendering on canvas** after a build — ordered steps with times.
- **B8. PDF export** (`handleDownloadItineraryPdf`) downloads an itinerary PDF using
  the full-data `centerItinerary` (has lat/lng/tips/prices).
- **B9. Canvas empty/initial state** (no prefs yet) shows "Plan your perfect day".

## C. INTERACTIONS

- **C1. Open trip detail modal** from a recommended card (`setSelectedTrip`). Opens a
  detail/booking view in the center panel; does NOT navigate away; does NOT duplicate
  weather cards or crash (regression guard).
- **C2. Close trip detail** returns to recommendations; repeat open/close on multiple
  trips stays stable.
- **C3. Add to My Trip working list** (`addItem`) — item appears in the "My Trip"
  panel; empty-state message disappears.
- **C4. Remove from working list** (`removeItem`) — item leaves the list.
- **C5. Bookmark / Save to library** (separate from working list) and **Load saved
  trips** merges saved into the working list.
- **C6. Change date** via the prefs bar — re-checks availability (new
  `/api/planner/availability` call) and re-groups recommendations.
- **C7. Change party size** — availability re-checked with new party; slots that
  can't seat the group are excluded.
- **C8. Build itinerary** from the working list — multi-stage loader runs, then a
  sequenced timeline renders on the canvas.
- **C9. Regenerate itinerary** after changing prefs/list — plan rebuilds and stays in
  sync with the working list (date-disabled trips excluded).
- **C10. Plan-conflict resolution.** Overpacked list surfaces options ("make it
  full-day" / "drop trips"); choosing one resolves and rebuilds.
- **C11. Reset preferences** (`onReset`) clears prefs back to empty and re-shows
  onboarding / "Plan your perfect day".
- **C12. Mobile layout toggles.** Sidebar (chat) and cart (My Trip) drawers open/close
  on narrow viewports without leaking desktop collapse state.

---

## How to run

Use the `testing` skill's `runTest`. Group scenarios into focused runs (onboarding +
canvas; chat + weather + trip-detail regression; interactions + itinerary). Always
enter the PIN `3462` first and ignore the headless WebGL map error.
