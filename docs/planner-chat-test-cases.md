# Trip Planner Chat — Test Cases

This is the canonical list of Trip Planner Chat test cases and how each is covered.
Today-anchored examples assume the dev fixture date (TourCMS returns live "today"
availability in dev).

## Two layers of automated coverage

1. **Deterministic unit tests** (`pnpm test`) — pure logic, runs offline, no AI/network.
   - `test/planner/system-prompt.test.mjs` → `buildCanvasCountLine` (chat↔canvas parity / ground truth).
   - `test/planner/availability-parity.test.mjs` → `interpretSingleDayFallback` (failed TourCMS ≠ "no slots").
2. **End-to-end app tests** (Replit testing skill, Playwright) — the live chat + canvas + tools.
   Non-deterministic AI responses are asserted by intent, not verbatim text.

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

## Running

- Unit: `pnpm test` (transpiles the two pure modules then runs `node --test`).
- E2E: via the Replit testing skill against `/planner` (planner must be public; dev has live availability).
