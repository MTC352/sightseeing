# Palisis / TourCMS Integration Analysis — sightseeing.lu

> **Generated**: May 2026
> **Purpose**: Complete map of every Palisis/TourCMS touchpoint on the site, with data source,
> API accuracy notes, mock data flags, and what needs fixing.
>
> **Legend for data source:**
> - 🗄️ DB — data served from our PostgreSQL database
> - 📡 TourCMS READ — live API call to TourCMS (read-only, no changes to TourCMS)
> - ✍️ TourCMS WRITE — creates a booking on TourCMS platform (intentional write)
> - 🔗 IFRAME — customer-facing iframe to TourCMS booking widget (booking made on Palisis platform)
> - ❌ MOCK — currently using fake/dummy data

---

## Rule: What we write to TourCMS

> **Only one action from our site writes anything to TourCMS: booking creation.**
> Every other interaction is read-only. No trip edits, no departure changes, no booking cancellations,
> no customer modifications are ever sent from our site to TourCMS.

---

## Admin Panel Integrations

### 1. `/api/admin/test-key?service=palisis` — Credentials Test

| | |
|---|---|
| **File** | `app/api/admin/test-key/route.ts` |
| **Data source** | 📡 TourCMS READ |
| **What it does** | Calls `GET /api/rate_limit_status.xml` with the provided API key to verify connectivity |
| **TourCMS endpoint used** | `GET /api/rate_limit_status.xml` ✅ Correct |
| **Writes to TourCMS?** | No |

**Issues:**
- Requires `TOURCMS_CHANNEL_ID` env var to be set before testing
- If Channel ID is not configured, falls back to a key-length check (not a real API test)
- Consider reading Channel ID from the key param URL when testing from Admin → Integrations

---

### 2. `POST /api/admin/palisis-import` — Tour Catalog Import

| | |
|---|---|
| **File** | `app/api/admin/palisis-import/route.ts` |
| **Data source** | 📡 TourCMS READ → 🗄️ DB write |
| **What it does** | Fetches tour catalog from TourCMS, upserts into our `trips` table |
| **Writes to TourCMS?** | No |

**Issues (must fix):**

1. **WRONG ENDPOINT**: Currently calls `GET /c/tours/search.xml` (`searchTours()`).
   - This is the **customer-facing search** endpoint — only returns currently-saleable tours.
   - For import, the correct endpoint is `GET /p/tours/list.xml` (`listTours()`) with channelId=0.
   - `/p/tours/list.xml` returns ALL tours including `has_sale=0` (no future dates) which are still valid products.
   - See `docs/tourcms-api-reference.md` §5.1.

2. **Missing Show Tour step**: The import only fetches the lean summary from search.
   - Should call `GET /c/tour/show.xml?id={id}&show_options=1` for each tour to get full detail.
   - Key fields missing: `longdesc`, `itinerary`, `images[]`, `geocode_start_point`, `new_booking.people_selection` (rate IDs), `descriptions_last_updated`.

3. **No incremental sync**: Every import re-fetches everything.
   - Should store `descriptions_last_updated` per trip and only call Show Tour when it changes.

4. **Field mapping incomplete**: `tour_name_long`, `description`, `from_price`, `image_url` are mapped.
   - Missing: `longdesc`, `itinerary`, `location`, `geocode_start_point`, `start_time`, `duration_desc`, `tour_url` (needed for booking iframe).

**Correct flow to implement:**
```
1. GET /p/tours/list.xml (channelId=0)  → lean list of all tours
2. For each tour where descriptions_last_updated changed:
   GET /c/tour/show.xml?id={id}&show_options=1  → full detail
   → Store in trips DB with palisis_id, channel_id, descriptions_last_updated
3. Update has_sale for all trips regardless (cheap, always update)
```

---

### 3. `POST /api/admin/palisis-availability` — Admin Availability Preview

