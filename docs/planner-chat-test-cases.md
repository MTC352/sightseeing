# Trip Planner Chat — Test Cases

This is the canonical list of Trip Planner Chat test cases and how each is covered.
Today-anchored examples assume the dev fixture date (TourCMS returns live "today"
availability in dev).

## Two layers of automated coverage

1. **Deterministic unit tests** (`pnpm test`) — pure logic, runs offline, no AI/network. (20 tests)
   - `test/planner/system-prompt.test.mjs` → `buildCanvasCountLine` (chat↔canvas parity / ground truth).
   - `test/planner/availability-parity.test.mjs` → `interpretSingleDayFallback` (failed TourCMS ≠ "no slots").
   - `test/planner/sanitize-messages.test.mjs` → `sanitizePlannerMessages` (tool-history replay: drop unresolved / input-less parts, dedupe by `toolCallId` to avoid the OpenAI Responses "Duplicate item found with id fc_…" 400 that surfaced as "couldn't reach the AI assistant").
2. **End-to-end app tests** (Replit testing skill, Playwright) — the live chat + canvas + tools.
   Non-deterministic AI responses are asserted by intent, not verbatim text. The AI/UI-coupled
   flows (recs populate, weather, date change, add/remove/clear, free-text filtering, reset) are
   covered here rather than as unit tests because they depend on the live model, the canvas
   availability scan, and React context state — there is no pure function to assert.

## Case list

| # | Case | Layer | Assertion |
|---|------|-------|-----------|
| 1 | Canvas↔chat availability consistency (turn 1) | unit + e2e | When canvas badge N>0 for the visit date, the AI must NOT claim "no trips available today" / suggest a date switch for zero availability. `buildCanvasCountLine` injects the GROUND TRUTH directive; e2e verifies the first reply. |
| 2 | Count parity ("how many trips today?") | unit + e2e | AI's stated number equals the canvas "Available on …" badge (e.g. 10 == 10). |
| 3 | count===0 permissive | unit | When the canvas truly shows 0 for the date, the AI MAY say nothing matches and offer another date. |
| 4 | Stale/loading count never quoted | unit | `buildCanvasCountLine` returns "" when not ready or when canvas date ≠ stored visit date. |
| 5 | Recommendations populate | e2e | Trip Canvas shows ≥1 card after onboarding/skip-all. |
| 6 | Weather question | e2e | "what's the weather like?" → temperature + condition reply. |
| 7 | Date change ("this weekend") | e2e | Canvas badge switches away from "Today" to the weekend date; AI defers to canvas, no contradiction. |
| 8 | Add to My Trip list via chat | e2e | Named trip appears in the right sidebar; AI confirms honestly. |
| 9 | Remove from My Trip list via chat | e2e | Trip leaves the sidebar; AI confirms removal honestly (won't confirm removing a trip not in the list). |
| 10 | Clear whole list via chat | e2e | Sidebar empties; AI confirms cleared. |
| 11 | Reset / "Start over" regression | e2e | After reset + new onboarding, turn-1 reply still consistent with the canvas badge (gate re-closes in `resetPrefs` + `handleOnboardingComplete`). |
| 12 | Single-day availability fallback never fakes "no slots" | unit | `interpretSingleDayFallback`: null/ok:false → "error" (surfaces TOURCMS_ERROR), ok+components → "has-slots", ok+empty → "empty". |
| 13 | Free-text interests FILTER the canvas (not small-talk) | e2e | Typing "I want a boat ride and museum visit" makes the AI call `updatePreferences({interests:["boat-tours","museums"]})` + `searchTrips`, so the Trip Canvas narrows to boat + museum trips. The AI must NOT merely ask "which first?" without filtering. Synonyms (boat ride/cruise → boat-tours, museum/gallery → museums) are mapped in the system prompt. |
| 14 | AI-unreachable failures are logged to /admin/logs | e2e | When the chat shows "couldn't reach the AI assistant", a row is written to `error_logs` (source `ai:planner`). Covered server-side (`streamText.onError` + `toUIMessageStreamResponse.onError`) and client-side (the `/api/planner/log-error` beacon fired from the planner `onError`). |
| 15 | Tool-history replay never crashes the next turn | unit | `sanitizePlannerMessages` drops unresolved / input-less tool parts (Anthropic `tool_use.input` 400) and dedupes resolved parts by `toolCallId` (OpenAI Responses "Duplicate item found with id fc_…" 400). 9 cases incl. keep-first dedupe, distinct ids retained, output-error retained, sibling text survives, `dynamic-tool` parity. |
| 16 | Free-text "show me all trips" broadens (clears the interest filter) | e2e | After narrowing to one interest, "show me all trips instead" makes the AI call `updatePreferences({interests:[]})` + `searchTrips` so the canvas broadens back; the AI must NOT claim "no trips available" while the canvas shows trips. |

> **Ghost-card note (reviewer follow-up):** date-aware recommendation correctness is enforced
> deterministically by the **Trip Canvas filter** (date availability is a hard FILTER applied to
> whatever ids the AI pins), not only by the prompt — so a trip the AI pins that is unbookable on
> the selected date is suppressed by the canvas and never renders. The prompt ground-truth line is
> a second layer that stops the AI from *describing* unavailable trips.

## Running

- Unit: `pnpm test` (transpiles the pure `lib/planner` modules then runs `node --test`). 20 tests, 0 fail.
- E2E: via the Replit testing skill against `/planner` (planner must be public; dev has live availability).
  Executed this cycle: turn-1 canvas↔chat consistency, recs populate, free-text interest filter (#13),
  broaden/clear (#16), and the multi-turn tool-replay turn (no "couldn't reach the AI assistant").
