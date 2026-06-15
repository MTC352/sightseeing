---
name: Planner public-visibility gating
description: How the "hide planner from public" gate avoids content flash + browser caching, and how to e2e test it.
---

The planner can be hidden from non-logged-in visitors via a boolean in
`ai_system_configs.extra_config.hidePublicPlanner` (system_key='planner'),
exposed by the public `GET /api/planner/visibility` route (admins bypass via
session). Both the navbar `/planner` link and the planner page consume it.

**Rule — client-side gating must not flash the gated content.** While the
visibility check is pending (`plannerHidden === null`), render a loading state,
NOT the default (visible) content. Rendering the planner during the pending
window leaks the hidden planner to public users for a moment AND makes e2e tests
flaky (a slightly-slow test captures the flash and fails).

**Rule — same-origin GET gate fetches need no-store on BOTH ends.** Set
`Cache-Control: no-store` on the API response *and* `cache: "no-store"` on every
client `fetch` (navbar + page). Without it the browser serves a stale cached
`{hidden:...}` result, so toggling the flag has no visible effect until reload.

**Why:** during this feature's e2e, the server endpoint was provably correct
(`{"hidden":true}` via curl) yet the navbar still showed the link and the page
still rendered — caused by (a) the navbar fetch lacking no-store and (b) the
page flashing during the null window. Fixing both made the gate deterministic.

**How to test:** complete-onboarding-with-an-interest is required to populate the
deterministic recommendations canvas — `recommendedTrips` returns `[]` when
`prefs.interests.length === 0`, so "Skip all" yields an empty canvas and you
cannot reach the itinerary/add-trip flows. Keep the visibility contract stable
(`{hidden: boolean}` + no-store).
