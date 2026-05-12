# Palisis / TourCMS Integration Analysis — sightseeing.lu

> **Last updated**: May 2026 (post-import-fix, post-signing-fix)
> **Purpose**: Complete map of every Palisis/TourCMS touchpoint on the site (admin + frontend),
> with a clear note of **what each integration is doing**, accuracy vs. the API reference,
> mock data flags, and the recommended fix.
>
> **Companion docs:**
> - `docs/tourcms-api-reference.md` — active endpoints and how to use them
> - `docs/tourcms-unused-endpoints.md` — endpoints we deliberately do NOT use

---

## The One Rule

> **The ONLY thing our site writes to TourCMS is a booking.**
> Everything else is read-only. No tour edits. No departure changes. No booking updates or
> cancellations. No customer modifications. The hardcoded contract for each integration
> below makes this explicit in the "What it does" line.

---

## Data-source legend

| Icon | Meaning |
|---|---|
| 🗄️ **DB-READ** | Data served from our PostgreSQL database — no TourCMS call |
| 📡 **TC-READ** | Live read-only call to TourCMS (does NOT modify TourCMS) |
| ✍️ **TC-WRITE** | Creates a booking on TourCMS (the ONE allowed write) |
| 🔗 **IFRAME** | Customer-facing iframe — booking happens on Palisis platform itself |
| 🌐 **EXT-LINK** | Plain external link to Palisis — no API |
| ❌ **MOCK** | Currently using fake/dummy data — needs to be replaced |
| ⚙️ **CONFIG** | Reads/stores credentials in our DB — never touches TourCMS |

---

# Part 1 — Admin Panel

### A1. `/admin/integrations` — Credentials Form
| | |
|---|---|
| **Files** | `app/admin/integrations/page.tsx`, `app/api/admin/integrations/route.ts` |
| **What it does** | ⚙️ **CONFIG** — Stores the `palisis` API key, `palisisChannelId`, `palisisMarketplaceId` in our `integrations` DB table |
| **Touches TourCMS?** | NO — pure DB write to our own `integrations` table |
| **Status** | ✅ Correct |
| **Notes** | When admin clicks "Test", it triggers A2 below |

---

### A2. `GET /api/admin/test-key?service=palisis` — Connectivity Test
| | |
|---|---|
| **Files** | `app/api/admin/test-key/route.ts` |
| **What it does** | 📡 **TC-READ** — Calls `GET /api/rate_limit_status.xml` to verify the API key works |
| **API used** | `pingTourCMS()` → `/api/rate_limit_status.xml` (channelId=0) |
| **Vs. reference** | ✅ Matches `tourcms-api-reference §4.1` exactly. Endpoint does NOT count against rate limits. |
| **Touches TourCMS?** | Read-only |
| **Status** | ✅ Correct |
| **Minor issue** | Falls back to a string-length sanity check if `TOURCMS_CHANNEL_ID` env var is missing. This is an acceptable degradation, but the admin UI should warn that "real connectivity test requires Channel ID configured first." |

---

### A3. `POST /api/admin/palisis-import` — Tour Catalog Import
| | |
|---|---|
| **Files** | `app/api/admin/palisis-import/route.ts` |
| **What it does** | 📡 **TC-READ** → 🗄️ **DB-WRITE** — Pulls tour catalog from TourCMS, upserts into our `trips` table |
| **API used** | `listTours()` → `/p/tours/list.xml` (channelId=0, paginated 200/page), then per-tour `showTour()` → `/c/tour/show.xml` |
| **Vs. reference** | ✅ Matches `tourcms-api-reference §5.1` + `§5.2`. Uses lean list + per-tour detail pattern as recommended. |
| **Touches TourCMS?** | Read-only |
| **Status** | ✅ Correct (post-fix) |
| **Recently fixed** | Was using wrong endpoint (`searchTours`/`/c/tours/search.xml`) — switched to `listTours`/`/p/tours/list.xml`. Pagination added. Per-tour `channel_id` now passed to `showTour`. `book_url` stored in `trips.permalink`. |
| **Future improvement** | Use `descriptions_last_updated` for incremental sync (requires a new DB column to store the timestamp per trip). Currently does title/description string diff. |

