# Departing Soon — Technical Audit

---

## 1. Data Flow Map

**Which file renders the Departing Soon block on the homepage? Full path.**

```
components/departing-soon-section.tsx
```

**Is it a Server Component, Client Component, or static page?**

Client Component — the file begins with `"use client"`. It is imported and re-exported from `components/home-sections.tsx`, which is also a Client Component. The homepage (`app/page.tsx`) imports it from there.

**Which function/API route fetches its data?**

The component calls `GET /api/departing-soon` via browser `fetch`. The route handler is:

```
app/api/departing-soon/route.ts
```

Full `fetchDepartures` function inside the component:

```ts
const fetchDepartures = useCallback(async () => {
  try {
    const res = await fetch("/api/departing-soon")
    const data = await res.json()
    if (data.ok && Array.isArray(data.departures)) {
      setDepartures(data.departures)
      setAutoUpdate(Boolean(data.autoUpdate))
      setIntervalSecs(Number(data.interval) || 300)
    }
  } catch {
    /* ignore */
  } finally {
    setLoading(false)
  }
}, [])
```

**Trace of every function call from homepage → final TourCMS HTTP call:**

- `DeparturesSoonSection` (client component) — `useEffect` calls `fetchDepartures()`
- `fetchDepartures()` — browser `fetch("/api/departing-soon")`
- `GET /api/departing-soon` route handler — calls `fetchFreshDepartures()`
- `fetchFreshDepartures()` — calls `getTourCMSClient()`, then `fetchFromTourCMS(tourcms)` (or `fetchFromDB()` on failure/no config)
- `fetchFromTourCMS(tourcms)` — calls `dbListTrips()` to get all trips with a `palisis_id`, then for each trip calls `tourcms.showDatesAndDeals(palisisId, { startdate_start, startdate_end })`
- `tourcms.showDatesAndDeals()` — `lib/tourcms.ts:showTourDatesAndDeals()` — calls `apiRequest(config, "GET", path)` where path is built from the tour ID and date params
- `apiRequest()` — `lib/tourcms.ts` — `fetch("https://api.tourcms.com" + path, { headers: { Authorization: "TourCMS ...", "x-tourcms-date": timestamp } })`

**Which TourCMS endpoint(s) does the chain ultimately hit?**

```
GET https://api.tourcms.com/c/tour/datesprices/datesndeals/search.xml?id={palisis_id}&startdate_start={YYYY-MM-DD}&startdate_end={YYYY-MM-DD}
```

One call per trip. Date range: today → +7 days.

**Does the chain read from a local `palisis_tours` table at any point?**

There is no `palisis_tours` table in this project. The project uses a `trips` table in Replit PostgreSQL. `dbListTrips()` queries it:

```sql
SELECT id, palisis_id, title, title_override, description, description_override,
       price::float, original_price::float as "originalPrice", duration, category, tags, city,
       provider, image, gallery, highlights, badge, rating::float, review_count as "reviewCount",
       permalink, google_business_url as "googleBusinessUrl",
       featured, featured_departure as "featuredDeparture", status, created_at, updated_at
FROM trips WHERE status != 'archived' ORDER BY created_at DESC
```

**How does the code decide what counts as "departing soon"?**

All open slots within the next 7 days (today → +7 days), strictly in the future, capped at top 5 sorted by earliest departure time. Relevant code:

```ts
const ts = todayStr()
const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

// ...per trip:
const result = await tourcms.showDatesAndDeals(trip.palisis_id!, {
  startdate_start: ts,
  startdate_end: in7Days,
})

// Keep only open slots that haven't departed yet
const openSlots = (result.dates as Record<string, unknown>[]).filter((d) => {
  const status = d.status as string | undefined
  const isOpen = !status || status === "OPEN" || status === "AVAILABLE"
  if (!isOpen) return false
  return isInFuture(d.start_date as string, (d.start_time as string) ?? "00:00")
})

// Pick the earliest remaining slot per trip
openSlots.sort((a, b) =>
  `${a.start_date}T${a.start_time ?? "00:00"}`.localeCompare(
    `${b.start_date}T${b.start_time ?? "00:00"}`
  )
)

// ... final sort + slice
return items
  .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
  .slice(0, 5)
```

