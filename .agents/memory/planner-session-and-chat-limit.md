---
name: Planner session reset & chat turn limit
description: How the Trip Planner becomes session-scoped (browser-close wipe) and how the admin chat-turn limit is enforced.
---

# Planner session-scoped reset

The planner's persisted stores are wiped once per *browser session* (cleared on
browser/tab close) but PRESERVED across normal reloads, so each new visit starts fresh.

**Mechanism:** a `sessionStorage` marker (`sightseeing_planner_session`). sessionStorage
survives reloads but is cleared on browser close. On planner mount: marker ABSENT → new
session → wipe; marker PRESENT → reload → keep. Then set the marker.

**Why the wipe must run synchronously in the component render body (ref-guarded), NOT in a
useEffect:** the planner restore paths read storage at different times — a synchronous chat
restore, prefs/itinerary restore effects, AND the parent `PlannerListProvider` list-restore
`useEffect`. A child render runs before any of those effects fire, so a synchronous wipe in
the child body beats all of them and avoids a stale-state flash. If you move the wipe into an
effect it will race the restores.

**Stores wiped (session-scoped):** prefs cookie + localStorage mirror `sightseeing_prefs_v1`,
`sightseeing_chat_v1`, `sightseeing_itinerary_v2`, `sightseeing_planner_list_v1`.
**KEPT (site-wide library):** `sightseeing_cart_v2`, `recently_viewed`.

**Fail-safe:** if sessionStorage access throws, do NOT wipe (preserve existing behavior).

# Admin chat turn limit (maxChatTurns)

`maxChatTurns` lives in `extra_config.planner.form` on the `ai_system_configs` `chat` row
(next to `maxInterests`). `0 = unlimited`. Plumbed through `DEFAULT_PLANNER_FORM` +
`dbGetChatPlannerConfig` (sanitize clamp), admin PUT route, admin UI numeric input, public
`form-config` GET, client enforcement, and server enforcement in the planner route.

**Off-by-one (intentional, keep in lockstep):** client blocks new sends at
`userTurnCount >= maxChatTurns`; server rejects only when `userTurns > maxChatTurns`. Because
the outgoing request already includes the just-added user message, the Nth message (N===limit)
is the *last allowed* and N+1 is blocked.

**Auto-seed counts as turn 1:** the planner auto-sends a first user message right after
onboarding, and it counts toward the limit. So `maxChatTurns=1` allows zero manual follow-ups;
`=2` allows one. Admin helper text documents this — keep copy and counting in sync if changed.

**Server response:** 413 JSON (same pattern as the existing oversized-chat guard), handled by
`useChat` onError without crashing. `PLANNER_BUDGET` (maxMessages 80) stays as the hard backstop.
Server fails OPEN if the config read errors.
