# About Page — Live Google Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/about` page's static/empty testimonials and hardcoded "4.7" rating with live reviews from the general Sightseeing.lu Google Business Profile, and feed the live rating into the page's stats tile and JSON-LD.

**Architecture:** A new dependency-free `normalizePlaceDetails` pure function (unit-tested) converts Google Place Details JSON into a normalized shape. A new server helper `getGlobalGoogleReviews()` resolves the general account's Place ID + fetches/normalizes/caches reviews. The `/api/google-reviews` global branch and the `/about` server component both call this one helper. A presentational `AboutGoogleReviews` component renders the badge + cards + link.

**Tech Stack:** Next.js 16 App Router (React 19, server components), TypeScript, Tailwind, `lucide-react`. Tests: `node --test` over TS compiled by the `pretest` tsc step into `.test-build/`.

## Global Constraints

- No database changes and no migration (feature reuses the existing `googlePlaceId` setting + Google Places integration). Verbatim from spec: "This feature reuses the existing `googlePlaceId` setting and the existing Google Places integration. No tables, columns, settings keys, or seed data are added. Therefore no migration is required."
- The general profile share link is `https://share.google/CMkITZRJksNDlPTRD` and MUST live in exactly one shared module (`lib/google-reviews-global.ts`) — no duplicated literal.
- The `/api/google-reviews` external JSON contract MUST stay unchanged: `{ name?, rating?, totalReviews?, reviews: [{ author, avatar?, rating, date, text, url? }], error? }`.
- The About page must always render the reviews section (graceful fallback), and stats tile + JSON-LD fall back to `4.7` when live data is unavailable.
- External API key resolution order (verbatim, unchanged): `settings.apiKeys.googleReviews || process.env.GOOGLE_PLACES_API_KEY`.

---

### Task 1: Pure `normalizePlaceDetails` module + unit test

**Files:**
- Create: `lib/google-reviews-normalize.ts`
- Create: `test/google-reviews-normalize.test.mjs`
- Modify: `package.json` (add the new file to the `pretest` tsc compile list)

**Interfaces:**
- Consumes: nothing (dependency-free).
- Produces:
  - `interface LiveReview { author: string; avatar?: string; rating: number; date: string; text: string; url?: string }`
  - `interface GlobalReviews { name?: string; rating?: number; totalReviews?: number; reviews: LiveReview[]; error?: string }`
  - `interface RawPlaceDetails { name?: string; rating?: number; user_ratings_total?: number; reviews?: Array<Record<string, unknown>> }`
  - `function normalizePlaceDetails(raw: RawPlaceDetails, max?: number): GlobalReviews` (default `max = 6`)

- [ ] **Step 1: Write the failing test**

Create `test/google-reviews-normalize.test.mjs`:

```javascript
import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/google-reviews-normalize.js")
const normalizePlaceDetails = mod.normalizePlaceDetails ?? mod.default?.normalizePlaceDetails

const RAW = {
  name: "Sightseeing Luxembourg",
  rating: 4.7,
  user_ratings_total: 128,
  reviews: [
    { author_name: "Ana", profile_photo_url: "http://x/a.png", rating: 5, relative_time_description: "a week ago", text: "Great!", author_url: "http://g/ana" },
    { author_name: "Ben", rating: 4, relative_time_description: "a month ago", text: "Good" },
  ],
}

test("maps place details into the normalized shape", () => {
  const out = normalizePlaceDetails(RAW)
  assert.equal(out.name, "Sightseeing Luxembourg")
  assert.equal(out.rating, 4.7)
  assert.equal(out.totalReviews, 128)
  assert.equal(out.reviews.length, 2)
  assert.deepEqual(out.reviews[0], {
    author: "Ana", avatar: "http://x/a.png", rating: 5,
    date: "a week ago", text: "Great!", url: "http://g/ana",
  })
  // Optional fields absent → undefined, not empty string
  assert.equal(out.reviews[1].avatar, undefined)
  assert.equal(out.reviews[1].url, undefined)
})

test("caps the number of returned reviews at max (default 6)", () => {
  const many = { ...RAW, reviews: Array.from({ length: 10 }, (_, i) => ({ author_name: `U${i}`, rating: 5, relative_time_description: "now", text: "t" })) }
  assert.equal(normalizePlaceDetails(many).reviews.length, 6)
  assert.equal(normalizePlaceDetails(many, 3).reviews.length, 3)
})

test("handles missing rating/total/reviews without throwing", () => {
  const out = normalizePlaceDetails({ name: "X" })
  assert.equal(out.rating, undefined)
  assert.equal(out.totalReviews, undefined)
  assert.deepEqual(out.reviews, [])
})

test("falls back gracefully on malformed review entries", () => {
  const out = normalizePlaceDetails({ reviews: [{}] })
  assert.equal(out.reviews[0].author, "Google user")
  assert.equal(out.reviews[0].rating, 0)
  assert.equal(out.reviews[0].text, "")
  assert.equal(out.reviews[0].date, "")
})
```

