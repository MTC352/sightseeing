# sightseeing.lu — Implementation Audit

> **Generated:** 2026-04-24
> **Scope:** Code analysis of the full Next.js 14 codebase covering third-party API integrations, state management, and admin authentication. Each section documents exactly what is currently implemented, what is incomplete, and what is recommended.

---

## Progress Dashboard

A top-level snapshot of implementation completeness across all major areas.

| # | Area | Done | Remaining | % Complete | Status |
|---|---|---|---|---|---|
| 1.1 | Palisis (Booking Engine) | 3 / 9 tasks | 6 tasks | **33%** | Skeleton |
| 1.2 | OpenWeatherMap | 7 / 10 tasks | 3 tasks | **70%** | Working |
| 1.3 | Mapbox | 3 / 7 tasks | 4 tasks | **43%** | Working with risks |
| 1.4 | Weglot (Translation) | 5 / 9 tasks | 4 tasks | **56%** | Working |
| 1.5 | Anthropic / OpenAI (AI) | 6 / 11 tasks | 5 tasks | **55%** | Functional, inconsistent |
| 1.6 | Google Places / Reviews | 5 / 9 tasks | 4 tasks | **56%** | Working with bugs |
| 2 | State Management | 4 / 7 tasks | 3 tasks | **57%** | Correct architecture |
| 3 | Admin Authentication | 1 / 8 tasks | 7 tasks | **13%** | Critically insecure |
| 4.1 | Environment Variables | 5 / 8 vars set | 3 vars missing | **63%** | Partial |
| 4.2 | Database | 0 / 5 tasks | 5 tasks | **0%** | Not started |
| 4.3 | API Route Protection | 0 / 7 routes | 7 routes | **0%** | Not started |
| 4.4 | Next.js Middleware | 0 / 1 tasks | 1 task | **0%** | Not started |
| 4.5 | SEO & Meta Tags | 2 / 6 tasks | 4 tasks | **33%** | Partial |
| 4.6 | Error Monitoring | 0 / 5 tasks | 5 tasks | **0%** | Not started |
| 4.7 | Caching Strategy | 0 / 5 tasks | 5 tasks | **0%** | Not started |

**Overall project production-readiness: ~35%**

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

**What it does:** Palisis is the third-party booking platform. The platform syncs trip catalog data from Palisis for display. Actual booking is handled by Palisis via an embedded iframe.

> **Progress: 3 / 9 tasks complete — 33%**

#### What Is Done (3/9)

| # | Task | File | Notes |
|---|---|---|---|
| 1 | Import API route exists | `app/api/admin/palisis-import/route.ts` | Route scaffolded and wired into the admin UI |
| 2 | Availability API route exists | `app/api/admin/palisis-availability/route.ts` | Route scaffolded |
| 3 | API key check with warning | Same file | Checks if key is set, logs a warning if missing |

#### What Remains (6/9)

| # | Task | Priority | Detail |
|---|---|---|---|
| 4 | Replace mock data with real Palisis API call | Critical | The `fetch()` call is commented out; `MOCK_PALISIS_CATALOG` is used instead |
| 5 | Implement webhook receiver at `/api/webhooks/palisis` | High | No route exists; Palisis cannot push updates to the platform |
| 6 | Validate webhook signature | High | Must verify HMAC/shared secret to authenticate Palisis push events |
| 7 | Build diff confirmation modal in `/admin/palisis` | Medium | Before applying a single-trip update, show a before/after comparison per field |
| 8 | Build bulk import UI | Medium | Table with per-row "Changed" badge and "Override all" global checkbox |
| 9 | Write sync history to `palisis_sync_log` DB table | Medium | No audit trail currently; requires DB to be connected first |

#### Current Code Showing the Gap

```typescript
// app/api/admin/palisis-import/route.ts
const MOCK_PALISIS_CATALOG = [ ... ]  // hardcoded mock

export async function POST() {
  // Commented-out real call — never executes:
  // const res = await fetch(`${settings.apiKeys.palisis}/catalog`, {
  //   headers: { "X-Api-Key": settings.apiKeys.palisis }
  // })
  for (const item of MOCK_PALISIS_CATALOG) { ... }
}
```

