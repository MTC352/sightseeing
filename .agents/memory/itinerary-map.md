---
name: Itinerary map (trip detail)
description: Public trip-detail itinerary map + per-step optional locations; how to TEST map features given headless WebGL limits.
---

# Itinerary map on trip detail

- ItineraryStep carries OPTIONAL `lat`/`lng`/`placeName` inside the `itinerary_steps` JSONB (no DB migration). Steps without coords render in the list with no marker — locations are optional everywhere (save normalization, page parser, frontend, admin editor, AI geocoding).
- Frontend: `components/trip-itinerary.tsx` (list + Mapbox map, numbered markers, active=blue #2563eb / other=grey #94a3b8, "Main stop"/"Other stop" legend). The legend ONLY renders when ≥1 step has coords (hasMap). If a test reports the legend missing, first check the trip's steps actually have coords in DB — not a render bug.
- AI `app/api/admin/itinerary-generate` geocodes optional place strings via Mapbox (token DB-first `dbGetSettings().apiKeys.mapbox` then env), fail-soft. Data generated BEFORE this geocoding existed has no coords until re-generated.

## Testing map features — WebGL gotcha
**Why:** The headless test browser has NO WebGL/GPU, so `new mapboxgl.Map()` throws "Failed to initialize WebGL". The map canvas + on-canvas markers can NEVER be verified by the automated testing subagent.
**How to apply:** Verify map features via (1) Mapbox geocoding/token returning real coords, (2) DOM checks for legend + list + click-to-highlight, (3) a graceful WebGL fallback message instead of a blank box. Any Mapbox map-init MUST be wrapped in try/catch + `mapboxgl.supported()` guard that sets a fallback state, or unsupported devices/headless browsers get a blank box.