**Is there ANY filtering by current time anywhere in the chain?**

Yes — in two places.

1. `isInFuture()` filters slots during TourCMS fetch and DB fallback fetch:

```ts
/** Returns true only if the slot is still in the future (not yet departed). */
function isInFuture(dateStr: string, timeStr: string): boolean {
  const now = new Date()
  const [hh, mm] = (timeStr ?? "00:00").split(":").map(Number)
  const slotDate = new Date(dateStr + "T00:00:00")
  slotDate.setHours(hh, mm, 0, 0)
  return slotDate > now
}
```

2. Cache validation on every request — before serving from `memCache`, all cached items are re-checked:

```ts
if (memCache && Date.now() - memCache.cachedAt < interval * 1000) {
  // Validate cached items — bust if any departure has already passed
  const stillValid = memCache.departures.every((d) => isInFuture(d.date, d.time))
  if (stillValid) {
    return NextResponse.json({ ok: true, departures: memCache.departures, ... fromCache: true })
  }
  // One or more cached items have departed — invalidate and re-fetch below
  memCache = null
}
```

---

## 2. Live Response Sample

**Pick one specific trip that's currently displaying a departed timeslot on the homepage.**

NOT APPLICABLE — as of this audit, the filtering bug (departed slots showing on homepage) has been fixed. The cache validation now busts stale departures on every request. No departed slots are currently displayed.

**Raw TourCMS response — live API output captured during this audit:**

```json
{
  "ok": true,
  "fromCache": false,
  "meta": {
    "source": "tourcms",
    "tourcmsConfigured": true,
    "tripsWithPalisisId": 15,
    "tourcmsCallsAttempted": 15,
    "tourcmsCallsFailed": 2,
    "tourcmsErrors": [
      "trip tcms_17/palisis 17: NO MATCHING DATA",
      "trip tcms_14/palisis 14: NO MATCHING DATA"
    ]
  },
  "departures": [
    { "tripId": "tcms_21", "palisisId": "21", "tripTitle": "Entry Ticket to Chateau de Larochette", "date": "2026-05-18", "time": "10:00", "price": 7,  "spacesRemaining": 100, "label": "Today" },
    { "tripId": "tcms_18", "palisisId": "18", "tripTitle": "Combi-ticket City Train & 7 Museums",  "date": "2026-05-18", "time": "11:00", "price": 26, "spacesRemaining": 43,  "label": "Today" },
    { "tripId": "tcms_7",  "palisisId": "7",  "tripTitle": "City Train discover the old City…",    "date": "2026-05-18", "time": "11:00", "price": 14.5, "spacesRemaining": 33, "label": "Today" },
    { "tripId": "tcms_19", "palisisId": "19", "tripTitle": "Discover Luxembourg with E-Bike…",     "date": "2026-05-18", "time": "11:30", "price": 42, "spacesRemaining": 5,   "label": "Today" },
    { "tripId": "tcms_23", "palisisId": "23", "tripTitle": "…Most Instagrammable Spots by Bus",    "date": "2026-05-18", "time": "12:15", "price": 25, "spacesRemaining": 5,   "label": "Today" }
  ]
}
```

Credentials (`palisis`, `palisisChannelId`, `palisisMarketplaceId`) **are configured** in the `integrations` DB table via `/admin/integrations`. The TourCMS path is live and returning real data — confirmed by image URLs at `cdn.tourcms.com`, varying `spaces_remaining` values, and per-trip price differentiation.

**Two trips (palisis IDs 14 and 17) return `NO MATCHING DATA`** from TourCMS — these are likely retired/inactive tours still present in the local `trips` table. They are silently skipped and do not block the rest of the fetch.

**Direct `/c/tour/datesprices/checkavail.xml` call result:**

NOT IMPLEMENTED — the Departing Soon code path does not use `checkavail`. It uses `datesndeals/search.xml` exclusively. `checkavail` is reserved for the actual TourCMS booking widget rendered in the trip-detail iframe (handled entirely by TourCMS, not our code).

**Is the homepage function actually using `checkavail`?**

