# sightseeing.lu — Project Overview

## What This Is
Next.js 16 tourism discovery and booking platform for Luxembourg.
Includes a full public frontend and a comprehensive admin panel at `/admin/*`.

## ⚠️ CRITICAL: Palisis/TourCMS is ONE-WAY ONLY

**Palisis (TourCMS) → our DB. Never the other way around.**

- The site **never** pushes trip data, prices, descriptions, edits, or any payload back to Palisis.
- All Palisis-related code paths (`lib/tourcms.ts`, `lib/palisis-sync.ts`, `app/api/admin/palisis-import/*`, `app/api/webhooks/palisis/*`) are **read-only** from our perspective on Palisis data.
- Every sync operation (manual button on a trip, manual full import, webhook auto-sync) re-fetches via TourCMS `showTour` / `listTours` and **overrides** our local DB row.
- The only POST/PUT calls to TourCMS that are allowed are **booking-creation** flows (customer-initiated, not admin-initiated edits).
- Auto-sync is toggleable in `/admin/palisis` (stored as `integrations.palisis_auto_sync`). When OFF, incoming webhooks are logged-and-skipped.
- **Do NOT add any code that pushes admin trip edits to Palisis.** The admin UI's "Edit Trip" form writes to our DB only — Palisis is the upstream source of truth, not a sink.

## Key Architecture

- **Framework:** Next.js 16 (App Router) with TypeScript
- **Package manager:** pnpm
- **Workflow:** `next dev --turbo -p 5000`
- **Styling:** Tailwind CSS + shadcn/ui components
- **Database:** Replit PostgreSQL (16 tables) — `lib/db.ts` pool + `lib/db/queries.ts`
- **Auth:** JWT via `jose` + bcrypt password hashing — HttpOnly cookie `admin_session`, 8h TTL
- **AI:** Vercel AI SDK (streamText / UIMessageStreamResponse) — Anthropic Claude + OpenAI via Vercel AI Gateway
- **Itinerary engine (HYBRID):** see "AI Trip Planner — Hybrid Engine" below
- **File uploads:** Vercel Blob
- **Translations:** Weglot
- **Maps:** Mapbox
- **Booking:** TourCMS/Palisis — `lib/tourcms.ts` custom HMAC-SHA256 client (native fetch + fast-xml-parser)
- **Weather:** OpenWeatherMap
- **Proxy/middleware:** `proxy.ts` (Next.js 16 format, not `middleware.ts`)
- **State management:** Redux Toolkit + RTK Query — two separate stores (admin + site)

## State Management (Redux + RTK Query)

Implemented with `@reduxjs/toolkit` + `react-redux`. Two isolated stores to keep admin and frontend load completely separate.

### Admin Store (`store/admin/`)
- **`store/admin/api.ts`** — RTK Query API slice covering ALL `/api/admin/*` routes
  - Full CRUD: trips, posts, jobs, applications, help, tickets, departures, taxonomies
  - Settings, integrations, dashboard stats
  - Cache tag invalidation: mutations auto-invalidate related queries (e.g. `deleteTrip` invalidates `['Trips', 'Dashboard']`)
- **`store/admin/store.ts`** — Admin Redux store (only adminApi reducer)
- **`components/providers/admin-store-provider.tsx`** — `"use client"` Provider, wraps `app/admin/layout.tsx`
- **Usage:** Import hooks from `@/store/admin/api` — e.g. `useGetDeparturesQuery()`, `useDeleteDepartureMutation()`

### Site Store (`store/site/`)
- **`store/site/api.ts`** — RTK Query API slice for public site endpoints
  - Weather (5-min cache), Google Reviews (30-min cache), Mapbox token (1-hr cache)
  - Public trips + blog posts (5-min cache)