- [ ] **Step 2: Wire the file into the pretest compile list**

In `package.json`, the `pretest` script compiles individual TS files into `.test-build`. Append the new module to the FIRST `tsc` invocation's file list (the one that ends `--rootDir lib/planner --outDir .test-build ...`) is NOT correct — that group has `--rootDir lib/planner`. Instead add a new standalone `tsc` group for this file. Change the `pretest` value so it also runs:

```
&& tsc lib/google-reviews-normalize.ts --rootDir lib --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop
```

Append that fragment immediately before the closing quote of the existing `pretest` string (after the last existing `tsc ... --esModuleInterop`). The output lands at `.test-build/google-reviews-normalize.js`, matching the test's import path.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test 2>&1 | head -40`
Expected: FAIL — `.test-build/google-reviews-normalize.js` cannot be imported (module not created yet) or `normalizePlaceDetails` is undefined.

- [ ] **Step 4: Write minimal implementation**

Create `lib/google-reviews-normalize.ts`:

```typescript
// Pure, dependency-free normalization of Google Place Details JSON.
// Kept free of any imports so it can be compiled + unit-tested in isolation
// by the `pretest` step (see package.json).

export interface LiveReview {
  author: string
  avatar?: string
  rating: number
  date: string
  text: string
  url?: string
}

export interface GlobalReviews {
  name?: string
  rating?: number
  totalReviews?: number
  reviews: LiveReview[]
  error?: string
}

export interface RawPlaceDetails {
  name?: string
  rating?: number
  user_ratings_total?: number
  reviews?: Array<Record<string, unknown>>
}

/** Convert a Google Place Details `result` into our normalized review shape. */
export function normalizePlaceDetails(raw: RawPlaceDetails, max = 6): GlobalReviews {
  const rawReviews = Array.isArray(raw.reviews) ? raw.reviews : []
  return {
    name: raw.name,
    rating: typeof raw.rating === "number" ? raw.rating : undefined,
    totalReviews: typeof raw.user_ratings_total === "number" ? raw.user_ratings_total : undefined,
    reviews: rawReviews.slice(0, max).map((r) => ({
      author: (r.author_name as string) || "Google user",
      avatar: (r.profile_photo_url as string) || undefined,
      rating: typeof r.rating === "number" ? (r.rating as number) : 0,
      date: (r.relative_time_description as string) || "",
      text: (r.text as string) || "",
      url: (r.author_url as string) || undefined,
    })),
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test 2>&1 | tail -30`
Expected: PASS — all four `google-reviews-normalize` tests green, existing tests unaffected.

- [ ] **Step 6: Commit**

```bash
git add lib/google-reviews-normalize.ts test/google-reviews-normalize.test.mjs package.json
git commit -m "feat(reviews): add pure normalizePlaceDetails + tests"
```

---

### Task 2: `getGlobalGoogleReviews()` server helper

**Files:**
- Create: `lib/google-reviews-global.ts`

**Interfaces:**
- Consumes: `normalizePlaceDetails`, `GlobalReviews`, `RawPlaceDetails` from `@/lib/google-reviews-normalize`; `dbGetSettings` from `@/lib/db/queries`.
- Produces (imported by Task 3 route + Task 5 page + Task 6 home):
  - `const GOOGLE_PROFILE_URL: string`
  - `interface PlaceDetails extends RawPlaceDetails {}`
  - `async function findPlaceIdByName(name: string, apiKey: string): Promise<string | null>`
  - `async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<{ ok: true; result: PlaceDetails } | { ok: false; status: string }>`
  - `async function getGlobalGoogleReviews(): Promise<GlobalReviews>` — never throws.

