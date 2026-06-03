---
name: Itinerary PDF export & itinerary data shapes
description: The chat-card itinerary object is a lighter shape than the canvas itinerary; which one to trust for full data, plus the PDF export contract.
---

# Two itinerary shapes on the planner

There are TWO objects that both look like an "itinerary" on the Trip Planner, and they are NOT the same shape:

- **Canvas `centerItinerary`** (page state) — the FULL plan returned by `/api/itinerary`. Carries `steps[].lat/lng`, `tips[]`, `priceFrom`, travel legs, cross-sells, etc. This is the source of truth for the active/latest plan and drives the map.
- **Chat-card `buildItinerary` tool output** — a LIGHTER object: only `steps[]{time,tripTitle,tripId,durationMinutes,travelToNext}`, `summary`, `visitDate`. It has **no coordinates, no tips, no prices**.

**Why it matters:** anything that needs full itinerary data (static map, tips, prices, coordinates) must read `centerItinerary`, never the chat-card object. Using the chat-card object for map/tips silently produces a degraded result.

**How to apply:** the PDF export (`lib/planner/itinerary-pdf.ts`) downloads the ACTIVE latest plan: `centerItinerary ?? chatCardFallback`. The chat-card fallback is only used when nothing is loaded on the canvas yet (so a basic PDF still works).

# Type gotcha

`components/sidebar-itinerary.tsx` exports `Itinerary` but **not** `ItineraryStep`. Derive the step type via `Itinerary["steps"][number]` instead of importing it.

# PDF export contract

Client-side via dynamic `import("jspdf")` (keeps it out of SSR + main bundle).

**Rule: the PDF must visually MATCH the canvas Day Itinerary, not a summary of it.** The canvas (`components/sidebar-itinerary.tsx` `ItineraryPanel`/`ItineraryStepCard`) is the design reference and the PDF mirrors its semantics field-for-field: green theme (`#16a34a`, NOT blue), numbered rail circles + time gutter, Confirmed-vs-Suggested start–end times (prefix driven by `hasLiveData = endTime||priceFrom`), duration badge, Book Now deep-link, price + spaces, "Things to do" highlights, amber important-note box, coffee/meal break cards (TripAdvisor link), weather advisory, and the full "Travel to next stop" block (by car/transit/walk minutes + arrival ETAs + live/estimated badge + distance + Recommended badge). The ETA/recommend-walk/is-live formulas are duplicated from the canvas component — **if the canvas travel/ETA logic changes, update the PDF copy in lockstep** or they silently diverge.

**Why the old PDF looked sparse:** the data was never missing — `centerItinerary` already carries every rich field. The PDF module simply wasn't rendering them. Don't go hunting for "missing data" if a PDF looks thin; check what the renderer actually draws.

Map is best-effort and road-following: fetch public Mapbox token from `/api/mapbox-token`, request a Directions **polyline** geometry (`fetchRoutePolyline`), overlay it on a Mapbox Static Images URL (`path-…+16a34a` + numbered green pins). Static-map URL is length-guarded (≤8000 chars) and falls back: polyline → geojson straight line → bare markers. Map image is a clickable deep-link to native maps.

**Pagination:** the module owns its own jsPDF pagination (pt/A4). Each stop card is pre-measured then `ensure()`d as one indivisible block; break/weather/travel boxes `ensure()` separately. A single card taller than one printable page would clip, so the only unbounded field (note box) is clamped with an ellipsis to fit. Rail connectors are drawn in a post-loop pass (same-page only, via tracked `circleMarks`), then the footer pass runs. The whole map section and each per-stop render are wrapped in `try/catch` so one bad segment never aborts the download. No emoji (helvetica renders €·•→ but not emoji).