| | |
|---|---|
| **File** | `app/api/admin/palisis-availability/route.ts` |
| **Data source** | 📡 TourCMS READ |
| **What it does** | Fetches 7-day availability slots for all synced trips — for admin preview only |
| **TourCMS endpoint used** | `GET /c/tour/datesprices/datesndeals/search.xml` (Dates & Deals) |
| **Writes to TourCMS?** | No |

**Issues:**
- Dates & Deals endpoint is correct for an overview preview (cached 30 min, not real-time).
- This data is for admin view only — should NOT be used for customer-facing slot selection.
- For customer-facing real-time slots, the frontend must call Check Availability (`GET /c/tour/datesprices/checkavail.xml`) — never Dates & Deals.

---

### 4. `GET /api/admin/test-key?service=palisis` — Admin Integrations Panel

| | |
|---|---|
| **File** | `app/admin/integrations/page.tsx` (UI) + `app/api/admin/test-key/route.ts` (API) |
| **Data source** | 📡 TourCMS READ |
| **What it does** | Tests API key connectivity when admin saves credentials |
| **Writes to TourCMS?** | No |

No endpoint issues — calls ping correctly.

---

### 5. `POST /api/webhooks/palisis` — TourCMS Inbound Webhooks

| | |
|---|---|
| **File** | `app/api/webhooks/palisis/route.ts` |
| **Data source** | Inbound from TourCMS → 🗄️ DB write |
| **What it does** | Receives events from TourCMS; updates our DB when things change on the TourCMS side |
| **Writes to TourCMS?** | No |

**Issues:**
1. **Event type names**: Current code handles `availability.updated`, `booking.confirmed`, `booking.cancelled`. Need to confirm exact event names with TourCMS.
2. **Payload schema mismatch**: Webhook payload uses `tripId`/`externalId` which may not match actual TourCMS webhook format. TourCMS webhooks likely use `tour_id` and `channel_id`.
3. **Signature verification**: Current code checks plain `x-palisis-secret` header. TourCMS may use HMAC-SHA256 for webhook signatures — verify and update.
4. **DB field**: Looks up trips by `palisisId` but the DB column is `palisis_id` — check field name consistency.
5. **`availability.updated` handler**: Tries to `dbUpdateTrip()` with raw webhook payload data — should instead re-fetch the full tour from TourCMS Show Tour and update from that, not trust the webhook payload.

---

## Frontend Integrations

### 6. `/trip/[id]` — Trip Detail Page — Booking Section

| | |
|---|---|
| **Files** | `app/trip/[id]/page.tsx`, `app/trip/[id]/trip-detail-view.tsx` |
| **Data source** | 🗄️ DB (trip data) + 🔗 IFRAME (booking widget) |
| **What it does** | Shows trip detail from DB; booking is done via Palisis iframe |

**Booking iframe** (line 304 in `trip-detail-view.tsx`):
```html
<iframe src="https://sightseeingluxembourg.palisis.com/?book-direct=r-8146" .../>
```

**Issues:**
- ❌ **Hardcoded iframe URL** — `r-8146` is a fixed product ID. Every trip shows the same booking widget.
- The `tour_url` or `book_url` field from TourCMS Show Tour (`GET /c/tour/show.xml`) contains the correct per-tour booking URL.
- **Fix**: Store `tour_url` or `book_url` from TourCMS in the `trips` DB table as `palisis_book_url`, then use `trip.palisis_book_url` in the iframe `src`.
- ❌ **No availability calendar above iframe** — customers cannot see dates/timeslots before clicking the iframe. Should add a date-picker stage (Dates & Deals → Check Availability).

**What data comes from where:**
- Trip title, description, price, images, highlights → 🗄️ DB ✅
- Booking widget → 🔗 IFRAME to Palisis (customer completes booking on Palisis) ✅
- Availability dates → ❌ NOT SHOWN — should use 📡 TourCMS READ (Dates & Deals)
- Timeslots → ❌ NOT SHOWN — should use 📡 TourCMS READ (Check Availability)