- [ ] **Step 1: Write the module**

Create `lib/google-reviews-global.ts`:

```typescript
import "server-only"
import { dbGetSettings } from "@/lib/db/queries"
import {
  normalizePlaceDetails,
  type GlobalReviews,
  type RawPlaceDetails,
} from "@/lib/google-reviews-normalize"

/** Public "share" link to the general Sightseeing.lu Google Business Profile.
 *  Single source of truth — imported by the homepage and About page. */
export const GOOGLE_PROFILE_URL = "https://share.google/CMkITZRJksNDlPTRD"

export interface PlaceDetails extends RawPlaceDetails {}

/** Google Text Search → Place ID by business name. */
export async function findPlaceIdByName(name: string, apiKey: string): Promise<string | null> {
  try {
    const searchUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(name)}&inputtype=textquery&fields=place_id&key=${apiKey}`
    const res = await fetch(searchUrl)
    const json = await res.json()
    if (json.status === "OK" && json.candidates?.length > 0) {
      return json.candidates[0].place_id
    }
    return null
  } catch {
    return null
  }
}

/** Fetch place details + reviews. `{ ok:false, status }` for recoverable
 *  bad-place-id responses; throws on transport / quota errors. */
export async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<{ ok: true; result: PlaceDetails } | { ok: false; status: string }> {
  const fields = "name,rating,user_ratings_total,reviews"
  const apiUrl =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}&language=en`

  const res = await fetch(apiUrl)
  if (!res.ok) throw new Error(`Places API HTTP ${res.status}`)
  const json = await res.json()

  if (json.status === "OK") return { ok: true, result: json.result as PlaceDetails }
  if (json.status === "NOT_FOUND" || json.status === "INVALID_REQUEST" || json.status === "ZERO_RESULTS") {
    return { ok: false, status: json.status }
  }
  throw new Error(`Places API: ${json.status} — ${json.error_message ?? "unknown error"}`)
}

// 30-min in-memory cache for the general-account result (single identity).
const _globalCache = new Map<string, { data: GlobalReviews; expiresAt: number }>()
const TTL_MS = 30 * 60_000

/** Resolve + fetch the general Sightseeing.lu Google reviews. Never throws —
 *  returns `{ reviews: [], error }` on any failure so callers can fail soft. */
export async function getGlobalGoogleReviews(): Promise<GlobalReviews> {
  const settings = await dbGetSettings()
  const apiKeys = settings.apiKeys as Record<string, string> | undefined
  const apiKey = apiKeys?.googleReviews || process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return { reviews: [], error: "Google Places API key not configured" }
  }

  let placeId: string | null = (apiKeys?.googlePlaceId ?? "").trim() || null
  const cacheKey = placeId ?? "global:sightseeing-luxembourg"
  const cached = _globalCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) return cached.data

  try {
    // Fixed server-side name — not influenced by caller input.
    if (!placeId) placeId = await findPlaceIdByName("Sightseeing Luxembourg", apiKey)
    if (!placeId) return { reviews: [], error: "Could not resolve a Google Place ID" }

    const details = await fetchPlaceDetails(placeId, apiKey)
    if (!details.ok) return { reviews: [], error: `Places API: ${details.status}` }

    const payload = normalizePlaceDetails(details.result)
    _globalCache.set(cacheKey, { data: payload, expiresAt: Date.now() + TTL_MS })
    return payload
  } catch (err) {
    return { reviews: [], error: err instanceof Error ? err.message : "Failed to fetch Google reviews" }
  }
}
```

- [ ] **Step 2: Typecheck the new module**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: no new errors referencing `lib/google-reviews-global.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/google-reviews-global.ts
git commit -m "feat(reviews): add getGlobalGoogleReviews server helper + shared profile URL"
```

---

### Task 3: Delegate the `/api/google-reviews` global branch to the helper

**Files:**
- Modify: `app/api/google-reviews/route.ts`

**Interfaces:**
- Consumes: `getGlobalGoogleReviews`, `findPlaceIdByName`, `fetchPlaceDetails`, `PlaceDetails` from `@/lib/google-reviews-global`.
- Produces: unchanged external JSON contract.

- [ ] **Step 1: Import from the shared helper and remove the duplicated local definitions**

At the top of `route.ts`, add:

```typescript
import { getGlobalGoogleReviews, findPlaceIdByName, fetchPlaceDetails, type PlaceDetails } from "@/lib/google-reviews-global"
```

Then DELETE these now-duplicated local definitions from `route.ts` (they moved to the helper):
- `findPlaceIdByName` (the `/* Use Google Text Search ... */` function)
- `interface PlaceDetails { ... }`
- `fetchPlaceDetails` (the `/* Fetch place details + reviews. ... */` function)

Keep everything else in `route.ts` (`extractPlaceId`, `resolveShortlink`, `extractPlaceName`, SSRF helpers, `_reviewsCache`, rate limiting) — the per-trip branch still uses them.

- [ ] **Step 2: Replace the global-scope branch body**

Find the block that begins with the comment `// ── Global / homepage scope ──` (currently ~line 368) and runs to the end of the `GET` handler's global path (the `let placeId ...` through the final `catch` that returns the 500). Replace that entire global-scope block with:

```typescript
  // ── Global / homepage scope ─────────────────────────────────────────
  // Identity is resolved exclusively from server-side sources inside the
  // shared helper (admin `googlePlaceId`, else fixed text search). The
  // caller-supplied `url` param is intentionally ignored.
  const payload = await getGlobalGoogleReviews()
  if (payload.error && payload.reviews.length === 0) {
    const status = payload.error.includes("not configured") ? 503 : 400
    return NextResponse.json({ error: payload.error, reviews: [] }, { status })
  }
  return NextResponse.json(payload)
```

Note: the top-level API-key 503 guard earlier in `GET` (the `if (!apiKey) { ... status: 503 }` block) stays as-is — it protects both branches. `dbGetSettings`/`dbGetTrip`/`dbUpdateTrip` imports remain (used by the trip branch).

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: no errors in `route.ts` (no unused-symbol errors for the removed functions; `findPlaceIdByName`/`fetchPlaceDetails`/`PlaceDetails` now resolve to the import and are still used by the trip branch).

- [ ] **Step 4: Manual smoke — homepage contract unchanged**

Run: `pnpm dev` (Turbopack) and load `http://localhost:5000/`.
Expected: the homepage "Travelers love Sightseeing.lu" section behaves exactly as before — live reviews if a key is configured, or the graceful "View Reviews on Google" fallback if not. Check the terminal for no new errors from `/api/google-reviews`.

- [ ] **Step 5: Commit**

```bash
git add app/api/google-reviews/route.ts
git commit -m "refactor(reviews): route global branch delegates to shared helper"
```

---

### Task 4: `AboutGoogleReviews` presentational component

**Files:**
- Create: `components/about-google-reviews.tsx`

**Interfaces:**
- Consumes: `type GlobalReviews` from `@/lib/google-reviews-normalize`.
- Produces: `function AboutGoogleReviews(props: { data: GlobalReviews | null; profileUrl: string }): JSX.Element` (server component — no `"use client"`, no hooks).

- [ ] **Step 1: Write the component**

Create `components/about-google-reviews.tsx`:

```tsx
import { Star, ExternalLink } from "lucide-react"
import type { GlobalReviews } from "@/lib/google-reviews-normalize"

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Google" fill="none">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-border"}`} />
      ))}
    </div>
  )
}