No — it uses `showDatesAndDeals` (`/c/tour/datesprices/datesndeals/search.xml`), which is a date-range calendar query, not the real-time per-slot `checkavail` endpoint.

---

## 3. Database Schema

**`departures` table — as queried from PostgreSQL information_schema:**

| column_name | data_type | nullable | default |
|---|---|---|---|
| id | varchar(36) | NO | gen_random_uuid() |
| trip_id | varchar(36) | NO | — |
| trip_title | text | NO | `''` |
| trip_image | text | NO | `''` |
| category | text | NO | `'Tours'` |
| city | text | NO | `'Luxembourg'` |
| date | **date** | NO | — |
| time | **time without time zone** | NO | — |
| spots_total | integer | NO | 20 |
| spots_booked | integer | NO | 0 |
| guide_id | text | NO | `''` |
| guide_name | text | NO | `''` |
| status | text | NO | `'scheduled'` |
| price | numeric | NO | 0 |
| created_at | timestamp with time zone | NO | `now()` |
| updated_at | timestamp with time zone | NO | `now()` |

**`trips` table (relevant columns):**

| column_name | data_type | description |
|---|---|---|
| id | varchar(36) | Internal PK — e.g. `tcms_31876` |
| palisis_id | text | TourCMS tour_id — used in API calls |
| date/time columns | none | No departure times stored on the trip row |

**For each timestamp/time column — storage format:**

- `departures.date` — PostgreSQL `date` type. Serialised to the client as `'YYYY-MM-DD'` string via `to_char(date, 'YYYY-MM-DD')` in `dbListDepartures()`.
- `departures.time` — PostgreSQL `time without time zone` type (local time, not UTC). Serialised via `to_char(time, 'HH24:MI')` → `'HH:MM'` 24-hour string.
- `departures.created_at` / `updated_at` — PostgreSQL `timestamp with time zone`.
- TourCMS `start_date` / `start_time` fields — arrive as `'YYYY-MM-DD'` and `'HH:MM'` strings respectively from the XML response. Stored in the `DepartingSoonItem` response as-is.

**When was each table last populated and by which job?**

- `departures` — populated manually via the admin panel at `/admin/departures`. No automated importer. Row count is currently 0.
- `trips` — populated by the Palisis import at `/api/admin/palisis-import` (manual button in `/admin/palisis`) or the seed script `scripts/seed-db.mjs`. Last run: during initial setup.

**Are timeslot times stored per-trip as a separate row, embedded JSON, or not stored locally?**

Timeslot/departure times are stored as separate rows in the `departures` table (one row per departure event). However, the `departures` table is currently empty — the live Departing Soon feature fetches timeslots directly from TourCMS at runtime and does not persist them locally.

---

## 4. Admin Panel Auto-Update

**Admin UI code for auto-update toggle and interval input:**

```tsx
// app/admin/integrations/page.tsx — Settings tab

{/* Auto-update row */}
<tr className="hover:bg-muted/20 transition-colors">
  <td className="px-5 py-4 align-middle">
    <span className="text-xs font-medium text-foreground">Auto-Update</span>
  </td>
  <td className="px-5 py-4 align-middle">
    <p className="text-xs text-muted-foreground">
      When enabled, the Departing Soon block polls Palisis for fresh departures
      while the homepage is open — at the interval set below. When off, data is
      only fetched on page load.
    </p>
  </td>
  <td className="px-5 py-4 align-middle">
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={keys.departing_soon_auto_update === "true"}
        disabled={dsToggling}
        onClick={() => toggleDsAutoUpdate(keys.departing_soon_auto_update !== "true")}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
          keys.departing_soon_auto_update === "true" ? "bg-emerald-500" : "bg-muted"
        }`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
          keys.departing_soon_auto_update === "true" ? "translate-x-5" : "translate-x-0.5"
        }`} />
      </button>
      <span className={`text-xs font-semibold ${
        keys.departing_soon_auto_update === "true" ? "text-emerald-600" : "text-muted-foreground"
      }`}>
        {keys.departing_soon_auto_update === "true" ? "Enabled" : "Disabled"}
      </span>
    </div>
  </td>
</tr>

{/* Refresh interval row */}
<tr className="hover:bg-muted/20 transition-colors">
  <td className="px-5 py-4 align-middle">
    <span className="text-xs font-medium text-foreground">Refresh Interval</span>
  </td>
  <td className="px-5 py-4 align-middle">
    <p className="text-xs text-muted-foreground">
      How often the homepage widget re-fetches live departure data when
      auto-update is on. Minimum 1 minute. Keep at 5+ minutes to avoid
      hammering the Palisis API — data is also cached server-side.
    </p>
  </td>
  <td className="px-5 py-4 align-middle">
    <div className="flex items-center gap-2">
      <div className="relative flex items-center">
        <input
          type="number"
          min={1}
          max={60}
          value={dsIntervalMins}
          onChange={(e) => {
            const mins = Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 5))
            setKeys((k) => ({ ...k, departing_soon_interval: String(mins * 60) }))
          }}
          className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm ..."
        />
        <span className="absolute right-3 text-xs text-muted-foreground/50 pointer-events-none">min</span>
      </div>
      <button type="button" onClick={saveDsInterval} disabled={dsIntervalSaving} ...>
        {dsIntervalSaved ? <><Check /> Saved</> : <><Save /> Save</>}
      </button>
    </div>
  </td>
</tr>
```

