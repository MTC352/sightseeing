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