export function AboutGoogleReviews({ data, profileUrl }: { data: GlobalReviews | null; profileUrl: string }) {
  const reviews = data?.reviews ?? []
  const rating = typeof data?.rating === "number" ? data.rating : null
  const total = typeof data?.totalReviews === "number" ? data.totalReviews : null

  // Graceful fallback — key/reviews unavailable. Always render something.
  if (reviews.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-background p-10 text-center">
        <GoogleIcon className="h-9 w-9 opacity-60" />
        <p className="mt-4 text-sm font-semibold text-foreground">Read what travellers are saying</p>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Authentic reviews from guests who have experienced our tours.
        </p>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          View Reviews on Google
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    )
  }

  return (
    <>
      {/* Live overall-rating badge + View-all link (replaces the old hardcoded "4.7 average") */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 rounded-full bg-primary/10 px-3 py-1.5">
          <GoogleIcon className="h-4 w-4 shrink-0" />
          {rating !== null && <span className="text-sm font-bold text-primary">{rating.toFixed(1)}</span>}
          {rating !== null && <StarRow rating={rating} />}
          {total !== null && (
            <span className="text-xs font-medium text-primary">
              {total.toLocaleString()} Google review{total === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          View all on Google
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Live review cards — About page grid style */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {reviews.map((r, idx) => (
          <div key={idx} className="flex flex-col rounded-xl border border-border bg-background p-5">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{r.author}</p>
                <p className="text-[10px] text-muted-foreground">{r.date}</p>
              </div>
              <GoogleIcon className="h-4 w-4 shrink-0" />
            </div>
            <div className="mt-2">
              <StarRow rating={r.rating} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-5">{r.text}</p>
          </div>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: no errors in `components/about-google-reviews.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/about-google-reviews.tsx
git commit -m "feat(about): add AboutGoogleReviews presentational component"
```

---

### Task 5: Wire the About page to live data

**Files:**
- Modify: `app/about/page.tsx`

**Interfaces:**
- Consumes: `getGlobalGoogleReviews`, `GOOGLE_PROFILE_URL` from `@/lib/google-reviews-global`; `AboutGoogleReviews` from `@/components/about-google-reviews`.

- [ ] **Step 1: Update imports**

In `app/about/page.tsx`:
- REMOVE `import { reviews } from "@/lib/data"` (line 5) — the static array is no longer used.
- ADD:

```typescript
import { getGlobalGoogleReviews, GOOGLE_PROFILE_URL } from "@/lib/google-reviews-global"
import { AboutGoogleReviews } from "@/components/about-google-reviews"
```

- If `Star` (from `lucide-react`) is no longer referenced anywhere in the file after Step 3, remove it from the `lucide-react` import to avoid an unused-import lint error. (It is currently only used in the reviews section being replaced.)

- [ ] **Step 2: Fetch live reviews at the top of the component**

Inside `export default async function AboutPage()`, after the existing `publishedTrips` / `offerTags` fetches, add:

```typescript
  // Live general-account Google reviews. Fail-soft: null → stats/JSON-LD fall
  // back to the historical 4.7, and the section shows its graceful fallback.
  const google = await getGlobalGoogleReviews().catch(() => null)
  const liveRating = typeof google?.rating === "number" ? google.rating : null
  const liveReviewCount = typeof google?.totalReviews === "number" ? google.totalReviews : null
```

- [ ] **Step 3: Feed the live rating into the stats tile**

Change the `Customer Rating` entry in the `stats` array (currently `{ label: "Customer Rating", value: "4.7/5" }`) to:

```typescript
    { label: "Customer Rating", value: liveRating ? `${liveRating.toFixed(1)}/5` : "4.7/5" },
```

- [ ] **Step 4: Feed the live rating into the JSON-LD `aggregateRating`**

Replace the existing `aggregateRating: totalReviews > 0 ? { ... } : undefined,` block with:

```typescript
    aggregateRating: (liveRating !== null || totalReviews > 0) ? {
      "@type": "AggregateRating",
      ratingValue: (liveRating ?? 4.7).toFixed(1),
      reviewCount: (liveReviewCount ?? totalReviews).toString(),
    } : undefined,
```

- [ ] **Step 5: Replace the reviews section body**

In the `{/* Reviews */}` section, replace the inner markup — the `<div className="flex items-center gap-3">…</div>` (heading + hardcoded "4.7 average" badge) AND the `<div className="mt-6 grid gap-4 sm:grid-cols-3">{reviews.map(...)}</div>` — with:

```tsx
            <AboutReviewsHeading />
            <AboutGoogleReviews data={google} profileUrl={GOOGLE_PROFILE_URL} />
```

Leave the surrounding `<section className="border-t border-border bg-card py-12">` / container `<div>` wrappers intact.

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: no errors; no "declared but never used" for `reviews` or `Star`.

- [ ] **Step 7: Manual verification**

Run: `pnpm dev` and load `http://localhost:5000/about`.
Expected:
- With a Google Places key configured: the reviews section shows a live rating badge, live cards, and a "View all on Google" link; the "Customer Rating" stats tile shows the live rating; page `<script type="application/ld+json">` contains the live `ratingValue`/`reviewCount` (inspect page source).
- With no/invalid key: the section shows the dashed fallback with "View Reviews on Google"; stats tile shows `4.7/5`; page still renders fully with no runtime error in the terminal.

- [ ] **Step 8: Commit**

```bash
git add app/about/page.tsx
git commit -m "feat(about): live Google reviews in section, stats tile, and JSON-LD"
```

---

### Task 6: De-duplicate `GOOGLE_PROFILE_URL` on the homepage

**Files:**
- Modify: `components/home-sections.tsx`

**Interfaces:**
- Consumes: `GOOGLE_PROFILE_URL` from `@/lib/google-reviews-global`.

- [ ] **Step 1: Replace the local constant with the shared import**

In `components/home-sections.tsx`:
- DELETE the local `const GOOGLE_PROFILE_URL = "https://share.google/CMkITZRJksNDlPTRD"` (currently line 375).
- ADD to the imports at the top:

```typescript
import { GOOGLE_PROFILE_URL } from "@/lib/google-reviews-global"
```

All existing references to `GOOGLE_PROFILE_URL` in the file now resolve to the shared constant.

Note: `home-sections.tsx` is a client component (`"use client"`). `lib/google-reviews-global.ts` starts with `import "server-only"`, which would break a client import. To keep the URL shared without pulling server-only code into the client bundle, MOVE only the `GOOGLE_PROFILE_URL` constant into the dependency-free `lib/google-reviews-normalize.ts` (which has no `server-only` guard), re-export it from `lib/google-reviews-global.ts` for existing server importers, and import it from `@/lib/google-reviews-normalize` here.

Concretely:
1. In `lib/google-reviews-normalize.ts`, add near the top:
   ```typescript
   /** Public share link to the general Sightseeing.lu Google Business Profile. */
   export const GOOGLE_PROFILE_URL = "https://share.google/CMkITZRJksNDlPTRD"
   ```
2. In `lib/google-reviews-global.ts`, change the local declaration to a re-export:
   ```typescript
   export { GOOGLE_PROFILE_URL } from "@/lib/google-reviews-normalize"
   ```
   (remove the inline `export const GOOGLE_PROFILE_URL = ...` added in Task 2).
3. In `components/home-sections.tsx`, import it from `@/lib/google-reviews-normalize`:
   ```typescript
   import { GOOGLE_PROFILE_URL } from "@/lib/google-reviews-normalize"
   ```
4. The Task 5 import in `app/about/page.tsx` (`GOOGLE_PROFILE_URL` from `@/lib/google-reviews-global`) still works via the re-export — no change needed there.

- [ ] **Step 2: Typecheck + build**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: no errors; no duplicate/unused-symbol issues.

- [ ] **Step 3: Manual smoke — homepage still renders reviews**

Run: `pnpm dev` and load `http://localhost:5000/`.
Expected: homepage reviews section unchanged; no console/runtime error.

- [ ] **Step 4: Commit**

```bash
git add lib/google-reviews-normalize.ts lib/google-reviews-global.ts components/home-sections.tsx
git commit -m "refactor(reviews): single shared GOOGLE_PROFILE_URL constant"
```

---

## Final Verification

- [ ] `pnpm test` — all tests pass (including the new `google-reviews-normalize` suite).
- [ ] `pnpm exec tsc --noEmit` — clean.
- [ ] `pnpm build` — production build succeeds.
- [ ] Manual: `/about` and `/` both render reviews correctly with a key configured AND with the key removed (graceful fallback), stats tile + JSON-LD reflect live rating on `/about`.
- [ ] Confirm no migration was created (Global Constraint) — `git status` shows no changes under `lib/data-migrations/`.

## Self-Review Notes

- **Spec coverage:** shared helper (Task 2) ✓; route delegation keeping contract (Task 3) ✓; presentational component with fallback (Task 4) ✓; stats tile + JSON-LD + section swap + drop static import (Task 5) ✓; shared `GOOGLE_PROFILE_URL` (Task 6) ✓; no DB change / no migration (Global Constraints + Final Verification) ✓.
- **Type consistency:** `GlobalReviews` / `LiveReview` / `RawPlaceDetails` defined in Task 1 and consumed unchanged in Tasks 2/4; `getGlobalGoogleReviews` / `GOOGLE_PROFILE_URL` signatures consistent across Tasks 2/3/5/6. `GOOGLE_PROFILE_URL` home lands in `google-reviews-normalize.ts` (Task 6) with a re-export from `google-reviews-global.ts` so both server and client importers resolve — resolves the `server-only` vs `"use client"` conflict.