---

### 7. `/checkout` — Checkout Page — Booking Modal

| | |
|---|---|
| **File** | `app/checkout/page.tsx` |
| **Data source** | 🗄️ DB (cart items) + 🔗 IFRAME (booking) |

**Issues:**
- ❌ **Same hardcoded iframe**: `src="https://sightseeingluxembourg.palisis.com/?book-direct=r-8146"` (line 354)
- Should dynamically build the iframe URL from `trip.palisis_book_url` stored in DB

---

### 8. `/planner` — AI Planner — Booking Modal

| | |
|---|---|
| **File** | `app/planner/page.tsx` |
| **Data source** | 🗄️ DB (AI-recommended trips) + 🔗 IFRAME (booking) |

**Issues:**
- ❌ **Same hardcoded iframe**: `src="https://sightseeingluxembourg.palisis.com/?book-direct=r-8146"` (line 923)
- Should dynamically build the iframe URL from the trip selected in the planner

---

### 9. `/search` — Search Page — Departure Timeslots

| | |
|---|---|
| **File** | `app/search/search-content.tsx` |
| **Data source** | 🗄️ DB (trip list) + ❌ MOCK (timeslots) |

**Issues:**
- ❌ **Uses `getDummyDepartures(tripId)`** (line 174) — fake timeslot data
- Shows "Today" and "Tomorrow" departure buttons with made-up times
- **Fix**: Replace with 📡 TourCMS READ using `GET /c/tour/datesprices/checkavail.xml` for today and tomorrow
- Pattern: call Check Availability for each trip shown in search results for today + tomorrow (cache NOT allowed — real-time only)
- Or: use Dates & Deals (`distinct_start_dates=1`, `startdate_start=today`, `startdate_end=tomorrow`) for a lightweight "does this trip have slots today/tomorrow?" check first, then Check Availability on demand when customer hovers/expands

---

### 10. `/departures` — Departures Page

| | |
|---|---|
| **Files** | `app/departures/page.tsx`, `app/departures/departures-client.tsx` |
| **Data source** | 🗄️ DB (trip list + departure locations) |

**Current state:**
- Trip list fetched from DB server-side ✅
- Shows departure **locations** (cities/points) from DB ✅
- Shows "Next departure" label and "Check availability" link
- Does NOT show actual departure times — this is acceptable as a links-out page

**Issues:**
- The "Next departure" timestamp is not populated with real data — it shows a static label
- **Fix**: If we want live "next departure" times, call Dates & Deals with `startdate_start=today` and show the first `start_time` returned

---

### 11. `/emergency` — Emergency Page — Palisis Link

| | |
|---|---|
| **File** | `app/emergency/page.tsx` |
| **Data source** | Static — links to Palisis platform |

```js
{ label: "Manage Booking (Palisis)", href: "https://sightseeingluxembourg.palisis.com", external: true }
```

✅ Correct — this is just an external link for customers to manage their bookings directly on the Palisis platform. No API call. No issues.

---

### 12. `/app/layout.tsx` — Preconnect Header

| | |
|---|---|
| **File** | `app/layout.tsx` |

```html
<link rel="preconnect" href="https://sightseeingluxembourg.palisis.com" />
```

✅ Correct — performance hint for the booking iframes. No API call.

---

## lib/tourcms.ts — Client Status

