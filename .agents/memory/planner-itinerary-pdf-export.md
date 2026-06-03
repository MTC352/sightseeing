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

Client-side via dynamic `import("jspdf")` (keeps it out of SSR + main bundle). Map is best-effort: fetches the public Mapbox token from `/api/mapbox-token`, builds a Mapbox Static Images URL (numbered pins + geojson route line). Map image is a clickable `doc.link` to a Google Maps directions deep-link (opens native maps app on mobile). Each stop's "Book Now" is `textWithLink` to `${origin}/trip/[id]`. Every failure path (no token, fetch fail, embed fail) degrades gracefully — the PDF always downloads.
