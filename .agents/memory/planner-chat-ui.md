---
name: Planner chat UI gotchas
description: Non-obvious behaviors of the /planner client chat — send-guard after AI error, and where the duration cap on recommendations lives.
---

# Planner chat UI (app/planner/page.tsx)

## `handleSend` must NOT gate on `status === "ready"`
The AI SDK v6 `useChat` status becomes `"error"` after a failed turn (e.g. the
Anthropic key is invalid → very common in this repl). A `handleSend` guard of
`status !== "ready"` then silently drops EVERY later send — typed messages AND the
suggestion pills (non-patch pills route through `handleSend`). Result: chat looks
frozen after one error.
**Rule:** block only while actively in flight: `status === "streaming" || "submitted"`.
**Why:** `sendMessage()` always restarts the request regardless of prior status, so
sending from `"error"` is safe and is the intended retry path.
**How to apply:** any new send/guard in the planner chat must allow the `"error"`
state through. Patch-pills (`applyDirectPref`) already bypass the chat entirely.

## Recommendation "time available" duration cap
The "Recommended for you" grid is fed by `recommendedTrips` ← `fallbackTrips`
useMemo (NOT the AI `aiTrips` list). To exclude trips longer than the visitor's
selected time, the cap is applied INSIDE `fallbackTrips` via `durationCapHours(prefs.duration)`
(`"1-2h"`→2h, `"half-day"`→4h, everything else uncapped) + `fitsCap()` using
`parseDurationHoursMin` from `lib/duration-parser` (shortest option of multi-option
trips; unparseable durations are kept).
**Why:** the AI selection path doesn't reliably honor duration, and the grid renders
the deterministic fallback list, so the cap belongs there to be source-agnostic.
**How to apply:** a strict cap can legitimately empty the grid — there is a
`planner-recs-none-fit` empty state for that; don't treat empty as a bug.

## "couldn't reach the AI assistant" can be a CLIENT React crash, not a network/AI failure
The planner chat error bubble ("⚠️ I couldn't reach the AI assistant just now…")
is rendered by `useChat`'s `onError`. `onError` fires for ANY thrown error during a
turn — including a client-side React crash ("Maximum update depth exceeded …
setState inside componentWillUpdate or componentDidUpdate") — even when
`POST /api/planner` already returned 200 and the AI replied. So a green network tab
+ that bubble = look for a self-retriggering effect, not an AI/key problem.
**Root pattern:** an effect that BOTH calls a setter and lists that same state in its
dependency array (the "commit-aiTrips" effect did: deps included `committedAiTrips`
+ `hasCompletedFirstAiTurn` which it also set). When `aiTrips` identity churns
mid-turn the value-guard may not settle within React's nested-update budget → crash.
**Rule:** any effect that writes state X must NOT list X in its deps. Read self-set
values via refs (sync them in tiny effects declared BEFORE the consumer effect);
depend only on the genuine external inputs.
**Diagnosis aid:** client crashes are beaconed to `/api/planner/log-error` (→
`error_logs` source `ai:planner`). `kind:"client-runtime"` = React/runtime crash
(AI was reachable), `kind:"temp"` = real reachability failure, `kind:"auth"` = bad key.
`onError` classifies via the `isClientRuntime` regex and RETURNS EARLY for runtime
crashes so it never appends the misleading bubble.