---

### 1.2 OpenWeatherMap

**What it does:** Provides current weather and a 4-day forecast for Luxembourg City. Used on the homepage widget and by the AI trip planner to bias recommendations toward indoor/outdoor activities.

> **Progress: 7 / 10 tasks complete — 70%**

#### What Is Done (7/10)

| # | Task | File | Notes |
|---|---|---|---|
| 1 | Server-side proxy API route | `app/api/weather/route.ts` | Full current + 4-day forecast parsing |
| 2 | Static fallback on failure | Same file | Returns hardcoded Luxembourg data with `isFallback: true` |
| 3 | Network error handling | Same file | Catches `fetch` failures separately from HTTP errors |
| 4 | HTTP error handling | Same file | Handles 401 invalid key, 429 rate limit, etc. |
| 5 | JSON parse error handling | Same file | Separate try/catch for `.json()` |
| 6 | Client hook | `hooks/use-weather.ts` | Polls the proxy, not the external API directly |
| 7 | Weather context (app-wide) | `lib/weather-context.tsx` | `useWeather()` hook; `useIsGoodWeatherForTrip()` helper |

#### What Remains (3/10)

| # | Task | Priority | Detail |
|---|---|---|---|
| 8 | Add server-side caching | Medium | Currently `cache: "no-store"` on every request. Add `next: { revalidate: 900 }` (15 min) to avoid hammering the OpenWeather API |
| 9 | Surface `isFallback` flag in the UI | Low | When fallback fires, show "Estimated weather" label instead of displaying mock data as live |
| 10 | Admin key management | Low | Allow rotating the key via `/admin/integrations` without a redeployment |

---

### 1.3 Mapbox

**What it does:** Provides the interactive map widget used on the explore and trip pages.

> **Progress: 3 / 7 tasks complete — 43%**

#### What Is Done (3/7)

| # | Task | File | Notes |
|---|---|---|---|
| 1 | Token proxy route | `app/api/mapbox-token/route.ts` | Server-side route that returns the token to the client |
| 2 | Map component | `components/chatgpt-widgets/sightseeing-map.tsx` | Fetches token from proxy, renders Mapbox GL map |
| 3 | Multiple env var aliases | Same route file | Tries 8 different variable names to find the token |

#### What Remains (4/7)

| # | Task | Priority | Detail |
|---|---|---|---|
| 4 | Restrict token by domain at Mapbox dashboard | High | Any person who calls `/api/mapbox-token` gets the token; must be restricted at Mapbox account level |
| 5 | Standardise env variable name | Medium | 8 aliases exist because the name was inconsistent — pick one (`MAPBOX_PUBLIC_TOKEN`) and remove the rest |
| 6 | Add `Origin`/`Referer` check to proxy route | Medium | In production, only return the token to requests from the own domain |
| 7 | Admin key management in `/admin/integrations` | Low | Token currently only configurable via environment variable; cannot be updated without redeployment |

---

### 1.4 Weglot (Translation)

**What it does:** Automatic multi-language translation of the entire public frontend via injected JavaScript.

> **Progress: 5 / 9 tasks complete — 56%**

#### What Is Done (5/9)

| # | Task | File | Notes |
|---|---|---|---|
| 1 | Script injected via `next/script` | `components/weglot-loader.tsx` | Avoids raw `<head>` injection (hydration error fixed) |
| 2 | `Weglot.initialize()` inside `onLoad` | Same file | Prevents "Weglot is not defined" crash |
| 3 | Hydration error fix applied | `app/layout.tsx` | Script moved out of `<head>` in earlier session |
| 4 | Admin config UI | `app/admin/integrations/weglot/page.tsx` | UI for language pairs, flags, exclusions |
| 5 | `.no-translate` class support | Frontend components | Elements with this class are excluded from translation |