- **`store/site/store.ts`** — Site Redux store (only siteApi reducer)
- **`components/providers/site-store-provider.tsx`** — `"use client"` Provider, wraps `app/layout.tsx`
- **Usage:** Import hooks from `@/store/site/api` — e.g. `useGetWeatherQuery()`, `useGetMapboxTokenQuery()`

### Key Principle
- **Server components** remain untouched — they call DB functions directly (best for SEO + performance)
- **Client components** use RTK Query hooks — auto-deduplicates in-flight requests, caches responses
- Pages already migrated to RTK Query: `departures`, `tickets`, `taxonomies`

## AI Trip Planner — Hybrid Engine

The itinerary builder (`POST /api/itinerary`) is a **hybrid** of AI + deterministic
scheduling. The AI ONLY selects/orders WHICH trips to include; **deterministic server
code locks all timing**. This keeps it token-lean and makes it degrade gracefully when
the AI key is invalid (both env `ANTHROPIC_API_KEY` and DB `integrations.anthropic` may
return 401 — the build still produces a real itinerary).

### Pipeline (`app/api/itinerary/route.ts`)
1. **Source candidates** — the trips passed in the request body (cart trips).
2. **AI select/order** (`lib/itinerary/ai.ts` → `selectAndOrder`) — sends compact trip
   cards + prefs + exclusions, gets back an ordered list of trip ids. **Fail-soft:
   returns `null` on any AI failure**, and the route falls back to
   `deterministicOrder(candidates, interests)` (interest/tag match + fit).
3. **Fetch live slots** — real TourCMS/Palisis timeslots per trip.
4. **Deterministic schedule** (`lib/itinerary/scheduler.ts` → `buildSchedule`) — the
   single source of truth for timing:
   - Picks the best non-conflicting slot per trip (full-day scan).
   - Adds Mapbox travel legs + buffer + **5–10 min early arrival**.
   - Inserts **lunch on full-day plans unless it's a food tour**.
   - Enforces **max stops = `min(adminCap, HARD_MAX_STOPS=5)` AFTER fit** — the cap
     lives in `lib/itinerary/scheduler.ts` (`HARD_MAX_STOPS`) and is clamped at line
     ~198. The admin cap comes from settings, **NOT user-overridable**.
   - Drops overflow trips with human-readable reasons.
5. **AI narrate** (`lib/itinerary/ai.ts` → `narrate`, optional) — writes summary + tips
   over the LOCKED timeline using the admin itinerary prompt as style guidance.
   **Fail-soft: deterministic fallback summary keeps the canvas populated when AI is down.**

### Admin settings → scheduler (kept in sync)
`dbGetSettings()` numeric/string fields feed `buildSchedule` config directly:
`dayStartTime`, `dayEndTime`, `bufferTimeBetweenStops`, `maxStopsPerDay`,
`defaultActivityDuration`, `autoInsertMealBreaks`, `mealBreakDuration`,
`lunchBreakTime`, `dinnerBreakTime`, `travelTimeMethod`. Editable in
`/admin/ai-systems/itinerary` (prompt/tips/model → narration) and the planner
behavior settings (numeric scheduling + meals).

### Single-preference chip updates (no AI round-trip)
In `app/planner/page.tsx`, when a plan is already on the canvas, the suggestion chips
offer **direct single-field patches** (duration, date, no-early-morning exclusion).
Clicking one calls `applyDirectPref(patch)` which merges ONLY that field into
`prefsRef.current`, persists prefs (`PREFS_COOKIE`), and rebuilds the itinerary
deterministically via `handleRegenerateItinerary` — **bypassing the AI chat entirely**.
Chips carry an optional `patch` field; chips without a patch still route through the AI
via `handleSend`. `Preferences.exclusions?: string[]` flows to the route which derives
`excludeEarlyMorning`.

## SEO Indexing (staging vs live)