| Method | Endpoint | Status |
|---|---|---|
| `pingTourCMS()` | `/api/rate_limit_status.xml` | ✅ Correct |
| `showChannel()` | `/c/channel/show.xml` | ✅ Correct |
| `searchTours()` | `/c/tours/search.xml` | ⚠️ Customer-facing only — NOT for import |
| `showTour()` | `/c/tour/show.xml` | ✅ Correct |
| `showTourDatesAndDeals()` | `/c/tour/datesprices/datesndeals/search.xml` | ✅ Correct |
| `searchRawDepartures()` | `/c/tour/datesprices/dep/manage/search.xml` | ❌ Tour Operator Only — remove or gate |
| `showBooking()` | `/c/booking/show.xml` | ✅ Correct |
| `createBooking()` | `/c/booking/new/v1.xml` | ❌ WRONG — this path doesn't exist. Use `/c/booking/new/start.xml` + `/c/booking/new/commit.xml` |
| `listTours()` | `/p/tours/list.xml` | ❌ MISSING — needed for importer |
| `checkAvailability()` | `/c/tour/datesprices/checkavail.xml` | ❌ MISSING — needed for timeslots |
| `startNewBooking()` | `/c/booking/new/start.xml` | ❌ MISSING — needed for booking |
| `commitNewBooking()` | `/c/booking/new/commit.xml` | ❌ MISSING — needed for booking |

**Also: SIGNING BUG** — The string-to-sign must NOT have a leading slash on the path.
Current code: `` `${channelId}/${marketplaceId}/${verb}/${timestamp}/${path}` ``
When `path` = `/c/tour/show.xml?id=1`, this produces a double-slash: `.../{timestamp}//c/tour/show.xml?id=1`
The TourCMS docs example: `3930/0/GET/1769160491/c/tour/show.xml?id=1` — no leading slash.
**Fix**: strip leading slash from `path` before building `stringToSign`.

---

## Summary: What Uses Mock/Dummy Data

| Location | Mock data type | Real endpoint to use |
|---|---|---|
| `app/search/search-content.tsx` | `getDummyDepartures()` — fake today/tomorrow timeslots | `GET /c/tour/datesprices/checkavail.xml` |
| `app/trip/[id]/trip-detail-view.tsx` | Hardcoded booking iframe URL | Store `tour_url` from Show Tour in DB; use `trip.palisis_book_url` |
| `app/checkout/page.tsx` | Hardcoded booking iframe URL | Same as above |
| `app/planner/page.tsx` | Hardcoded booking iframe URL | Same as above |

---

## Summary: Priority Fix List

| Priority | Issue | File | Fix |
|---|---|---|---|
| 🔴 Critical | Signing bug — double slash in string-to-sign | `lib/tourcms.ts` | Strip leading `/` from path before signing |
| 🔴 Critical | Import uses wrong endpoint (`searchTours` not `listTours`) | `app/api/admin/palisis-import/route.ts` | Switch to `listTours()` + per-tour `showTour()` |
| 🔴 Critical | `createBooking()` uses non-existent `/new/v1` path | `lib/tourcms.ts` | Replace with `startNewBooking()` + `commitNewBooking()` |
| 🟠 High | `searchRawDepartures()` is Tour Operator Only — we may not have access | `lib/tourcms.ts` | Remove or clearly gate with warning |
| 🟠 High | `listTours()` missing | `lib/tourcms.ts` | Add method |
| 🟠 High | `checkAvailability()` missing | `lib/tourcms.ts` | Add method |
| 🟠 High | `startNewBooking()` / `commitNewBooking()` missing | `lib/tourcms.ts` | Add methods |
| 🟡 Medium | Hardcoded booking iframe URLs on 3 pages | trip-detail, checkout, planner | Store `tour_url`/`book_url` in DB during import |
| 🟡 Medium | Search page shows dummy departure timeslots | `search-content.tsx` | Replace with Check Availability API call |
| 🟡 Medium | Import doesn't call Show Tour for full detail | `palisis-import/route.ts` | Add Show Tour per-tour call |
| 🟡 Medium | Import doesn't use `descriptions_last_updated` for incremental sync | `palisis-import/route.ts` | Add incremental sync logic |
| 🟢 Low | Webhook event names/payload schema unconfirmed | `webhooks/palisis/route.ts` | Confirm with TourCMS and update |
| 🟢 Low | Webhook `availability.updated` handler trusts payload — should re-fetch | `webhooks/palisis/route.ts` | Re-fetch from Show Tour instead |