#### What Remains (4/9)

| # | Task | Priority | Detail |
|---|---|---|---|
| 6 | Validate Weglot key format in admin | Medium | Admin can save any string; keys must start with `wg_` — add a format check |
| 7 | "Test connection" button | Medium | Call Weglot API to confirm key is valid and show active language count in admin UI |
| 8 | Prevent content flash on load | Low | Add `visibility: hidden` on `<html>` until Weglot initialises to prevent visible re-rendering |
| 9 | Single key source (admin overrides env var) | Low | Currently both env var and admin store are checked independently; consolidate lookup priority |

---

### 1.5 Anthropic / OpenAI (AI)

**What it does:** Powers three AI features — Trip Planner (`/planner`), Trip Chat on trip detail pages, and Help AI on `/help`. Uses the Vercel AI SDK with streaming.

> **Progress: 6 / 11 tasks complete — 55%**

#### What Is Done (6/11)

| # | Task | File | Notes |
|---|---|---|---|
| 1 | Trip planner streaming with 7 tools | `app/api/planner/route.ts` | `streamText` with searchTrips, showWeather, offerCoupon, showTransitPlanner, showWeatherAlert, buildItinerary, addToCart |
| 2 | Help AI with FAQ knowledge base | `app/api/help-chat/route.ts` | Reads all published help articles as context |
| 3 | Trip chat (per-trip context) | `app/api/trip-chat/route.ts` | Trip details injected into system prompt |
| 4 | AI writing assistant (admin) | `app/api/admin/ai-advisor/route.ts` | Admin-side content generation helper |
| 5 | Blog post generator (admin) | `app/api/admin/generate-blog/route.ts` | Generates blog drafts from a topic |
| 6 | Admin AI config UI | `app/admin/ai-systems/` | Per-system prompt, model, temperature, max_tokens — saves to admin store |

#### What Remains (5/11)

| # | Task | Priority | Detail |
|---|---|---|---|
| 7 | Centralise model resolution | High | `trip-chat` and `ai-advisor` ignore the admin config and always use hardcoded `openai/gpt-4o-mini`. Create a shared `getAIModel(systemKey)` utility used by all routes |
| 8 | User-facing error messages | High | When an AI route fails (missing API key, rate limit), the user sees nothing. Return a readable message |
| 9 | API key validation on boot | Medium | Add a startup check that confirms AI keys are present; log a clear warning if not |
| 10 | Persist AI config to database | Medium | Admin edits to prompts/models are currently lost on server restart (in-memory only) |
| 11 | Token usage tracking | Low | Log per-request token usage to `ai_usage_log` table for cost monitoring |

#### The Inconsistency (Currently in Code)

```typescript
// app/api/planner/route.ts — correctly reads admin config:
model: plannerBehavior?.model || settings.ai?.planner?.model || "openai/gpt-4o-mini",

// app/api/trip-chat/route.ts — ignores admin config entirely:
model: "openai/gpt-4o-mini",  // always hardcoded
```

---

### 1.6 Google Places / Reviews

**What it does:** Fetches Google Reviews for the business to display on the homepage.

> **Progress: 5 / 9 tasks complete — 56%**

#### What Is Done (5/9)

| # | Task | File | Notes |
|---|---|---|---|
| 1 | API route with Places Details call | `app/api/google-reviews/route.ts` | Full Google Places Details API integration |
| 2 | Shortlink resolution | Same file | Follows `maps.app.goo.gl`, `goo.gl` redirects |
| 3 | Place ID extraction from multiple URL formats | Same file | Handles raw Place ID, `?cid=`, and URL path formats |
| 4 | Text search fallback | Same file | Falls back to Places text search — but see bug below |
| 5 | Structured error response | Same file | Returns `{ error, reviews: [] }` on failure |

#### What Remains (4/9)

