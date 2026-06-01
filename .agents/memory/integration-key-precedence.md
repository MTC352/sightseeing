---
name: Integration key precedence
description: How API keys (Mapbox, TourCMS/Palisis, OpenWeather, Google, Anthropic) are resolved across DB vs env.
---

# Integration key precedence — DB first, env fallback

The admin panel (`integrations` table via `dbGetSettings().apiKeys`) is the source
of truth for ALL third-party keys. Env vars are only a local/dev fallback used when
the DB has no key.

**Why:** the user manages keys through `/admin/integrations`; a stale env var must
never silently win over a key the admin just saved. (Mapbox, TourCMS, and OpenWeather
originally read env first — that was the bug.)

**How to apply:** any new integration key lookup must try `dbGetSettings()` first,
then fall back to `process.env`. Resolved in: `app/api/mapbox-token/route.ts`,
`lib/tourcms.ts` getTourCMSConfig, `lib/weather.ts` getRainyDateSet,
`app/api/weather/route.ts`. Google + Anthropic were already DB-first.

Note: Anthropic key has historically been identical in env and DB and returns 401
(expired) — chat/AI is dead until the user supplies a valid key. AI paths fail soft.