Indexing is **opt-in** so the Replit-published demo/staging site stays out of Google.
Controlled by env var `ALLOW_INDEXING` via `lib/seo.ts` (`isIndexingEnabled()`):
- **Unset (default)** → `noindex` meta + `robots.txt` `Disallow: /` (Replit publish = staging).
- **`ALLOW_INDEXING=true`** → `index, follow` + full `robots.txt` allow-list (live domain only).

Wired into `app/layout.tsx` (robots metadata) and `app/robots.ts` (dynamic robots.txt).
There must be **no static `public/robots.txt`** — it conflicts with `app/robots.ts`.
Full runbook: `docs/seo-indexing.md`.

## Auth

- **Site PIN gate:** `"3462"` — `components/site-password-gate.tsx` — localStorage (bypasses for `/admin` routes)
- **Admin auth:** JWT cookie `admin_session` — protected by `proxy.ts`
  - Login: `POST /api/admin/auth/login` — verifies email + bcrypt hash, issues JWT
  - Logout: `POST /api/admin/auth/logout` — clears cookie
  - Session: `GET /api/admin/auth/me` — validates token, returns user
  - Login page: `/admin/login`
- **Credentials:** `admin@sightseeing.lu` — password set during seeding; change after first login
- **Admin UUID:** `4102ea5d-fd01-4182-b08b-c751d663cd21`

## Database (PostgreSQL)

All 16 tables created and seeded. Data persists across restarts.

| Table | Rows | Description |
|---|---|---|
| admin_users | 1 | Back-office users with bcrypt passwords |
| trips | 43 | Sightseeing experiences |
| palisis_sync_log | 0 | Palisis API sync history |
| blog_posts | 2 | Published blog articles |
| jobs | 3 | Open job listings |
| job_applications | 0 | Career form submissions |
| help_articles | 17 | FAQ / help articles |
| support_tickets | 0 | Customer support tickets |
| ticket_replies | 0 | Replies to tickets |
| taxonomies | 0 | Trip categories/tags (legacy K/V site copy store) |
| trip_tags | 36 | Canonical Trip Tag catalog (drives trip edit picker, planner chat interests, homepage categories) |
| pages | 10 | System pages (CMS) |
| page_revisions | 0 | Page version history |
| page_content | 0 | Page block content |
| ai_system_configs | 3 | AI system prompts + model settings |
| integrations | 8 | API keys store (Mapbox, Anthropic, etc.) |
| header_footer_blocks | 5 | Custom HTML injection |

### DB Files
- `lib/db.ts` — Pool singleton + `query()` / `queryOne()` helpers
- `lib/db/queries.ts` — All CRUD query functions replacing `admin-store.ts`
- `scripts/seed-db.mjs` — Seed script (run with `node scripts/seed-db.mjs`)

## Admin Panel Pages
| Page | Path |
|---|---|
| Dashboard | `/admin` |
| Trips | `/admin/trips`, `/admin/trips/[id]` |
| Blog | `/admin/blog`, `/admin/blog/[id]` |
| Jobs | `/admin/jobs`, `/admin/jobs/[id]` |
| Applications | `/admin/jobs/applications` |
| Help & FAQ | `/admin/help`, `/admin/help/[id]` |
| Support Tickets | `/admin/tickets`, `/admin/tickets/[id]` |
| Taxonomies | `/admin/taxonomies` |
| Pages | `/admin/pages` |
| Integrations | `/admin/integrations`, `/admin/integrations/weglot` |
| Header/Footer | `/admin/header-footer` |
| AI Systems | `/admin/ai-systems`, `/admin/ai-systems/[system]` |
| Palisis | `/admin/palisis` |
| DB Tracker | `/admin/implementation` |

## API Routes

All admin API routes are now DB-backed. Auth required (JWT cookie).