| # | Task | Priority | Detail |
|---|---|---|---|
| 6 | Remove hardcoded business name bug | Critical | Line 114 hardcodes `"Dinner Hopping Luxembourg"` — will silently fetch the wrong business for any deployment that isn't that specific company |
| 7 | Cache Place ID resolution | Medium | Place IDs do not change; cache the resolved ID in the DB to avoid re-running URL parsing on every request |
| 8 | Cache review results | Medium | Reviews change slowly; add 30–60 min server cache to avoid per-request API billing |
| 9 | Admin Place ID direct input | Low | Allow admin to enter a Place ID directly in `/admin/integrations` instead of requiring a Google Maps URL |

#### The Bug

```typescript
// app/api/google-reviews/route.ts — line 114
// Could be a short code, try a broader search
placeId = await findPlaceIdByName("Dinner Hopping Luxembourg", apiKey)
// ↑ This hardcoded name silently fetches the wrong business
//   for every other deployment of this codebase.
```

---

## 2. State Management — No Redux

> **Progress: 4 / 7 tasks complete — 57%**

### 2.1 What Is Implemented

The project does **not use Redux**, Zustand, Jotai, or any third-party state management library. This is correct for the scale of the project. Instead it uses:

#### React Context API (Client-Side) — Done

| # | Context | File | Manages | Persistence |
|---|---|---|---|---|
| 1 | `CartProvider` | `lib/cart-context.tsx` | Cart items, quantities, totals | Cookie (`sightseeing_cart`, 7-day, max 3.8 KB) |
| 2 | `WeatherProvider` | `lib/weather-context.tsx` | Current weather + forecast | In-memory (re-fetched on mount) |
| 3 | `EditModeProvider` | `components/edit-mode-provider.tsx` | Inline admin edit mode, pending changes | In-memory only |
| 4 | `ThemeProvider` | Via `next-themes` | Light / dark mode | `localStorage` |

#### Server-Side In-Memory Stores — Done (but blocking)

| Store | File | Manages |
|---|---|---|
| Admin store | `lib/admin-store.ts` | Trips, blog posts, jobs, tickets, help articles, applications |
| Page content store | `lib/page-content-store.ts` | Inline text edits from `?admin_edit=1` |

Both stores use the `globalThis` pattern to survive Next.js HMR. They do **not** survive server restarts or deployments — this is the critical gap.

### 2.2 What Is Not Implemented

| # | Feature | Status | Note |
|---|---|---|---|
| 5 | Database-backed persistence | Not implemented | All admin data lost on restart — this is the blocker |
| 6 | React Query for server state | Not implemented | Would replace manual `useEffect + fetch` in admin pages |
| 7 | Optimistic UI updates | Not implemented | Admin mutations give no instant feedback while saving |

### 2.3 Recommendations

| Recommendation | Priority | Reason |
|---|---|---|
| Replace in-memory admin store with PostgreSQL | **Critical** | Data is lost on every restart; production is unusable |
| Keep Context API for cart, weather, edit mode | Keep as-is | These are genuinely client-only concerns |
| Add React Query (`@tanstack/react-query`) | Medium | Adds caching, background refetch, loading/error state management |
| Do not add Redux | None | Adds boilerplate with zero benefit at this project scale |

---

## 3. Admin Panel Authentication

> **Progress: 1 / 8 tasks complete — 13%**

### 3.1 What Is Implemented

The admin panel (`/admin/*`) uses a client-side PIN gate in `app/admin/layout.tsx`.

| # | Task | Status | Detail |
|---|---|---|---|
| 1 | Login UI (PIN gate form) | Done | A form component that blocks the admin UI behind a PIN |
| 2 | Secure credentials (not hardcoded) | Not done | PIN is `"1234"` on line 11 of the layout file — in source code |
| 3 | Server-side session | Not done | Auth state lives in `sessionStorage` — server has no awareness |
| 4 | API route protection | Not done | All `/api/admin/*` routes are completely public |
| 5 | Next.js middleware | Not done | No `middleware.ts` file exists |
| 6 | Role-based access control | Not done | Single shared PIN, no per-user roles |
| 7 | Brute-force protection | Not done | No rate limiting on PIN attempts |
| 8 | Secure logout (server session invalidation) | Not done | Logout just clears `sessionStorage` — no server-side invalidation |