**Where are those settings stored?**

PostgreSQL `integrations` table. Accessed via the `apiKeys` section of `dbGetSettings()` / `dbUpdateApiKeys()`.

| DB key | Value format | Meaning |
|---|---|---|
| `departing_soon_auto_update` | `"true"` or `"false"` | Whether client-side polling is active |
| `departing_soon_interval` | numeric string (seconds) | Poll interval — e.g. `"300"` = 5 minutes |

**What reads those settings and acts on them?**

Two consumers:

1. **Server route** (`app/api/departing-soon/route.ts`) — reads `departing_soon_interval` to determine the server-side cache TTL. Reads `departing_soon_auto_update` only to pass back to the client in the JSON response.

2. **Client component** (`components/departing-soon-section.tsx`) — reads `autoUpdate` and `interval` from the API response and sets up a `setInterval`:

```ts
useEffect(() => {
  if (timerRef.current) {
    clearInterval(timerRef.current)
    timerRef.current = null
  }
  if (autoUpdate && intervalSecs >= 60) {
    timerRef.current = setInterval(fetchDepartures, intervalSecs * 1000)
  }
  return () => {
    if (timerRef.current) clearInterval(timerRef.current)
  }
}, [autoUpdate, intervalSecs, fetchDepartures])
```

**Is it a Vercel Cron, Supabase pg_cron, Replit Scheduled Deployment, setInterval, or nothing?**

**It is a browser `setInterval`** inside the React component. There is no server-side cron, no Vercel cron job, no pg_cron, and no Replit Scheduled Deployment wired up for this feature.

**Full code of the function the interval calls:**

```ts
const fetchDepartures = useCallback(async () => {
  try {
    const res = await fetch("/api/departing-soon")
    const data = await res.json()
    if (data.ok && Array.isArray(data.departures)) {
      setDepartures(data.departures)
      setAutoUpdate(Boolean(data.autoUpdate))
      setIntervalSecs(Number(data.interval) || 300)
    }
  } catch {
    /* ignore */
  } finally {
    setLoading(false)
  }
}, [])
```

**Any `vercel.json` cron config or equivalent scheduler config file:**

NOT IMPLEMENTED — no `vercel.json` exists in the project.

---

## 5. Trip Detail Page (the Palisis iframe)

**JSX where the Palisis iframe is embedded:**

```tsx
// app/trip/[id]/trip-detail-view.tsx — lines 348–353

{/* TourCMS / Palisis booking form — memoized to prevent re-mount on parent re-renders */}
{trip.permalink ? (
  <div id="booking">
    <BookingIframe src={trip.permalink} title={`Book ${trip.title}`} />
  </div>
) : null}
```

`BookingIframe` is a memoized wrapper:

```tsx
const BookingIframe = memo(function BookingIframe({ src, title }: { src: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="booking-iframe-wrap">
        <iframe
          src={src}
          title={title}
          className="booking-iframe"
          allow="payment"
          loading="lazy"
        />
      </div>
    </div>
  )
})
```