| Route | Method | Description |
|---|---|---|
| `/api/admin/auth/login` | POST | Login (public) |
| `/api/admin/auth/logout` | POST | Logout (public) |
| `/api/admin/auth/me` | GET | Current session |
| `/api/admin/dashboard` | GET | DB stats |
| `/api/admin/trips` | GET, POST | List / create trips |
| `/api/admin/trips/[id]` | GET, PATCH, DELETE | Trip CRUD |
| `/api/admin/posts` | GET, POST | Blog posts |
| `/api/admin/posts/[id]` | GET, PATCH, DELETE | Post CRUD |
| `/api/admin/jobs` | GET, POST | Job listings |
| `/api/admin/jobs/[id]` | GET, PATCH, DELETE | Job CRUD |
| `/api/admin/applications` | GET, PATCH, DELETE | Job applications |
| `/api/admin/help` | GET, POST | Help articles |
| `/api/admin/help/[id]` | GET, PATCH, DELETE | Help article CRUD |
| `/api/admin/tickets` | GET, POST | Support tickets |
| `/api/admin/tickets/[id]` | GET, PATCH, DELETE | Ticket CRUD |
| `/api/admin/tickets/[id]/replies` | POST | Add reply |
| `/api/admin/settings` | GET, PATCH | Integrations + AI settings |
| `/api/admin/planner-behavior` | GET, PUT | Planner AI behavior |
| `/api/admin/impl-check` | GET | DB row count health check |

## Documentation Files
| File | Contents |
|---|---|
| `docs/database-architecture.md` | 16-table PostgreSQL schema |
| `docs/api-reference.md` | Complete API reference — all routes |

## Public Pages → DB Status

All public pages now read from DB (or have DB-first with fallback):

| Page | Source | Notes |
|---|---|---|
| `/blog`, `/blog/[slug]` | DB | `dbListPosts`, `dbGetPostBySlug` |
| `/careers` | DB | Server component + `dbListJobs`; `careers-client.tsx` is client |
| `/explore` | DB | Server component fetches `dbListTrips`; passes to `ExploreClient` as `initialTrips` prop |
| `/departures` | DB (trips) | Server component fetches trips from DB; `DeparturesClient` accepts `initialTrips` prop |
| `/trip/[id]` | DB + fallback | `dbGetTrip` first, then `getTripById` from lib/data; `mapDbTrip()` converts to Trip type |
| `/help` | Partial | DB has 17 articles but `HelpClient` still uses hardcoded `FAQ_DATA` (AI chat complexity) |

## New API Routes (recent additions)

| Route | Method | Description |
|---|---|---|
| `/api/admin/taxonomies` | GET, POST, PATCH | Taxonomy CRUD |
| `/api/admin/taxonomies/[key]` | GET, DELETE | Single taxonomy |
| `/api/admin/pages` | GET, POST | Pages CRUD |
| `/api/admin/pages/[id]` | GET, PATCH, DELETE | Single page |
| `/api/admin/pages/[id]/revisions` | GET, POST | Page revisions |
| `/api/admin/departures` | GET, POST, PATCH | Departures schedule |
| `/api/admin/integrations` | GET, PATCH | Integrations table (upsert by key) |
| `/api/admin/test-key` | GET | Real API key validation (openWeather, googleReviews, palisis) |
| `/api/admin/palisis-availability` | GET | Palisis availability from DB key |
| `/api/admin/palisis-import` | POST | Palisis catalog import |
| `/api/webhooks/palisis` | POST | Palisis booking webhooks |

## Known Remaining Items (T013 planned)

1. **HelpClient refactor** — Convert hardcoded `FAQ_DATA` to DB-driven categories (complex due to AI chat integration)
2. **Live Palisis API** — Real API call commented out; needs valid Palisis key
3. **Weglot settings page** — `/admin/integrations/weglot` full config page planned
4. **Public forms** — Job application form and support ticket creation from public pages
5. **Sitemap.xml** — Dynamic sitemap from DB trips for SEO
6. **Image uploads** — Currently URL-only; file upload for trips/blog planned
7. **Stripe booking** — Payment integration for direct booking from /trip/[id]
