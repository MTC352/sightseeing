---
name: Planner chat — availability consistency, tool-replay, error logging
description: Durable invariants for the Trip Planner chat (canvas↔chat availability parity, OpenAI Responses tool-history replay, AI failure logging coverage, free-text interest filtering).
---

# Trip Planner chat — hard invariants

## 1. OpenAI Responses tool-history replay must be deduped by toolCallId
**Rule:** When replaying prior assistant tool history to the OpenAI **Responses** API
(AI SDK v5), the message sanitizer MUST drop duplicate tool parts by `toolCallId`
(keep first). A v5 tool part is *self-contained* (input + output in one part), so
dropping a whole duplicate removes both the tool_use and tool_result with no dangling
reference.
**Why:** Replayed duplicates trigger a hard `400 "Duplicate item found with id fc_..."`,
which the user sees as the generic **"I couldn't reach the AI assistant"** bubble.
This was a real, recurring production failure on the turn *after* a tool-using reply.
**How to apply:** Lives in `sanitizePlannerMessages` (app/api/planner/route.ts). Any
new planner tool or any other Responses-API chat route that replays history needs the
same dedupe.

## 2. Auto-seed must wait for the availability scan (turn-1 canvas↔chat race)
**Rule:** The planner's first auto-seed chat message must be gated on the FIRST
`/api/planner/availability` scan settling (`seedAvailReady`, with a ~6s fail-safe
timeout), and the gate must be **re-closed** on every prefs/date change and on
"start over"/reset.
**Why:** The canvas availability scan takes 1–3s; the seed used to fire ~300ms after
onboarding, so on turn 1 `canvas.ready=false` → the ground-truth count line is omitted
→ the AI free-wheels **"no trips available today"** while the canvas badge shows
"Available on Today: N". Re-closing on reset prevents the next onboarding cycle's seed
from firing before the new date's scan.
**How to apply:** `seedAvailReady` state + the re-arming fail-safe effect, plus
`setSeedAvailReady(false)` in `handleOnboardingComplete` and `resetPrefs`
(app/planner/page.tsx). Seed text itself must defer to the canvas, never instruct an
independent availability re-check.

## 3. Availability ground-truth is the canvas count, not the AI's own tool math
**Rule:** When the client echoes a ready, date-matched canvas count, the route injects
a ground-truth line (`buildCanvasCountLine`, lib/planner/system-prompt.ts): count>0 →
the AI MUST NOT claim nothing is available on that date and MUST NOT suggest switching
dates for zero availability; count===0 → it MAY offer another date; no-date → count-only.
**Why:** The canvas already ran the authoritative party+cancel-filtered availability
scan; `searchTrips.total` (raw tag matches) is almost always higher and contradicts the
on-screen badge.
**How to apply:** Returns "" (line omitted) unless `canvasReady && canvasDate === visitDate`.
The client must send `canvas:{count,date,ready}` every request.

## 4. AI failure logging has THREE phases — all must log
**Rule:** AI SDK streaming chat has three independent failure phases, each needing its
own log so admins always get a row:
- `streamText({onError})` — generation/provider errors.
- `toUIMessageStreamResponse({onError})` — stream serialization; this maps to a client
  token (AI_AUTH/AI_TEMP) and historically did NOT log → blind spot.
- **client** `onError` — transport/aborted stream; needs a public beacon endpoint
  (`POST /api/planner/log-error`, fire-and-forget, always 204, input truncated,
  **rate-limited** because it's an unauthenticated write path).
**Why:** Users reported the "couldn't reach AI" bubble with NO row in `/admin/logs`.
The gap was phase 2 + the missing client beacon. Real causes only became visible once
all three logged: duplicate-`fc` 400 (see #1) and OpenAI gpt-4o-mini TPM
`rate_limit_exceeded` (transient — degrades gracefully as AI_TEMP retry).
**How to apply:** Use `logCaughtError`/`logError` + `requestMeta(req)` (lib/error-log.ts),
source `ai:planner`. Any new AI streaming route needs all three.

## 5. Free-text interests are a deterministic FILTER, not small-talk
**Rule:** The canvas filters deterministically by *stored* interests; the AI only
changes it by calling `updatePreferences(interests[]) + searchTrips(tags)` in the SAME
turn. Naming activities ("boat ride and museum") = an interest selection (even on the
first message). "show me all/everything/clear filters" = `updatePreferences({interests:[]})`
+ `searchTrips` with no tags.
**Why:** gpt-4o-mini otherwise just chats ("which first?") and the canvas never updates;
or it leaves a stale filter and falsely says "no trips available" while the canvas shows one.
**How to apply:** Synonym map + filter/broaden directives in lib/planner/system-prompt.ts.
Keep the synonym map aligned with the real `trip_tags` vocabulary.
