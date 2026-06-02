---
name: Planner two trip stores
description: The /planner page has TWO separate localStorage trip stores with distinct roles; keep build paths consistent.
---

# Planner: working list vs saved library

The /planner page keeps **two independent, localStorage-backed trip collections**:

- **Working "My Trip" list** — `lib/planner-list-context.tsx` (`usePlannerList`, key `sightseeing_planner_list_v1`). This is what the **itinerary builds from**. Card control: "Add to planner list". Provider mounted in `app/layout.tsx` inside `CartProvider`.
- **Site-wide Saved Trips library** — `lib/cart-context.tsx` (`useCart`). Long-lived cross-site bookmark collection. Card control: the **Bookmark** button. "Load saved trips" merges this into the working list via `loadFromSaved`.

**Why:** the user explicitly wanted bookmarking (save for later, whole site) separated from the day-planning working set (drives the build). Conflating them (the old single cart) meant bookmarking a trip forced it into the itinerary.

## Availability gating — keep ALL build paths consistent
Working-list trips with no timeslots on the planned date are *disabled* (greyed overlay) and **excluded from every itinerary build**. There are multiple build entry points and they must agree:
- `SidebarItinerary` (the Build button) — filters via a `disabledIds` prop.
- `handleRegenerateItinerary` and `handleOpenOrRebuildFromChat` — filter via `plannerDisabledIdsRef.current` (a ref, because these callbacks are declared *above* where `plannerDisabledMap` is computed — referencing the memo directly would TDZ in the deps array).
- `cartFingerprint` (drift guard) **must be computed from the SAME active set** (working list minus disabled). If it isn't, a disabled trip left in the list makes the fingerprint disagree with the sidebar's build-input fingerprint forever → permanent false "Rebuild & View".

**How to apply:** any new path that sends trips to `/api/itinerary`, or any new fingerprint, must exclude the disabled set the same way. The disabled map derives from the existing per-date `plannerAvail` scan, so it updates reactively when the date changes.
