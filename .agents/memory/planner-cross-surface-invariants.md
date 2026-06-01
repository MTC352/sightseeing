---
name: Planner cross-surface invariants
description: Two places that must change together in the Trip Planner — Palisis-id resolution and multi-day suppression — to avoid one surface silently diverging.
---

# Palisis-id resolution lives in TWO routes

There are two independent `resolvePalisisId` functions: one in `app/api/planner/route.ts`
(chat) and one in `app/api/itinerary/route.ts` (build). They must stay behaviorally identical.

**Rule:** Both are fail-closed — a trip's Palisis tour_id comes ONLY from its **published**
DB row. No heuristic guessing (never strip the `tcms_` prefix to fabricate an id). If a trip
isn't in our DB or isn't published, it's not plannable → return null.

**Why:** A past pass fixed only the planner route; the itinerary route kept a heuristic
fallback, so the two surfaces resolved trips differently. Palisis is read-only upstream and
every plannable trip is imported with its real `palisis_id`, so the fallback was both unsafe
and unnecessary.

**How to apply:** When touching Palisis-id logic, edit BOTH functions in lockstep.

# Multi-day suppression spans FIVE surfaces

"Hide multi-day" is not a single toggle. To keep it fully hidden, all of these must agree:
1. `app/planner/page.tsx` — `DEFAULT_DURATION_OPTIONS` excludes `multi-day`.
2. `app/planner/page.tsx` — onboarding filters admin-provided durations
   (`DURATION_OPTIONS_RAW.filter(o => o.value !== "multi-day")`) so admin config can't surface it.
3. `app/api/itinerary/route.ts` — the plan-conflict options must NOT emit a `switch-multiday`
   option (it would re-enable multi-day via the conflict flow).
4. `app/api/planner/route.ts` — the `updatePreferences` tool `duration` enum excludes `multi-day`
   (blocks chat-driven re-enable).
5. `app/planner/page.tsx` `buildPrefs` (prefs hydration) — coerce legacy persisted
   `duration:"multi-day"` to a single-day plan so stale cookie/localStorage can't reintroduce it.

**Why:** Hiding only the onboarding option left multi-day reachable through the conflict flow,
the chat tool, and old persisted prefs.

**How to apply:** If re-enabling multi-day later, flip all five together.

# Planner chat trip discovery is AI-only — client must fail soft

The planner chat (`/api/planner`) discovers/recommends trips ONLY through the AI's
`searchTrips` tool calls — there is NO deterministic discovery fallback in the route
(unlike the itinerary engine, which has a server-side deterministic scheduler).

**Consequence:** When the AI key 401s (common in dev), the chat stream errors and emits
no `searchTrips` output, so `aiTrips` stays empty. The CLIENT must fail soft: `useChat`'s
`onError` flips `hasCompletedFirstAiTurn` true so the canvas renders the deterministic
client-side `fallbackTrips` grid (interest-scored over the DB catalog) instead of spinning
forever on "Finding your perfect trips…".

**Why:** `discoveringPrefs = prefs && interests>0 && !hasCompletedFirstAiTurn`. That gate is
normally cleared by the streaming→done transition; on an AI error that transition can be
missed, so without `onError` the spinner never clears.

**How to apply:** Don't assume the planner degrades gracefully just because the itinerary
engine does — they're separate. Any change to chat error handling must keep the first-turn
gate getting flipped on failure.
