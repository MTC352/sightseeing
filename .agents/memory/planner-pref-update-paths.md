---
name: Planner preference update paths
description: The 4 separate places that must stay in sync when changing planner preference rules/caps
---

# Planner preference update paths (keep in sync)

In `app/planner/page.tsx`, a preference (e.g. party size, budget, interests) can be
mutated through **four independent code paths**. A rule or cap change (like the
combined party cap `MAX_PARTY`) must be applied to ALL of them or the UI desyncs:

1. **Onboarding wizard steppers** — `bumpAdults` / `bumpChildren` (and the askParty
   sub-step `PartyStepper`s with `incDisabled`).
2. **`applyDirectPref`** — single-field patches from `EditablePrefsBar` pills /
   suggestion chips. NOTE: this function only handles fields it explicitly lists;
   it silently ignores any field not coded in (adults/children had to be added).
3. **Chat merge in `onToolCall`** — the `updatePreferences` AI tool result is merged
   client-side here; clamp after the per-field merge.
4. **Route zod schema** — `updatePreferencesTool.inputSchema` in
   `app/api/planner/route.ts` is the server-side bound the AI is constrained to.

**Why:** these paths evolved separately; e.g. `applyDirectPref` originally did not
touch adults/children, so a new editable pill appeared to do nothing.

**How to apply:** when changing any preference validation/cap, grep all four sites
and update each, plus the `unchanged` no-op check inside `applyDirectPref` /
`onToolCall` (omitting a field there causes stale-skip or needless rebuilds).
