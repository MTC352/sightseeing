---
name: Best outdoor experiences today (outdoor-today API)
description: How the homepage "Best outdoor experiences today" section sources, ranks, and falls back to trips.
---

`GET /api/outdoor-today` powers the homepage "Best outdoor experiences today" block
(`components/outdoor-today-trips.tsx`, mounted via `components/home-sections.tsx`).

## Config
- AI settings live in `ai_system_configs` under system_key `outdoor_today` (read via
  `dbGetSettings().ai.outdoor_today`). `extra.display_count` = how many cards to show
  (default 2); admin edits it at `/admin/ai-systems/outdoor-today`.
- Anthropic key: DB `apiKeys.anthropic` overrides env `ANTHROPIC_API_KEY`. No key →
  deterministic `weatherTagMatch` fallback (outdoor=excellent on dry days, etc.).
- 10-min server cache, key is **day-scoped** (`todayYMD()` in Europe/Luxembourg) +
  displayCount, so it refreshes daily and when the admin count changes.

## Must never render empty (fallback rule)
The section must ALWAYS show trips when the DB has any published trip.
**Why:** it previously went blank — when TourCMS is the booking source, eligible trips
were filtered to only those with a live slot *today*; if none had today-slots (evening,
or a slow/failed TourCMS fetch) the result was `trips: []` AND that empty payload got
cached for 10 min.
**How to apply:** in the route, after filtering `eligibleTrips` to today-slot trips,
if it's empty fall back to `allTrips.slice(0,20)`. Only return the empty payload when
the DB itself has zero trips. Fallback trips simply omit the "Today HH:MM" badge and
use `trip.price`. Once real today-slots appear, the day-scoped cache swaps them back in.

## Slot sourcing
Uses `showTourDatesAndDeals` (calendar API, no rate params) — NOT `checkAvailability`
(which needs r1/r2 rate selection to return slots). Slots filtered by `isFutureSlot`
(prefers `start_time_utcseconds`, else HH:MM vs Luxembourg now).