### 3.2 Security Gaps

| Gap | Severity | Detail |
|---|---|---|
| PIN hardcoded in source code | **Critical** | Anyone with repo access (or who views the JS bundle) knows the PIN instantly |
| No server-side session | **Critical** | Server cannot verify if a request comes from an authenticated admin |
| All admin API routes are unprotected | **Critical** | `curl -X DELETE /api/admin/trips/123` works with no auth — the PIN gate is purely a UI decoration |
| No `middleware.ts` | **Critical** | No edge-level route protection whatsoever |
| `sessionStorage` cleared on tab close | Medium | Admin is forced to re-enter PIN on every new tab or browser refresh |
| PIN shown in the form UI | Medium | `<p>Default PIN: 1234</p>` is literally rendered in the form |
| No brute-force protection | Medium | Unlimited PIN attempts allowed |
| No role separation | Medium | One shared PIN — no distinction between superadmin and read-only editor |

### 3.3 Recommended Implementation

Build the replacement in this order (each step unblocks the next):

#### Step 1 — Create `admin_users` DB table (blocks everything below)
```sql
CREATE TABLE admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,  -- bcrypt, 12+ rounds
  role          TEXT NOT NULL DEFAULT 'editor',  -- 'superadmin' | 'editor'
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Step 2 — Create `POST /api/admin/auth/login`
- Accept `{ email, password }`
- Query `admin_users` by email
- `bcrypt.compare(password, row.password_hash)`
- On success: sign a JWT with `jose` (edge-compatible), set it as an `HttpOnly` `Secure` cookie
- On failure: return `401` after a fixed 300ms delay (prevents timing attacks)

#### Step 3 — Create `middleware.ts`
```typescript
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value
  if (!token) {
    const isApi = request.nextUrl.pathname.startsWith("/api/admin")
    return isApi
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/admin/login", request.url))
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET))
  } catch {
    return NextResponse.redirect(new URL("/admin/login", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
}
```

#### Step 4 — Create `/admin/login` page
Email + password form. `POST` to `/api/admin/auth/login`. On success, redirect to `/admin`.

#### Step 5 — Create `POST /api/admin/auth/logout`
Clear the `admin_session` cookie and invalidate the session server-side.

#### Step 6 — Seed first superadmin
On first run, seed one `admin_users` row using `ADMIN_INITIAL_PASSWORD` from environment variables.

#### Step 7 — Remove the old PIN gate
Delete the `PIN` constant and `PinGate` component from `app/admin/layout.tsx`. Delete the site-level PIN gate from `components/site-password-gate.tsx` if no longer needed.

#### Step 8 — Add rate limiting to `/api/admin/auth/login`
Allow maximum 10 attempts per IP per 15 minutes. Return `429` if exceeded.

---

## 4. Other Setup Areas

---

### 4.1 Environment Variables

> **Progress: 5 / 8 variables configured — 63%**

| # | Variable | Used In | Status |
|---|---|---|---|
| 1 | `OPENWEATHER_API_KEY` | `/api/weather` | Set — fallback served if missing |
| 2 | `MAPBOX_TOKEN` (or one of 8 aliases) | `/api/mapbox-token` | Set — empty string returned if missing |
| 3 | `NEXT_PUBLIC_WEGLOT_KEY` | `weglot-loader.tsx` | Set — translation silently disabled if missing |
| 4 | `ANTHROPIC_API_KEY` | AI routes | Set — AI routes throw 500 if missing |
| 5 | `GOOGLE_PLACES_API_KEY` | `/api/google-reviews` | Set — reviews disabled if missing |
| 6 | `DATABASE_URL` | Not yet used | **Missing** — no DB connected |
| 7 | `ADMIN_INITIAL_PASSWORD` | Not yet used | **Missing** — needed when proper auth is built |
| 8 | `JWT_SECRET` | Not yet used | **Missing** — needed for signing admin sessions |

**Remaining:** Create a `.env.example` file listing all 8 variables with placeholder values so new developers know what to configure.

---

### 4.2 Database

> **Progress: 0 / 5 tasks complete — 0%**

| # | Task | Priority | Detail |
|---|---|---|---|
| 1 | Connect PostgreSQL (`DATABASE_URL` env var) | **Critical** | No database is connected; all data is in-memory |
| 2 | Install ORM or DB client (Drizzle or Prisma) | **Critical** | No database client library is installed |
| 3 | Run initial migrations (16 tables) | **Critical** | Schema is fully documented in `docs/database-architecture.md` |
| 4 | Replace `lib/admin-store.ts` with DB queries | **Critical** | All in-memory `Map` operations must become SQL queries |
| 5 | Seed initial data | High | 43 trips, 10 system pages, 3 AI configs, 8 integration slots, 5 header/footer blocks |

**This is the highest-priority gap in the project.** Production is impossible without it — every admin change (trip edit, blog post, job listing) is silently discarded on restart.

---

### 4.3 API Route Protection

> **Progress: 0 / 7 routes protected — 0%**

| # | Route Group | Protected? | Risk | Action Required |
|---|---|---|---|---|
| 1 | `/api/admin/*` (34 routes) | No | **Critical** | Add auth middleware check to every handler |
| 2 | `/api/planner` | No | High | Add rate limiting — AI calls cost money per request |
| 3 | `/api/help-chat` | No | High | Add rate limiting |
| 4 | `/api/trip-chat` | No | High | Add rate limiting |
| 5 | `/api/careers/apply` | No | Medium | Add CAPTCHA or rate limit to prevent spam applications |
| 6 | `/api/mapbox-token` | No | Medium | Restrict by `Origin` header in production |
| 7 | `/api/weather` | No | Low | Acceptable — fallback serves if abused |

---

### 4.4 Next.js Middleware

> **Progress: 0 / 1 tasks complete — 0%**

`middleware.ts` does not exist in the project root. Without it:
- Admin routes and API routes can be accessed by anyone
- No edge-level rate limiting is possible
- No HTTPS enforcement or redirect logic
- No way to attach request context (locale, auth claims) before page rendering

**Required action:** Create `middleware.ts` as part of the authentication implementation (see Section 3.3 Step 3 above).

---

### 4.5 SEO and Meta Tags

> **Progress: 2 / 6 tasks complete — 33%**

| # | Task | Status | Detail |
|---|---|---|---|
| 1 | `<title>` tags on some pages | Done (partial) | Present on some pages; inconsistent across the rest |
| 2 | Open Graph tags on some pages | Done (partial) | Present on some pages; missing or incomplete on others |
| 3 | `robots.txt` | **Not done** | Missing — search engines have no crawl instructions |
| 4 | `sitemap.xml` | **Not done** | Missing — no auto-generation from trip/blog routes |
| 5 | Structured data (JSON-LD) | **Not done** | No `schema.org` markup for trip products, reviews, or local business |
| 6 | Canonical URLs | **Not done** | No `<link rel="canonical">` on any page |

**Recommended:** Add `app/robots.ts` and `app/sitemap.ts` (Next.js 14 file-based generation). Use `generateMetadata()` in every page layout for consistent, dynamic meta tags. Add `TouristAttraction`, `LocalBusiness`, and `Review` JSON-LD on trip pages.

---

### 4.6 Error Monitoring

> **Progress: 0 / 5 tasks complete — 0%**

| # | Task | Priority | Detail |
|---|---|---|---|
| 1 | `app/error.tsx` global error boundary | **High** | Without this, any unhandled React error shows a white screen with no message |
| 2 | `app/not-found.tsx` custom 404 | High | Visiting any invalid URL shows the default Next.js 404 — no branding |
| 3 | Error boundary on individual page sections | Medium | Prevents a broken widget from crashing the entire page |
| 4 | Error monitoring service (e.g., Sentry) | Medium | Provides stack traces, user session replays, and error alerts in production |
| 5 | Structured server-side error logging | Low | Currently all errors go to `console.error` only — no aggregation or alerting |

---

### 4.7 Caching Strategy

> **Progress: 0 / 5 tasks complete — 0%**

| # | Data | Current Strategy | Status | Recommended |
|---|---|---|---|---|
| 1 | Weather API | `cache: "no-store"` | **Not done** | `next: { revalidate: 900 }` — 15-minute TTL |
| 2 | Google Reviews | `cache: "no-store"` | **Not done** | `next: { revalidate: 3600 }` — 1-hour TTL |
| 3 | Trip catalog (after DB) | In-memory, always fresh | **Not done** | Postgres + ISR revalidation on trip update |
| 4 | Blog posts (after DB) | In-memory, always fresh | **Not done** | Postgres + ISR revalidation on publish |
| 5 | Mapbox token | Not cached | **Not done** | CDN-cacheable — token does not change between requests |

---

## 5. Overall Status Summary

### By Feature Area

| Area | Done | Remaining | % | Production Blocker? |
|---|---|---|---|---|
| Palisis integration | 3 tasks | 6 tasks | **33%** | Yes — mock data only |
| OpenWeatherMap | 7 tasks | 3 tasks | **70%** | No — fallback works |
| Mapbox | 3 tasks | 4 tasks | **43%** | No — functional with risk |
| Weglot | 5 tasks | 4 tasks | **56%** | No — functional |
| AI (Anthropic / OpenAI) | 6 tasks | 5 tasks | **55%** | No — functional with inconsistencies |
| Google Reviews | 5 tasks | 4 tasks | **56%** | No — bug to fix |
| State management | 4 tasks | 3 tasks | **57%** | Indirectly — in-memory store is the blocker |
| Admin authentication | 1 task | 7 tasks | **13%** | **Yes — critically insecure** |
| Environment variables | 5 set | 3 missing | **63%** | Yes — DB and auth vars missing |
| Database | 0 tasks | 5 tasks | **0%** | **Yes — not connected** |
| API route protection | 0 routes | 7 routes | **0%** | **Yes — all admin data exposed** |
| Next.js middleware | 0 tasks | 1 task | **0%** | **Yes — no edge protection** |
| SEO & meta tags | 2 tasks | 4 tasks | **33%** | No — affects discoverability |
| Error monitoring | 0 tasks | 5 tasks | **0%** | No — affects reliability |
| Caching strategy | 0 tasks | 5 tasks | **0%** | No — affects performance |

### Recommended Build Order

The following order respects dependencies — each step unblocks the next.

| Step | What | Why Now |
|---|---|---|
| **1** | Connect PostgreSQL + run migrations | Everything below depends on having a DB |
| **2** | Migrate in-memory admin store to DB | Makes admin data persistent — core requirement for production |
| **3** | Build admin authentication (email + bcrypt + JWT) | Auth requires `admin_users` table from step 1 |
| **4** | Add `middleware.ts` + protect all `/api/admin/*` routes | Requires auth from step 3 |
| **5** | Implement real Palisis API call + webhook route | Requires DB for `palisis_sync_log` |
| **6** | Fix Google Reviews hardcoded business name | Simple one-line fix — unblocks correct reviews |
| **7** | Centralise AI model resolution across all routes | Ensures admin AI config is consistently applied |
| **8** | Add `app/error.tsx` and `app/not-found.tsx` | Prevents white screen crashes in production |
| **9** | Add SEO: `robots.ts`, `sitemap.ts`, `generateMetadata()` | Required before any marketing or search indexing |
| **10** | Add caching to weather and reviews routes | Reduces external API costs and improves load time |
| **11** | Add rate limiting to AI routes and careers form | Prevents cost abuse and form spam |
| **12** | Set up error monitoring (Sentry or equivalent) | Needed to detect issues after going live |
