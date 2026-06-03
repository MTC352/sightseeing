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

**Pagination:** the module owns its own jsPDF pagination (pt/A4). Each stop card is pre-measured then `ensure()`d as one indivisible block; break/weather/travel boxes `ensure()` separately. A single card taller than one printable page would clip, so the only unbounded field (the amber note box) is clamped by **dropping trailing bullets** (not an ellipsis) until the card fits. The whole map section and each per-stop render are wrapped in `try/catch` so one bad segment never aborts the download.

**Rail connectors = ONE continuous green timeline through EVERY node, carried across pages.** `circleMarks` tracks ALL rail nodes — numbered stop circles AND break bubbles — each with `{page,x,y,r}` (per-node radius, since stop circles r=9 and break bubbles r=7 differ). The post-loop pass joins consecutive nodes `a.y+a.r → b.y-b.r` same-page; across a page break it draws three segments: a's node → bottom margin on a.page, a FULL `margin..pageH-margin` segment on each intermediate page, and top margin → b's node on b.page. **Why:** the old pass only joined numbered circles on the SAME page and never tracked breaks as nodes, so any gap spanning a break or a page break showed NO line. If you add a new rail node type, it MUST push to `circleMarks` with its radius or the line will skip it.

**Break cards draw vector activity icons (Helvetica/WinAnsi can't render lucide/emoji).** Mirror the canvas (`components/sidebar-itinerary.tsx`): meal break → `drawUtensils` (crossed fork+knife), coffee break → `drawCoffeeCup` (cup body + handle + steam), chosen by `isCoffee`. Draw the icon in BOTH the card header (left of the label) and inside the rail break bubble, and add a small drawn clock mark in the duration badge — same as the stop-card duration pill. Inner helpers built from `doc.line/circle/roundedRect("S")`.

**Note-box height must be a single source of truth.** The amber note box renders `tripNotes` as a bulleted list (split on `* • ·`), wrapped per bullet. Its height (`noteBoxH`) is used BOTH in card-height measurement and in the draw (`roundedRect`). The clamp loop mutates the wrapped-bullets array, so `noteBoxH` MUST be recomputed from the array (via the shared `computeNoteBoxH` helper) **after** the clamp — otherwise the drawn box height diverges from its (reduced) content and overlaps the next card. **Why:** a `const noteBoxH` computed once before the clamp is a latent overlap bug on long notes.

**jsPDF Helvetica = WinAnsi encoding, which has NO "→" (U+2192) — it prints as garbage `!'`.** Never put a literal `→` (or any non-WinAnsi glyph / emoji) in a RENDERED string. For arrows, DRAW them: inner helper `drawArrow(x, yMid, size, color)` = a `doc.line` + `doc.triangle` arrowhead. Used for the maps link, the Book Now pill, TripAdvisor links, the travel from→to line, and the fallback-travel treatment. (Helvetica DOES render €·•–—, just not arrows/emoji.) `doc.triangle/circle/line/roundedRect("F"/"FD"/"S")` are all valid jsPDF calls.

**Book Now is a solid green (#16a34a) rounded pill** (white bold text + white drawn arrow), the whole pill linked via `doc.link` to the booking href — matching the canvas button (not green text). Duration badge to its left is a rounded pill with a small drawn clock mark.

**Verifying the PDF visually (offline):** the jspdf **node build's `doc.save(filename)` writes straight to disk** via `fs.writeFileSync` (it does NOT trigger a browser download in Node, and is set as an INSTANCE own-property so you cannot intercept it by patching `jsPDF.prototype.save`). So you can render the module headless with `npx tsx`: stub `globalThis.window` (include `atob`/`btoa`, since jspdf binds them off its global object) + a fail-soft `fetch` (returns `{ok:false}` so the Mapbox map is skipped, no `Image`/`FileReader` needed), `await import("../lib/planner/itinerary-pdf.ts")`, call `downloadItineraryPdf(sample)`, then `pdftoppm -png` the emitted `sightseeing-itinerary-*.pdf` and read the image. Wrap top-level calls in an async IIFE (project transpiles CJS → no top-level await).
