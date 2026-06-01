---
name: Planner recommendations canvas
description: How the Trip Planner canvas builds its recommendation list and why it is decoupled from the AI chat.
---

# Trip Planner "Recommended for you" canvas

The canvas recommendation list is **deterministic and decoupled from the AI chat stream**.
`resultTrips = recommendedTrips` (a useMemo derived from `fallbackTrips` deterministic
scoring), NOT from the AI's selected/streamed trips. The AI chat is a separate helper that
can adjust prefs, which flow back into the list.

**Why:** Previously the canvas waited on the first AI turn completing; when the AI key was
401 (common — both env and DB keys often fail) the canvas stuck on "Discovering…" forever
on reload. Decoupling fixed the infinite-loading reload bug and satisfies the product rule
that the canvas shows EVERY preference-matching trip, not an AI subset.

**How to apply:**
- Recommendations require `prefs.interests.length > 0`; empty interests → empty canvas (shows onboarding-style empty state).
- Date is VISUAL GROUPING ONLY (no clickable filter): available-on-selected-date trips group on top, others below with their own available-date chips.
- Availability comes from `/api/planner/availability` (admin-configurable window, default 30 days). The fetch effect must **clear `plannerAvail` to `{}` on every new scan and on failure** (fail-soft) so grouping never reflects a stale date.
- Single-pref editing: pills go through `applyDirectPref` (one field at a time). It supports wholesale `interests` array replacement (incl. empty) and includes interests in its unchanged-check. Editing a pill must NEVER restart onboarding or wipe chat history.