---

### A4. `POST /api/admin/palisis-availability` — Admin Availability Preview
| | |
|---|---|
| **Files** | `app/api/admin/palisis-availability/route.ts`, `app/admin/palisis/page.tsx` |
| **What it does** | 📡 **TC-READ** — Fetches 7-day availability slots for all synced trips, for admin to see what's available without leaving the panel |
| **API used** | `showDatesAndDeals()` → `/c/tour/datesprices/datesndeals/search.xml` |
| **Vs. reference** | ✅ Matches `tourcms-api-reference §6.1`. Correct endpoint for an admin overview (cached 30 min, not real-time). |
| **Touches TourCMS?** | Read-only |
| **Status** | ✅ Correct |
| **Critical clarification** | This data is **for admin viewing only**. The frontend must NEVER use this for customer slot selection — customer-facing slot UI must call **Check Availability** (real-time, never cached). |
| **Minor issue** | Calls `showDatesAndDeals()` without passing per-trip `channel_id`. Single-channel accounts work fine; multi-channel marketplace agents would need to pass `tour.channel_id` (currently we don't store it per trip — see A3 future improvement). |

---

### A5. `POST /api/webhooks/palisis` — Inbound Webhooks from TourCMS
| | |
|---|---|
| **Files** | `app/api/webhooks/palisis/route.ts` |
| **What it does** | 📡 **TC-INBOUND** → 🗄️ **DB-WRITE** — Receives push events from TourCMS; updates our DB to keep data in sync |
| **Touches TourCMS?** | NO — TourCMS calls us; we only read the payload |
| **Status** | ⚠️ Partial — works, but field name and signature spec unconfirmed |
| **Bug** | Line 28 looks up trips by `t.palisisId` but `dbListTrips()` returns snake_case `palisis_id`. The lookup `t.palisisId === payload.externalId` is always `undefined === ...` → never matches. **Fix**: change to `t.palisis_id`. |
| **Open questions** | (1) Confirm exact event names with TourCMS — current code assumes `availability.updated` / `booking.confirmed` / `booking.cancelled`. (2) Confirm signature method — current code checks plain `x-palisis-secret` header; TourCMS likely uses HMAC-SHA256. (3) `availability.updated` handler trusts the webhook payload to update DB fields directly — should instead re-fetch via `showTour()` to avoid trusting unverified data. |

---

### A6. `/admin/palisis` — Admin Palisis Dashboard
| | |
|---|---|
| **Files** | `app/admin/palisis/page.tsx` |
| **What it does** | UI shell that triggers A3 (Import) and A4 (Availability) buttons |
| **Touches TourCMS?** | Indirectly via A3/A4 |
| **Status** | ⚠️ Stale UI copy |
| **Issue** | Line 77 still shows the banner *"Currently using mock data — configure your Palisis API key..."*. This is no longer accurate — once credentials are set, the import is fully live. **Fix**: change the banner to detect whether credentials exist (check `getTourCMSClient()` returns non-null), and only show the warning when not configured. |

---

### A7. `/admin/implementation` — Implementation Tracker
| | |
|---|---|
| **Files** | `app/admin/implementation/page.tsx` |
| **What it does** | 🗄️ **DB-READ** — Static documentation page; reads task status from local config and lib/tourcms.ts |
| **Touches TourCMS?** | NO |
| **Status** | ✅ Correct (recently updated to reflect new method signatures) |

---

# Part 2 — Frontend (Public Site)

### F1. `/trip/[id]` — Trip Detail Page (Content)
| | |
|---|---|
| **Files** | `app/trip/[id]/page.tsx`, `app/trip/[id]/trip-detail-view.tsx` |
| **What it does** | 🗄️ **DB-READ** — Trip title, description, price, images, gallery, highlights all served from our DB via `dbGetTrip()` |
| **Touches TourCMS?** | NO for the content. (See F2 for the booking widget.) |
| **Status** | ✅ Correct — meets the "tours displayed from DB only, never live from Palisis" requirement |
| **User requirement met?** | ✅ YES — imported trips are served from our DB, not fetched live from TourCMS per request |

---

### F2. `/trip/[id]` — Booking Iframe
| | |
|---|---|
| **Files** | `app/trip/[id]/trip-detail-view.tsx` line 304 |
| **What it does** | 🔗 **IFRAME** — Embeds Palisis booking widget; booking is created on Palisis platform |
| **Touches TourCMS?** | Indirectly (customer interacts with Palisis directly inside the iframe) |
| **Status** | ❌ Hardcoded URL bug |
| **Bug** | `src="https://sightseeingluxembourg.palisis.com/?book-direct=r-8146"` — every trip iframe shows the SAME product (`r-8146`), regardless of which trip the user is viewing |
| **Fix available NOW** | The import (A3) already stores the per-tour `book_url` in `trips.permalink`. Change the iframe to: `src={trip.permalink ?? "https://sightseeingluxembourg.palisis.com/"}` |
| **Eventually replace with** | Native booking flow using `checkAvailability` → `startNewBooking` → `commitNewBooking` (the only ✍️ TC-WRITE call in the whole site) |

---

### F3. `/checkout` — Checkout Page Booking Iframe
| | |
|---|---|
| **Files** | `app/checkout/page.tsx` line 354 |
| **What it does** | 🔗 **IFRAME** — Same Palisis booking widget |
| **Status** | ❌ Same hardcoded `r-8146` bug as F2 |
| **Fix** | Same — read `item.trip.permalink` from cart items and use it as iframe `src` |

---

### F4. `/planner` — AI Planner Booking Iframe
| | |
|---|---|
| **Files** | `app/planner/page.tsx` line 923 |
| **What it does** | 🔗 **IFRAME** — Same Palisis booking widget after AI recommends trips |
| **Status** | ❌ Same hardcoded `r-8146` bug as F2 |
| **Fix** | Same — read `selectedTrip.permalink` and use it as iframe `src` |

---

### F5. `/explore` — Explore Page (Trip Grid)
| | |
|---|---|
| **Files** | `app/explore/page.tsx`, `app/explore/explore-client.tsx` |
| **What it does** | 🗄️ **DB-READ** — Server component fetches `dbListTrips()` and passes to client as `initialTrips` prop |
| **Touches TourCMS?** | NO |
| **Status** | ✅ Correct — meets DB-only requirement |

---

### F6. `/departures` — Departures Page
| | |
|---|---|
| **Files** | `app/departures/page.tsx`, `app/departures/departures-client.tsx` |
| **What it does** | 🗄️ **DB-READ** — Lists trips and their pickup/departure locations from our DB |
| **Touches TourCMS?** | NO |
| **Status** | ✅ Correct (no actual departure times shown — just locations and "Check availability" links) |
| **Future enhancement** | If we want live "next departure at HH:MM" labels, call `showDatesAndDeals` (`startdate_start=today`) and show first `start_time`. Cache 30 min. |

---

### F7. `/search` — Search Results Timeslots
| | |
|---|---|
| **Files** | `app/search/search-content.tsx` lines 42-59, 174 |
| **What it does** | 🗄️ **DB-READ** for trip cards + ❌ **MOCK** for "today" / "tomorrow" timeslot buttons |
| **Touches TourCMS?** | NO (this is the bug — should be) |
| **Status** | ❌ MOCK DATA |
| **Mock function** | `getDummyDepartures(tripId)` — generates fake timeslot times based on a hash of the trip ID |
| **Recommended replacement** | Two-tier strategy from `tourcms-api-reference §9.1`: **Option A** for the search results page — call `showDatesAndDeals` once per visible trip with `startdate_start=today, startdate_end=tomorrow, distinct_start_dates=1`. Cheap, cacheable 30 min, returns "does this trip have any slot today/tomorrow + from-price". **Option B** when user clicks a trip card to expand — call `checkAvailability` for the actual bookable slots (NEVER cache). Do NOT call `checkAvailability` for every trip on initial render — that would be 43 live API calls per page load. |

---

### F8. `/emergency` — Booking Management Link
| | |
|---|---|
| **Files** | `app/emergency/page.tsx` line 209 |
| **What it does** | 🌐 **EXT-LINK** — `<a href="https://sightseeingluxembourg.palisis.com">` Manage Booking |
| **Touches TourCMS?** | NO — plain external link |
| **Status** | ✅ Correct — customers manage their bookings on Palisis directly, as designed |

---

### F9. `/app/layout.tsx` — Preconnect Hint
| | |
|---|---|
| **Files** | `app/layout.tsx` line 78 |
| **What it does** | `<link rel="preconnect" href="https://sightseeingluxembourg.palisis.com">` — performance hint for the booking iframes |
| **Touches TourCMS?** | NO |
| **Status** | ✅ Correct |

---

# Part 3 — `lib/tourcms.ts` Method Coverage

| Method | Endpoint | Used by | Status |
|---|---|---|---|
| `pingTourCMS()` | `/api/rate_limit_status.xml` | A2 (test-key) | ✅ |
| `showChannel()` | `/c/channel/show.xml` | (available, not currently called) | ✅ |
| `listTours()` | `/p/tours/list.xml` | A3 (import) | ✅ NEW |
| `searchTours()` | `/c/tours/search.xml` | (available — keep for customer-facing keyword search) | ✅ |
| `showTour()` | `/c/tour/show.xml` | A3 (import per-tour detail) | ✅ |
| `showDatesAndDeals()` | `/c/tour/datesprices/datesndeals/search.xml` | A4 (admin preview) | ✅ |
| `checkAvailability()` | `/c/tour/datesprices/checkavail.xml` | (NOT YET WIRED — F7 mock should call this) | ✅ NEW |
| `searchRawDepartures()` | `/c/tour/datesprices/dep/manage/search.xml` | (Tour Operator Only — may FAIL_TOUROPONLY) | ⚠️ Available but gated |
| `startNewBooking()` | `/c/booking/new/start.xml` | (NOT YET WIRED — needed for native booking flow) | ✅ NEW |
| `commitNewBooking()` | `/c/booking/new/commit.xml` | (NOT YET WIRED — needed for native booking flow) | ✅ NEW |
| `showBooking()` | `/c/booking/show.xml` | (available, not currently called) | ✅ |

---

# Part 4 — Mock Data Inventory

The complete list of every mock/placeholder Palisis touchpoint and the API endpoint that should replace it.

| # | Location | Mock | What to use instead | Priority |
|---|---|---|---|---|
| 1 | `app/search/search-content.tsx` line 42-59 (`getDummyDepartures`) | Fake today/tomorrow timeslots | `showDatesAndDeals` (Option A from `tourcms-api-reference §9.1`) for the cards; `checkAvailability` on demand | 🟠 High |
| 2 | `app/trip/[id]/trip-detail-view.tsx` line 304 | Hardcoded iframe `?book-direct=r-8146` | Use `trip.permalink` already stored by import (A3) | 🔴 Critical |
| 3 | `app/checkout/page.tsx` line 354 | Same hardcoded iframe | Use `item.trip.permalink` | 🔴 Critical |
| 4 | `app/planner/page.tsx` line 923 | Same hardcoded iframe | Use selected `trip.permalink` | 🔴 Critical |
| 5 | `app/admin/palisis/page.tsx` line 77 | Banner text "Currently using mock data" | Detect `tourcms` client availability and only show warning when not configured | 🟡 Medium |
| 6 | `app/api/webhooks/palisis/route.ts` line 30 | Looks up `t.palisisId` (camelCase, undefined) | Change to `t.palisis_id` to match DB column | 🟠 High |

Notes:
- The `r-8146` iframe URL is the single biggest mock — fixing that one + items 3-4 will make every booking on the site go to the correct product. The data needed is already in the DB (`trips.permalink`).
- Item 1 (search timeslots) is the only place using fully synthesized data — everywhere else is either real DB data or live TourCMS calls.

---

# Part 5 — Verification: "Tours from DB Only" Requirement

> **Original requirement**: "Tours imported into our DB, displayed from DB only — not directly from Palisis on the front-end."

Every public page that shows tours:

| Page | Source | Verified |
|---|---|---|
| `/explore` | `dbListTrips()` server-side | ✅ |
| `/trip/[id]` | `dbGetTrip()` server-side | ✅ |
| `/departures` | `dbListTrips()` server-side | ✅ |
| `/search` | `dbListTrips()` server-side (timeslots are mock — NOT live from Palisis) | ✅ for tours; ❌ for timeslots (mock, not live-from-Palisis-but-also-not-from-DB) |
| `/blog` etc. | DB | ✅ (not Palisis-related) |

**No public page calls `tourcms.*` client methods at request time.** All TourCMS read calls are confined to admin endpoints (A3, A4) and the test-key route (A2). The booking iframes (F2, F3, F4) load Palisis HTML in a sandboxed iframe — that's the customer interacting with Palisis directly, not our server proxying.

✅ **Requirement is met.** Tours come exclusively from our DB on the public site.

---

# Part 6 — Priority Fix List (Post-Recent-Fixes)

| # | Priority | Issue | File | Fix |
|---|---|---|---|---|
| 1 | 🔴 Critical | Hardcoded booking iframe URL on 3 public pages — every trip books `r-8146` | `trip-detail-view.tsx:304`, `checkout/page.tsx:354`, `planner/page.tsx:923` | `src={trip.permalink ?? FALLBACK}` (data is already in DB) |
| 2 | 🟠 High | Webhook lookup uses camelCase `palisisId` but DB returns snake_case `palisis_id` — webhooks never match a trip | `webhooks/palisis/route.ts:30` | Change to `t.palisis_id` |
| 3 | 🟠 High | Search page shows mocked today/tomorrow timeslots | `search-content.tsx:42-59,174` | Replace `getDummyDepartures` with `showDatesAndDeals` (Option A) + `checkAvailability` on expand |
| 4 | 🟡 Medium | Admin Palisis dashboard still shows stale "mock data" banner | `app/admin/palisis/page.tsx:77` | Conditionally render based on credentials presence |
| 5 | 🟡 Medium | Native booking flow (T016) not yet wired — site relies entirely on iframe | new file `app/api/book/route.ts` | Build POST endpoint that calls `checkAvailability` → `startNewBooking` → `commitNewBooking` |
| 6 | 🟢 Low | Per-trip `channel_id` not stored in DB — multi-channel marketplace would need it | `trips` table schema | Add `palisis_channel_id` column; update `palisis-import` to populate it |
| 7 | 🟢 Low | Webhook event names + signature method unconfirmed | `webhooks/palisis/route.ts` | Confirm with TourCMS support; switch to HMAC if needed |
| 8 | 🟢 Low | Webhook `availability.updated` handler trusts payload directly | `webhooks/palisis/route.ts:32-34` | Re-fetch from `showTour()` instead of trusting payload |

---

# Appendix — Touchpoints That Are NOT Issues

These are intentional and should NOT be changed:

| Touchpoint | Why it's correct |
|---|---|
| External "Manage Booking" link on `/emergency` | Customers manage bookings on Palisis itself — that's the model |
| `<link rel="preconnect">` to palisis.com in root layout | Performance hint, no API contract |
| Booking via iframe (until native booking flow is built) | Iframe is the agreed interim — booking still happens on Palisis platform |
| Tours rendered from DB instead of live API on every public page | This is the explicit requirement — DB is the source of truth for display |
| Admin import button writes to OUR DB, not to TourCMS | Correct — we never write tours back to TourCMS |