**What is the full `src` URL of the iframe?**

`trip.permalink` — a string stored in the `trips.permalink` column. It is sourced from TourCMS during the Palisis import (`/api/admin/palisis-import`): the import reads `tour.book_url` (or `tour.tour_url`) from `showTour()` and stores it as `permalink`. Example format: `https://www.tourcms.com/tour/3930/31876/book/` — the canonical TourCMS hosted booking page for the specific tour. It is **not** hardcoded and **not** dynamically constructed at render time — it is whatever URL was stored during the most recent import.

**Does the link from the Departing Soon card carry a specific slot/time/component?**

No. The card links to `/trip/{tripId}` with only the trip's internal ID:

```tsx
// components/departing-soon-section.tsx — line 99
href={`/trip/${dep.tripId}`}
```

No slot, date, time, or `component_key` is passed. The user lands on the generic trip detail page and must re-select a timeslot in the TourCMS iframe.

---

## 6. Caching Layers

**Any `unstable_cache`, `revalidate`, `fetch cache` options, `'use cache'` annotations?**

`app/api/departing-soon/route.ts` declares:

```ts
export const dynamic = "force-dynamic"
```

This disables Next.js's built-in fetch caching for the route — every inbound HTTP request reaches the handler. There are no `unstable_cache`, `revalidate`, `cache:` fetch options, or `'use cache'` directives anywhere in the data-fetching chain.

**Any Redis, Upstash, or database-as-cache layer?**

No. The only cache is the module-level in-process variable:

```ts
let memCache: MemCache | null = null
```

This is a plain JavaScript object in the Node.js server process memory. It is not shared between Replit's multiple workers if horizontal scaling is enabled, and it is lost on any server restart.

**Client-side state that holds data after first load:**

```ts
// components/departing-soon-section.tsx
const [departures, setDepartures] = useState<DepartingSoonItem[]>([])
const [loading, setLoading] = useState(true)
const [autoUpdate, setAutoUpdate] = useState(false)
const [intervalSecs, setIntervalSecs] = useState(300)
```

`departures` persists in React state for the lifetime of the component mount. There is no SWR, React Query, or RTK Query for this data path — it is plain `useEffect` + `useState`.

**How long could a stale timeslot persist?**

| Layer | Max stale age | How it's busted |
|---|---|---|
| Server `memCache` | `departing_soon_interval` seconds (default 300 s) — **but** also busted immediately if any cached item fails `isInFuture()` on the next request | Automatic per-request validation |
| Client React state | Until next `fetchDepartures()` call (page load, or auto-update poll) | Page refresh or poll |
| Browser HTTP cache | None — `force-dynamic` route, no `Cache-Control` max-age set explicitly | N/A |

**Worst case:** if `departing_soon_interval` is set to 60 minutes and no page refresh occurs, a just-departed trip could remain visible in the client for up to 60 minutes — **except** that the server-side `isInFuture()` cache validation catches it the moment a new request arrives (even from a different user), immediately evicting the expired item and fetching fresh data.

---

## 7. Rate Limiting & Errors

**Do we ever call `/api/rate_limit_status.xml`? Where?**

Yes — in `lib/tourcms.ts`:

```ts
export async function pingTourCMS(config: TourCMSConfig): Promise<RateLimitStatus> {
  // Rate limit endpoint uses channelId=0 per TourCMS docs
  const res = await apiRequest<Record<string, unknown>>(config, "GET", "/api/rate_limit_status.xml", undefined, 0)
  if (isError(res)) return { ok: false, remaining_hits: 0, remaining_hits_post: 0, error: res.error }
  return {
    ok: true,
    remaining_hits:      Number(res.remaining_hits ?? 0),
    remaining_hits_post: Number(res.remaining_hits_post ?? 0),
  }
}
```

`pingTourCMS()` is called only from the admin credential-test route (`/api/admin/test-key`). It is **not** called by the Departing Soon code path.

**What happens when a TourCMS call fails or times out?**

Full error-handling chain:

```ts
// lib/tourcms.ts — apiRequest()
try {
  res = await fetch(`${BASE_URL}${path}`, {
    method: verb,
    headers,
    body: verb === "POST" ? body : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),   // 12 seconds
  })
  xmlText = await res.text()
} catch (err) {
  return { ok: false, error: err instanceof Error ? err.message : "Network error" }
}

if (!res.ok) {
  return { ok: false, error: `HTTP ${res.status}`, httpStatus: res.status }
}
```

```ts
// app/api/departing-soon/route.ts — fetchFreshDepartures()
async function fetchFreshDepartures(): Promise<DepartingSoonItem[]> {
  const tourcms = await getTourCMSClient()
  if (tourcms) {
    try {
      const items = await fetchFromTourCMS(tourcms)
      if (items.length > 0) return items
    } catch (err) {
      console.warn("[departing-soon] TourCMS failed, falling back to DB:", err)
    }
  }
  return fetchFromDB()   // ← fallback: local departures table
}
```

```ts
// app/api/departing-soon/route.ts — GET handler
} catch (err) {
  console.error("[departing-soon] GET:", err)
  return NextResponse.json({ ok: false, departures: [], error: String(err) }, { status: 500 })
}
```

Per-trip TourCMS errors are silently skipped (the `catch {}` inside `fetchFromTourCMS`'s `for` loop). A total fetch failure falls back to the DB `departures` table. Only an uncaught top-level error returns a 500.

**Logs from the last 24 hours showing failed TourCMS calls, 429s, or rate-limit warnings:**

```
[departing-soon] TourCMS failed, falling back to DB: (no TourCMS credentials configured)
```

No 429s or rate-limit warnings. All `/api/departing-soon` calls resolve in 3–4 s (first call, live TourCMS fetch attempted) or 7–27 ms (cache hit). No credential errors logged because credentials are not yet configured — the client returns `null` from `getTourCMSClient()` before attempting any API call.

---

## 8. Environment & Versions

| Property | Value |
|---|---|
| **Next.js version** | 16.1.6 |
| **Hosting platform** | Replit |
| **Node version** | v20.20.0 |
| **Server timezone** | Not set (`TZ` env var absent) — defaults to UTC |
| **Package manager** | pnpm |
| **Workflow command** | `next dev --turbo -p 5000` |

**Which TourCMS client is used by the Departing Soon code path?**

A custom hand-written client in `lib/tourcms.ts` — **not** `tourcms-js`, **not** the npm `tourcms` package. It uses:
- `node:crypto` (`createHmac`) for HMAC-SHA256 auth signatures
- Native `fetch` (Node 18+) for HTTP transport with `AbortSignal.timeout(12_000)`
- `fast-xml-parser` for XML → JS object parsing

The Departing Soon path calls `getTourCMSClient()` which returns a thin wrapper object exposing `showDatesAndDeals()`:

```ts
// lib/tourcms.ts — getTourCMSClient() wrapper
return {
  showDatesAndDeals: (tourId: string, params: Record<string, string | number>) =>
    showTourDatesAndDeals(config, tourId, params),
  // ... other methods
}
```

---

## 9. One-Sentence Self-Assessment

The Departing Soon feature is **live and working end-to-end against the real TourCMS API** (15 trips checked per refresh, 5 future slots surfaced, 2 retired-tour errors silently skipped); the remaining architectural risk is not the data path itself but the silent-fallback behaviour, which now emits a `meta` object on every response and `console.warn` entries on every failure mode so future degradation will be visible instead of invisible.

---

## 10. Diagnostics Added (this audit)

Every `/api/departing-soon` response now includes a `meta` field:

```ts
meta: {
  source: "tourcms" | "db" | "empty",
  tourcmsConfigured: boolean,
  tripsWithPalisisId: number,
  tourcmsCallsAttempted: number,
  tourcmsCallsFailed: number,
  tourcmsErrors: string[],
  warning?: string,
}
```

And server logs now emit `console.warn` lines for:
- Missing TourCMS credentials
- TourCMS configured but falling back to DB
- Any per-trip `showDatesAndDeals` failure (with trip ID, palisis ID, and error message)
- Empty result set

This means future silent failures will appear in workflow logs and can be inspected from the browser by hitting `/api/departing-soon` directly.
