# About Page — Live Google Reviews (General Account)

**Date:** 2026-08-11
**Route affected:** `/about`
**Status:** Approved design, ready for implementation plan

## Problem

The `/about` page's "What Our Travellers Say" section shows a **hardcoded** "4.7 average"
badge and iterates over `reviews` from `@/lib/data`, which is an **empty array**
(`lib/data.ts:94`) — so no review cards render at all today. Meanwhile the codebase
already has a fully working integration that pulls **live reviews from the general
Sightseeing.lu Google Business Profile** (used on the homepage and per-trip pages).
The About page is simply not wired to it.

## Goal

Replace the About page's static/empty testimonials and hardcoded rating with **live
data from the general Sightseeing.lu Google account**, always shown (with graceful
fallback), including a link to the full reviews on Google. The live rating also flows
into the page's stats tile and structured data.

## Non-Goals

- No changes to the homepage `ReviewsSection` or per-trip `GoogleReviews` behaviour.
- No new admin UI. The general account is already configured via the existing
  Admin → Integrations `googlePlaceId` setting (with a hardcoded text-search fallback
  of "Sightseeing Luxembourg").
- No visibility toggle — the section always renders (decision: always-on).

## Decisions (confirmed with user)

1. **Replace** the static testimonials with live Google reviews (not add alongside).
2. **Always show** the section (graceful fallback, no admin toggle).
3. The **real Google rating also flows into** the stats tile ("Customer Rating") and
   the JSON-LD `aggregateRating` — not only the reviews section.

## Database Changes

**None.** This feature reuses the existing `googlePlaceId` setting and the existing
Google Places integration. No tables, columns, settings keys, or seed data are added.
Therefore **no migration is required**. (If implementation surfaces any schema/data
change, a registered migration will be added to `lib/data-migrations/index.ts`,
following the repo's existing data-migration convention.)

## Architecture

Single **server-side** fetch drives every consumer, giving one source of truth, no
client loading flash, and no duplicate requests.

### New: `lib/google-reviews-global.ts`

A shared server module encapsulating the "general account" reviews fetch.

- `getGlobalGoogleReviews(): Promise<GlobalReviews>` where
  `GlobalReviews = { name?: string; rating?: number; totalReviews?: number; reviews: LiveReview[]; error?: string }`.
- Responsibilities (moved out of `app/api/google-reviews/route.ts`'s global branch):
  1. Load settings + resolve API key (`settings.apiKeys.googleReviews` ||
     `process.env.GOOGLE_PLACES_API_KEY`).
  2. Resolve Place ID: admin `googlePlaceId` first, else text-search
     `"Sightseeing Luxembourg"`.
  3. `fetchPlaceDetails` → normalize into `{ name, rating, totalReviews, reviews[] }`.
  4. Reuse the existing 30-min in-memory cache (same TTL/behaviour as today).
- On any failure returns `{ reviews: [], error }` — never throws to callers.
- The small pure helpers currently in the route (`findPlaceIdByName`,
  `fetchPlaceDetails`, `PlaceDetails` type) move here and are imported back by the
  route to avoid duplication. SSRF/shortlink helpers used only by the per-trip branch
  stay in the route.
- Also exports `GOOGLE_PROFILE_URL` (the general profile share link, currently a local
  const at `home-sections.tsx:375`) so the About page and homepage share one value and
  cannot drift. `home-sections.tsx` is updated to import it.

### Changed: `app/api/google-reviews/route.ts`

The global-scope branch (lines ~368–433) is replaced by a call to
`getGlobalGoogleReviews()` and returns its payload (preserving current JSON shape and
error/status semantics). The per-trip branch is unchanged. Existing consumers
(homepage RTK Query, trip pages) see identical responses.

### Changed: `app/about/page.tsx` (server component, already `force-dynamic`)

- `const g = await getGlobalGoogleReviews().catch(() => null)`.
- **Stats tile:** "Customer Rating" value = `g?.rating ? \`${g.rating.toFixed(1)}/5\` : "4.7/5"`.
- **JSON-LD `aggregateRating`:** `ratingValue` = live rating (fallback `"4.7"`);
  `reviewCount` prefers `g?.totalReviews` when present, else the existing
  published-trips sum. Only emitted when a rating is available (as today).
- **Reviews section:** replace the hardcoded badge + `reviews.map(...)` with
  `<AboutGoogleReviews data={g} profileUrl={GOOGLE_PROFILE_URL} />`.
- Remove the now-unused `reviews` import from `@/lib/data`.

### New: `components/about-google-reviews.tsx` (presentational, no data fetching)

Receives the server-fetched data as props and renders:

- A **live overall-rating badge** (rating + "based on N Google reviews") replacing the
  hardcoded "4.7 average" pill, plus the Google brand mark.
- **Live review cards** in the About page's existing `sm:grid-cols-3` card style
  (author, star row, date, text), showing up to ~6.
- A **"View all reviews on Google"** link (`profileUrl`, opens in new tab,
  `rel="noopener noreferrer"`).
- **Fallback** (no reviews / API key absent / error): a bordered block with a
  "View Reviews on Google" link — so the section always renders something, mirroring
  the homepage's graceful fallback.

Kept simple: no slider/auto-rotate, no edit-mode config panel (those stay on the
homepage). The `AboutReviewsHeading` editable heading is retained.

## Data Flow

```
Admin googlePlaceId setting ─┐
   (or text-search fallback) ├─► getGlobalGoogleReviews() ──► { rating, totalReviews, reviews[] }
Google Places Details API ───┘         │  (30-min cache)
                                        ├─► About stats tile  ("Customer Rating")
                                        ├─► About JSON-LD      (aggregateRating)
                                        ├─► <AboutGoogleReviews> (badge + cards + link)
                                        └─► /api/google-reviews global branch (homepage, unchanged)
```

## Error Handling

- `getGlobalGoogleReviews()` never throws; About page also wraps it in `.catch(() => null)`.
- Missing API key / unresolved Place ID / API error → stats tile and JSON-LD fall back
  to `4.7`; reviews section shows the fallback block with a Google link.
- No new failure surface for existing consumers — the route's external contract is
  unchanged.

## Testing

- **Manual (primary):** with a Google Places API key configured, load `/about` and
  verify live rating in the badge + stats tile, live cards, and the "View on Google"
  link. With the key removed/invalid, verify graceful fallback to `4.7` and the
  fallback link — page still renders fully.
- **Regression:** homepage `ReviewsSection` and a trip detail page still show reviews
  (route contract unchanged); `GOOGLE_PROFILE_URL` import swap compiles.
- **Type/build:** `next build` / `tsc` clean; no unused-import warnings on the About page.

## Files Touched

- `lib/google-reviews-global.ts` — **new** shared server helper + `GOOGLE_PROFILE_URL`.
- `components/about-google-reviews.tsx` — **new** presentational component.
- `app/about/page.tsx` — wire live rating into stats tile, JSON-LD, reviews section;
  drop static `reviews` import.
- `app/api/google-reviews/route.ts` — global branch delegates to the shared helper.
- `components/home-sections.tsx` — import `GOOGLE_PROFILE_URL` from the shared module.
