# sightseeing.lu — Implementation Audit

> **Generated:** 2026-04-24
> **Scope:** Code analysis of the full Next.js 14 codebase covering third-party API integrations, state management, and admin authentication. Each section documents what is currently implemented, what is incomplete, and what is recommended.

---

## Table of Contents

1. [Third-Party API Integrations](#1-third-party-api-integrations)
   - [Palisis (Booking Engine)](#11-palisis-booking-engine)
   - [OpenWeatherMap](#12-openweathermap)
   - [Mapbox](#13-mapbox)
   - [Weglot (Translation)](#14-weglot-translation)
   - [Anthropic / OpenAI (AI)](#15-anthropic--openai-ai)
   - [Google Places / Reviews](#16-google-places--reviews)
2. [State Management — No Redux](#2-state-management--no-redux)
   - [What Is Implemented](#21-what-is-implemented)
   - [What Is Not Implemented](#22-what-is-not-implemented)
   - [Recommendations](#23-recommendations)
3. [Admin Panel Authentication](#3-admin-panel-authentication)
   - [What Is Implemented](#31-what-is-implemented)
   - [Security Gaps](#32-security-gaps)
   - [Recommended Implementation](#33-recommended-implementation)
4. [Other Setup Areas](#4-other-setup-areas)
   - [Environment Variables](#41-environment-variables)
   - [Database](#42-database)
   - [API Route Protection](#43-api-route-protection)
   - [Next.js Middleware](#44-nextjs-middleware)
   - [SEO and Meta Tags](#45-seo-and-meta-tags)
   - [Error Monitoring](#46-error-monitoring)
   - [Caching Strategy](#47-caching-strategy)
5. [Overall Status Summary](#5-overall-status-summary)

---

## 1. Third-Party API Integrations

---

### 1.1 Palisis (Booking Engine)

**What it does:** Palisis is the third-party booking platform. The platform is supposed to sync trip catalog data from Palisis and display availability. Actual booking is handled by Palisis via an embedded iframe.

#### Status: Skeleton — Not Live

| Aspect | Status | Detail |
|---|---|---|
| Import endpoint | Exists (`/api/admin/palisis-import`) | Returns mock data, not a real Palisis call |
| Availability endpoint | Exists (`/api/admin/palisis-availability`) | Also uses mock data |
| Real API call | Not implemented | Commented out in route handler |
| Webhook handler | Not found | No `/api/webhooks/palisis` route exists |
| Diff confirmation UI | Not implemented | No frontend modal for comparing old vs new values |
| Bulk import UI | Not implemented | No bulk override checkbox UI |
| API key check | Partial | Code checks if key is set and logs a warning, then proceeds with mock data |

#### Current Code (`app/api/admin/palisis-import/route.ts`):

```typescript
// Mock Palisis catalog — replace with real API call when credentials are available
const MOCK_PALISIS_CATALOG = [ ... ]

export async function POST() {
  const settings = getSettings()
  // Commented-out real call:
  // const res = await fetch(`${settings.apiKeys.palisis}/catalog`, {
  //   headers: { "X-Api-Key": settings.apiKeys.palisis }
  // })
  if (!settings.apiKeys.palisis) {
    console.warn("[palisis-import] No API key set — using mock catalog")
  }
  // Loops over MOCK_PALISIS_CATALOG and calls createTrip()
}
```

#### Enhancements Required

1. **Implement the real Palisis API call.** Uncomment and complete the fetch block. Add proper auth headers per Palisis documentation.
2. **Create the webhook route** at `/api/webhooks/palisis` to receive push updates from Palisis. Must:
   - Validate the webhook signature (HMAC or shared secret)
   - Auto-update base trip fields without touching `title_override` / `description_override`
   - Insert a row in `palisis_sync_log`
3. **Build the diff confirmation modal** in `/admin/palisis`. Before applying a single-trip update, show a before/after comparison per changed field. Admin confirms or rejects field by field.
4. **Build the bulk import UI.** Table listing all Palisis catalog items with a per-row changed badge and a global "Override all" checkbox.
5. **Store sync history** in `palisis_sync_log` (see database architecture doc) so admins can audit what changed and when.
6. **Rate limiting.** Add a cooldown check (e.g., 60 seconds between manual syncs) to avoid accidental Palisis API overuse.

---

### 1.2 OpenWeatherMap

**What it does:** Provides current weather and 4-day forecast for Luxembourg City. Used on the home page widget and by the AI trip planner to bias recommendations toward indoor or outdoor activities.

#### Status: Well Implemented — Key Required

| Aspect | Status | Detail |
|---|---|---|
| API route | Done (`/api/weather`) | Full current + forecast parsing |
| Fallback | Done | Static Luxembourg City data with `isFallback: true` flag |
| Error handling | Excellent | Catches network errors, non-OK HTTP codes, and JSON parse errors separately |
| Client hook | Done (`hooks/use-weather.ts`) | Polls the proxy route, not the external API directly |
| Weather context | Done (`lib/weather-context.tsx`) | App-wide access via `useWeather()` hook |
| AI planner integration | Done | Passes live `temp`, `condition`, and `wx` to planner system prompt |
| Key storage | Environment variable only | `OPENWEATHER_API_KEY` — not exposed to the browser |
| City override | Done | `?city=` query param accepted in the route |

#### Enhancements Recommended

1. **Add response-level caching.** The route uses `cache: "no-store"` on the fetch. For a site with many visitors, add a short server-side cache (e.g., `next: { revalidate: 900 }` — 15 minutes). Weather does not change by the second.
2. **Expose `isFallback` in the UI.** When the fallback fires, show a subtle "Estimated weather" label instead of displaying mock data as if it were live.
3. **Admin key management.** Allow the key to be set in `/admin/integrations` (stored in DB, not only `.env`) so it can be rotated without a deployment.

---

### 1.3 Mapbox

**What it does:** Provides interactive maps (used in `components/chatgpt-widgets/sightseeing-map.tsx`).

#### Status: Partially Implemented — Token Exposure Risk

| Aspect | Status | Detail |
|---|---|---|
| Token proxy route | Done (`/api/mapbox-token`) | Route tries 8 different env var name aliases |
| Map component | Done | Uses `@mapbox/mapbox-gl-js` via the proxy token |
| Token security | Risk | The proxy route is completely open — any anonymous request can retrieve the Mapbox token |

#### Current Code (`app/api/mapbox-token/route.ts`):

```typescript
export async function GET() {
  const token =
    process.env.mapbox ??
    process.env.MAPBOX ??
    process.env.MAPBOX_TOKEN ??
    // ...7 more aliases
    ""
  return NextResponse.json({ token })
}
```

#### Enhancements Required

1. **Restrict the Mapbox token at the Mapbox dashboard level.** Log in to mapbox.com → Account → Tokens → add allowed URLs (your domain). This prevents the public token from being used by external callers even if they retrieve it.
2. **Standardise the env variable name.** Pick one name (`MAPBOX_PUBLIC_TOKEN`) and use it everywhere. The current 8-alias waterfall exists only because the key name was inconsistent — clean it up.
3. **Restrict the proxy route.** Check the `Referer` or `Origin` header in the route and only return the token for requests coming from your own domain in production.
4. **Admin key management.** Expose the Mapbox token in `/admin/integrations` so it can be changed without a redeployment.

---

### 1.4 Weglot (Translation)

**What it does:** Handles automatic multi-language translation of the entire frontend. Loaded as a third-party script.

#### Status: Implemented — Edge Cases to Address

| Aspect | Status | Detail |
|---|---|---|
| Script loading | Done (`components/weglot-loader.tsx`) | Uses Next.js `Script` with `onLoad` callback |
| Initialization | Done | `Weglot.initialize()` called inside `onLoad` IIFE |
| Hydration error fix | Done | Moved from raw `<head>` to `Script` component in previous session |
| Admin config UI | Done (`/admin/integrations/weglot`) | Extended config (language pairs, flags, exclusions) |
| Excluded blocks | Done | `.no-translate` CSS class supported |
| Key storage | Dual | `NEXT_PUBLIC_WEGLOT_KEY` env var + admin settings store |

#### Enhancements Recommended

1. **Sanitize the Weglot key input in admin.** Currently the admin can save any string into the Weglot key field. Add a format check (Weglot keys start with `wg_`).
2. **Show translation status in admin.** Add a "Test connection" button in `/admin/integrations/weglot` that calls the Weglot API to confirm the key is valid and returns the active language count.
3. **Prevent content flash.** Add `visibility: hidden` to `<html>` on initial load and reveal it after Weglot initializes, preventing translated content from appearing then re-rendering in the original language.
4. **Single key source.** Consolidate key lookup so admin store takes precedence over env var, with env var as final fallback only.

---

### 1.5 Anthropic / OpenAI (AI)

**What it does:** Powers three AI features — the Trip Planner (`/planner`), the Trip Chat on individual trip pages, and the Help AI on `/help`. Uses the Vercel AI SDK with streaming.

#### Status: Functionally Implemented — Inconsistencies to Fix

| Aspect | Status | Detail |
|---|---|---|
| Trip planner streaming | Done (`/api/planner`) | `streamText` with 7 structured tools |
| Help AI | Done (`/api/help-chat`) | Uses help articles as knowledge base |
| Trip chat | Done (`/api/trip-chat`) | Context-aware per trip |
| AI advisor (admin) | Done (`/api/admin/ai-advisor`) | Admin-side AI writing assistant |
| Blog generator (admin) | Done (`/api/admin/generate-blog`) | AI-generated blog post drafts |
| Admin AI config | Done (`/admin/ai-systems`) | Per-system prompt, model, temperature, max_tokens |
| Model selection | Inconsistent | Admin UI lets admin pick model, but some routes still hardcode `openai/gpt-4o-mini` |
| API key check | Partial | Some routes check `process.env.ANTHROPIC_API_KEY`, others rely on Vercel AI SDK defaults |

#### Hardcoded Model Issue

The planner route does read from admin settings:

```typescript
model: plannerBehavior?.model || settings.ai?.planner?.model || "openai/gpt-4o-mini",
```

But `trip-chat` and `ai-advisor` routes do not honour the admin model setting — they always use the hardcoded fallback regardless of what admin configured.

#### Enhancements Required

1. **Centralise model resolution.** Create a utility function `getAIModel(systemKey: string): string` that reads the admin store, falls back to env var, and finally falls back to a hardcoded default. Use it in all AI routes to replace the duplicated fallback logic.
2. **Enforce the AI config for all routes.** `trip-chat`, `help-chat`, and `ai-advisor` should all read their model and system prompt from the corresponding `ai_system_configs` row.
3. **API key validation on startup.** Add a one-time check at boot (or in a health route) that confirms the AI API keys are present and valid, logging a clear warning if not.
4. **Error messages for users.** When an AI route fails (e.g., no API key), return a user-friendly message rather than a generic 500 error. The planner currently surfaces nothing to the user on failure.
5. **Token usage tracking.** Log token usage per request to the `palisis_sync_log` equivalent for AI — a future `ai_usage_log` table — so admin can monitor costs.

---

### 1.6 Google Places / Reviews

**What it does:** Fetches Google reviews for the business to display on the homepage.

#### Status: Implemented — Hardcoded Business Fallback

| Aspect | Status | Detail |
|---|---|---|
| API route | Done (`/api/google-reviews`) | Fetches from Google Places Details API |
| Shortlink resolution | Done | Follows `maps.app.goo.gl` and `goo.gl` redirects |
| Place ID extraction | Done | Handles raw Place ID, `?cid=`, and URL path formats |
| Text search fallback | Partial | Falls back to text search, but hardcodes "Dinner Hopping Luxembourg" |
| Key storage | Dual | Admin settings store + `GOOGLE_PLACES_API_KEY` env var |
| Error handling | Done | Returns structured error + empty `reviews: []` |

#### Hardcoded Fallback Bug (line 114):

```typescript
// Could be a short code, try a broader search
placeId = await findPlaceIdByName("Dinner Hopping Luxembourg", apiKey)
```

This hardcoded business name is a leftover from development. It must be removed.

#### Enhancements Required

1. **Remove the hardcoded "Dinner Hopping Luxembourg" fallback.** If a Place ID cannot be resolved from the URL, return a clear error rather than silently fetching the wrong business.
2. **Cache Place ID resolution.** Place IDs for a business do not change. Cache the resolved `placeId` in the DB (`integrations.meta.resolvedPlaceId`) so every request does not re-run URL parsing and text search.
3. **Cache reviews.** Google Places returns a maximum of 5 reviews and the data changes infrequently. Add a server-side cache (30–60 minute TTL) to avoid per-request API costs.
4. **Admin Place ID input.** Let admin enter the Place ID directly in `/admin/integrations` rather than requiring a Google Maps URL. Keep URL parsing as an optional helper.

---

## 2. State Management — No Redux

### 2.1 What Is Implemented

The project does **not use Redux**, Zustand, Jotai, or any third-party state management library. Instead it relies on:

#### React Context API (Client-Side)

| Context | File | Manages | Persistence |
|---|---|---|---|
| `CartProvider` | `lib/cart-context.tsx` | Cart items, quantities, totals | Cookie (`sightseeing_cart`, 7-day) |
| `WeatherProvider` | `lib/weather-context.tsx` | Current weather + forecast | In-memory only |
| `EditModeProvider` | `components/edit-mode-provider.tsx` | Inline admin edit mode, pending changes | In-memory only |
| `ThemeProvider` | Via `next-themes` | Light / dark mode | `localStorage` |

#### Server-Side In-Memory Stores

| Store | File | Manages | Persistence |
|---|---|---|---|
| Admin store | `lib/admin-store.ts` | Trips, blog posts, jobs, tickets, help articles, applications | Process memory — lost on restart |
| Page content store | `lib/page-content-store.ts` | Inline text edits from `?admin_edit=1` | Process memory — lost on restart |

Both stores use the `globalThis` pattern (`global.__adminTrips = ...`) to survive Next.js Hot Module Replacement during development. They do **not** survive server restarts or deployments.

### 2.2 What Is Not Implemented

| Feature | Status |
|---|---|
| Redux / Redux Toolkit | Not installed, not needed |
| Zustand | Not installed |
| Jotai | Not installed |
| Server-side session state | Not implemented |
| Persistent admin data store | Not implemented (in-memory only) |
| Optimistic UI updates | Not implemented |
| Real-time state sync | Not implemented |

### 2.3 Recommendations

Redux is **not recommended** for this project. The current use of Context API is appropriate for the complexity level. The architecture is correct — the issue is not the state management library, it is the missing database layer.

| Recommendation | Priority | Reason |
|---|---|---|
| Replace in-memory admin store with PostgreSQL | Critical | Data is lost on every restart; production is unusable without this |
| Keep Context API for UI state (cart, weather, edit mode) | Keep | These are genuinely ephemeral or client-only concerns |
| Add React Query (`@tanstack/react-query`) for server state | Medium | Would replace manual `useEffect + fetch` patterns in admin pages with caching, background refetch, and loading/error states |
| Do not add Redux | None | Adds significant boilerplate for no benefit at this scale |

---

## 3. Admin Panel Authentication

### 3.1 What Is Implemented

The admin panel (`/admin/*`) uses a client-side PIN gate defined in `app/admin/layout.tsx`.

| Aspect | Detail |
|---|---|
| PIN value | `"1234"` — hardcoded directly in source code on line 11 |
| Check location | Client-side React, inside a `useEffect` |
| Session storage | `sessionStorage.setItem("admin_auth", "true")` — cleared when tab is closed |
| Logout | `sessionStorage.removeItem("admin_auth")` + local state update |
| PIN display | `<p>Default PIN: 1234</p>` literally shown in the login form |
| Site-level gate | Separate component `components/site-password-gate.tsx` with PIN `"3462"` stored in `localStorage` |

### 3.2 Security Gaps

| Gap | Severity | Detail |
|---|---|---|
| PIN hardcoded in source code | Critical | Anyone with repo access knows the PIN instantly |
| No server-side session | Critical | Server has no way to verify whether a request comes from an authenticated admin |
| All admin API routes are unprotected | Critical | `curl -X DELETE /api/admin/trips/123` works with no auth required — the PIN gate is purely cosmetic at the API level |
| No `middleware.ts` | Critical | Next.js middleware does not exist; no edge-level route protection |
| `sessionStorage` expires on tab close | Medium | Admin is logged out on every browser refresh or new tab |
| PIN shown in UI | Medium | The form renders `Default PIN: 1234` — visible to any visitor who navigates to `/admin` |
| No brute-force protection | Medium | No rate limiting on PIN attempts |
| No role separation | Medium | Single shared PIN — no distinction between read-only editors and superadmins |

### 3.3 Recommended Implementation

The target authentication system should be built in this order:

#### Step 1 — Create `admin_users` table (see database architecture doc)
```sql
CREATE TABLE admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,  -- bcrypt, 12+ rounds
  role          TEXT NOT NULL DEFAULT 'editor',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Step 2 — Create a login API route
`POST /api/admin/auth/login`
- Accept `{ email, password }` in request body
- Query `admin_users` by email
- Compare password with `bcrypt.compare()`
- On success, issue a signed JWT (or server session) stored in an `HttpOnly` cookie
- Never expose the JWT to JavaScript

#### Step 3 — Create `middleware.ts`

```typescript
// middleware.ts — runs at the edge, before any page or API handler
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value
  if (!token) {
    return NextResponse.redirect(new URL("/admin/login", request.url))
  }
  // Verify JWT signature (edge-compatible library: jose)
  // If invalid, redirect to login
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
}
```

#### Step 4 — Protect all `/api/admin/*` routes
Add an `authenticate(request)` helper that verifies the session cookie on every admin API call and returns `401` if invalid.

#### Step 5 — Build the login page
`/admin/login` — email + password form, POST to `/api/admin/auth/login`, redirect to `/admin` on success.

#### Step 6 — Seed the first superadmin
On first run, seed one `admin_users` row with a bcrypt-hashed password from an environment variable `ADMIN_INITIAL_PASSWORD`.

#### Step 7 — Remove the old PIN gate
Delete the `PIN` constant and `PinGate` component from `app/admin/layout.tsx`.

---

## 4. Other Setup Areas

### 4.1 Environment Variables

| Variable | Used In | Status |
|---|---|---|
| `OPENWEATHER_API_KEY` | `/api/weather` | Needed, fallback if missing |
| `MAPBOX_TOKEN` (or aliases) | `/api/mapbox-token` | Needed, empty token if missing |
| `NEXT_PUBLIC_WEGLOT_KEY` | `weglot-loader.tsx` | Needed, translation disabled if missing |
| `ANTHROPIC_API_KEY` | AI routes | Needed, AI routes fail with 500 if missing |
| `GOOGLE_PLACES_API_KEY` | `/api/google-reviews` | Needed, reviews disabled if missing |
| `DATABASE_URL` | Not yet used | Not set — no DB connected yet |
| `ADMIN_INITIAL_PASSWORD` | Not yet used | Will be needed when proper auth is built |
| `JWT_SECRET` | Not yet used | Will be needed for signing admin sessions |

**Gap:** There is no `.env.example` file. New developers have no reference for what environment variables are required. Create one.

### 4.2 Database

| Status | Detail |
|---|---|
| Database | Not connected — no `DATABASE_URL` in environment |
| ORM | Not installed — no Prisma, Drizzle, or raw pg client |
| All data | Lives in in-memory `Map` objects in `lib/admin-store.ts` — lost on restart |
| Schema | Fully designed in `docs/database-architecture.md` |

**This is the highest-priority gap in the entire project.** The platform cannot be used in production without a database. All admin edits, trip updates, blog posts, and job applications are silently discarded on every server restart.

### 4.3 API Route Protection

| Route group | Protected? | Detail |
|---|---|---|
| `/api/admin/*` | No | Any anonymous HTTP client can read, write, or delete admin data |
| `/api/planner` | No | No rate limiting on AI usage; could be abused |
| `/api/help-chat` | No | No rate limiting on AI usage |
| `/api/trip-chat` | No | No rate limiting on AI usage |
| `/api/careers/apply` | No | No CAPTCHA or rate limit on form submissions |
| `/api/weather` | No | Low risk; acceptable |
| `/api/mapbox-token` | No | Medium risk; token should be restricted by domain at Mapbox level |

**Required:** Add authentication middleware to all `/api/admin/*` routes and add rate limiting to all AI-powered routes.

### 4.4 Next.js Middleware

**Status: Not implemented.** The file `middleware.ts` does not exist in the project root.

Without middleware, there is no way to:
- Protect admin routes at the edge before rendering
- Redirect unauthenticated admin API requests
- Add rate limiting
- Enforce HTTPS or redirect trailing slashes

A `middleware.ts` file should be created as part of the auth implementation.

### 4.5 SEO and Meta Tags

| Feature | Status | Detail |
|---|---|---|
| `<title>` tags | Partial | Some pages have hardcoded titles, some are missing |
| Open Graph tags | Partial | Present on some pages, inconsistent |
| `robots.txt` | Not found | Missing — search engines have no crawl instructions |
| `sitemap.xml` | Not found | Missing — no automatic sitemap generation |
| Structured data (JSON-LD) | Not found | No schema.org markup for trip products or reviews |
| Canonical URLs | Not found | No `<link rel="canonical">` |

**Recommended:** Use Next.js 14 `generateMetadata()` in every page for consistent, dynamic meta tags. Add `app/robots.ts` and `app/sitemap.ts` for automated sitemap and robots file generation.

### 4.6 Error Monitoring

| Feature | Status |
|---|---|
| Sentry or similar | Not installed |
| Custom error boundary | Not implemented |
| `app/error.tsx` | Not found |
| `app/not-found.tsx` | Not found |
| Server-side error logging | `console.error` only |

Without an error boundary, any unhandled React error on a page will crash the entire page to a white screen with no user guidance. Add `app/error.tsx` and `app/not-found.tsx` at minimum.

### 4.7 Caching Strategy

| Data | Current strategy | Recommended |
|---|---|---|
| Weather API | `cache: "no-store"` on every request | `revalidate: 900` (15 minutes) |
| Google Reviews | `cache: "no-store"` on every request | `revalidate: 3600` (1 hour) |
| Trip catalog | In-memory, always fresh | Postgres query with short revalidation |
| Blog posts | In-memory, always fresh | Postgres query with ISR revalidation |
| Mapbox token | Not cached | Can be cached at CDN level (token does not change) |
| AI responses | Not cached (streaming, correct) | Keep streaming |

---

## 5. Overall Status Summary

| Area | Status | Priority |
|---|---|---|
| Palisis integration | Skeleton (mock data only) | High |
| OpenWeatherMap | Working, needs caching | Low |
| Mapbox | Working, security concern | Medium |
| Weglot | Working, minor improvements needed | Low |
| Anthropic / AI routes | Working, model config inconsistency | Medium |
| Google Reviews | Working, hardcoded bug to fix | Medium |
| State management (Redux) | Not needed — Context API is correct | None |
| In-memory admin store | Must be replaced with PostgreSQL | Critical |
| Admin authentication | Insecure PIN gate — must be replaced | Critical |
| Next.js middleware | Missing | Critical |
| API route protection | None on admin routes | Critical |
| Database | Not connected | Critical |
| `.env.example` | Missing | Medium |
| Error boundaries | Missing | Medium |
| SEO (robots, sitemap) | Missing | Medium |
| API caching | Inconsistent | Low |
| Error monitoring | None | Low |

### Implementation Order

Based on impact and dependency, the recommended build order is:

1. **Database** — Connect PostgreSQL, run migrations from `docs/database-architecture.md`
2. **Migrate in-memory store to DB** — Replace `lib/admin-store.ts` with DB-backed queries
3. **Admin authentication** — `admin_users` table, login API, `middleware.ts`, JWT sessions
4. **Protect admin API routes** — Add auth check to all `/api/admin/*` handlers
5. **Palisis live integration** — Replace mock data, build webhook handler and diff UI
6. **Fix Google Reviews hardcoded bug** — Remove "Dinner Hopping Luxembourg" fallback
7. **Centralise AI model resolution** — Ensure all AI routes honour admin config
8. **SEO** — Add `robots.ts`, `sitemap.ts`, and `generateMetadata()` to all pages
9. **Error boundaries** — Add `app/error.tsx` and `app/not-found.tsx`
10. **Caching** — Add revalidation to weather and reviews routes
11. **Rate limiting** — Add rate limiting to AI routes and careers form
