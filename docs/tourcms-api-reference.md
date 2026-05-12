# TourCMS API — Active Reference for sightseeing.lu

> **Scope**: Only the endpoints we actually use (or will use) on sightseeing.lu.
> **Our role**: Marketplace Agent (not Tour Operator). Marketplace ID = our Agent ID (from TourCMS welcome email).
> **Unused endpoints**: see `docs/tourcms-unused-endpoints.md`.
> **Base URL**: `https://api.tourcms.com`
> **Format**: All requests and responses are XML.
> **Implementation**: `lib/tourcms.ts` — custom HMAC-SHA256 native fetch client.

---

## CRITICAL: What We Do and Do NOT Do on TourCMS

| Action | Do on TourCMS from our site? | Endpoint |
|---|---|---|
| Import tour catalog to our DB | YES (read-only) | `GET /p/tours/list.xml` + `GET /c/tour/show.xml` |
| Display tours on website | NO — serve from our DB | DB only |
| Show available dates (calendar) | YES (read TourCMS) | `GET /c/tour/datesprices/datesndeals/search.xml` |
| Show time slots on a date | YES (read TourCMS) | `GET /c/tour/datesprices/checkavail.xml` |
| Create a booking | YES (write to TourCMS) | `POST /c/booking/new/start.xml` then `POST /c/booking/new/commit.xml` |
| Edit / delete tours on TourCMS | **NEVER** | — |
| Edit / delete departures on TourCMS | **NEVER** | — |
| Cancel bookings on TourCMS | **NEVER** from our site | — |
| Update anything on TourCMS | **NEVER** (except booking creation) | — |

---

## 1. Authentication

Every request must include these headers:

```
x-tourcms-date: {unix_timestamp}
Authorization: TourCMS {channelId}:{marketplaceId}:{url_encoded_base64_signature}
Content-type: application/xml   (POST requests only)
```

### Signature generation (HMAC-SHA256)

```
string_to_sign = "{channelId}/{marketplaceId}/{VERB}/{timestamp}/{path_with_querystring}"
```

**Critical rules:**
- `path_with_querystring` must have **NO leading slash** (e.g. `c/tour/show.xml?id=1`, not `/c/tour/show.xml?id=1`)
- `VERB` must be uppercase (`GET` or `POST`)
- `timestamp` = Unix seconds (must match the `x-tourcms-date` header exactly)
- Sign: `HMAC-SHA256(apiKey, string_to_sign)` → base64 → **URL-encode** the base64 string

```
Example string to sign:
  3930/7654/GET/1769160491/c/tour/show.xml?id=1

Example Authorization header:
  TourCMS 3930:7654:Q9d6Iq2hI5uX%2FE3vZ%2B53%2FCbPCog%3D
```

### Channel ID rules

| Call type | channelId in header | channelId in signature |
|---|---|---|
| `/c/` endpoint (single channel) | Your operator's channel ID | Same |
| `/p/` endpoint (cross-channel, Marketplace Agent only) | `0` | `0` |

### Credentials stored in our system

| Secret | Where |
|---|---|
| `TOURCMS_API_KEY` | Replit Secrets → env var (primary) |
| `TOURCMS_CHANNEL_ID` | Replit Secrets → env var (primary) |
| `TOURCMS_MARKETPLACE_ID` | Replit Secrets → env var (your Marketplace Agent ID) |
| Fallback | DB `integrations` table keys: `palisis`, `palisisChannelId`, `palisisMarketplaceId` |

---

## 2. Caching Rules

| Endpoint | Cache |
|---|---|
| List Tours | 30 min (but `descriptions_last_updated` field drives incremental sync) |
| Show Tour | 60 min |
| Dates & Deals | 30 min |
| Check Availability | **NEVER cache** — must be real-time |
| Start/Commit Booking | **NEVER cache** |

---

## 3. Error Codes

| Code | Meaning |
|---|---|
| `OK` | Success |
| `NO MATCHING DATA` | No match, or account not upgraded |
| `FAIL_SIG` | Signature mismatch — check Channel ID and path signing |
| `FAIL_PERM` | No permission for this action |
| `FAIL_TOUROPONLY` | Endpoint requires Tour Operator — not available to us as Agent |
| `FAIL_KEYNOTFOUND` | API key invalid |
| `FAIL_PARTNERSONLY` | `/p/` endpoint called without Agent credentials (use channelId=0) |
| `FAIL_TIME` | Clock skew >15 min — check server time |
| `FAIL_VERB` | Wrong HTTP method |

---

## 4. Housekeeping

### 4.1 Rate Limit Status / Connectivity Test

```
GET /api/rate_limit_status.xml
channelId: 0 (for agents)
```

Does NOT count against rate limits. Use for credential testing.

**Response fields:**
- `remaining_hits` — GET requests remaining this hour
- `remaining_hits_post` — POST requests remaining this hour
- `hourly_limit`, `hourly_limit_post` — limits (default 2000 each)

**In lib/tourcms.ts**: `pingTourCMS(config)`

---

## 5. Tours — Import Flow

> We are a Marketplace Agent. The correct import endpoint is `/p/tours/list.xml` (cross-channel),
> NOT `/c/tours/search.xml` (which is for customer-facing search only).

### 5.1 List Tours — The Import Endpoint ⭐

```
GET /p/tours/list.xml
channelId: 0  (cross-channel, Marketplace Agent)
```

Returns a lean list of every tour available to us. Use for:
- Initial import (all tours)
- Incremental sync (check `descriptions_last_updated` per tour)

**Key querystring params:**
- `booking_style=booking` — only tours that take confirmed bookings (excludes Enquiry-only tours)

**Key response fields per `<tour>`:**
- `channel_id` — which channel this tour belongs to (pass to `Show Tour`)
- `tour_id` — tour ID (unique within a channel)
- `tour_name` — short name
- `has_sale` — `1` = has future bookable dates; `0` = no future dates (import anyway — show as "Coming soon")
- `descriptions_last_updated` — YYYY-MM-DD; **only call Show Tour when this changes** (incremental sync key)
- `delivery_formats` — `QR_CODE`, `PDF_URL`, `HTML`, `CODE128`

**Importer pattern:**
```ts
// 1. One call gets all tours across all connected channels
const list = await listTours(config)  // GET /p/tours/list.xml, channelId=0

// 2. For each tour, only fetch full detail when descriptions changed
for (const t of list.tours) {
  const stored = await db.getTrip({ palisis_id: t.tour_id, channel_id: t.channel_id })
  if (stored?.descriptions_last_updated === t.descriptions_last_updated) {
    // Just update has_sale + lightweight meta — skip expensive Show Tour call
    continue
  }
  // 3. Full detail fetch (costs 1 API call per tour)
  const full = await showTour(config, t.tour_id, { show_options: "1" })
  await db.upsertTrip(full.tour)
}
```

**In lib/tourcms.ts**: `listTours(config, params?)`

---

### 5.2 Show Tour — Full Detail

```
GET /c/tour/show.xml?id={tour_id}&show_options=1
channelId: the tour's channel_id (from List Tours)
Cache: 60 min
```

Use after List Tours to get full tour data for DB storage, and before booking to get rate IDs.

**Key querystring params:**
- `id` — tour ID (required)
- `show_options=1` — include bookable add-ons
- `show_questions=1` — include booking questions (use before building booking form)

**Key response fields in `<tour>`:**
- `tour_name`, `tour_name_long`
- `summary`, `shortdesc`, `longdesc`, `itinerary`
- `from_price`, `from_price_display`, `sale_currency`
- `start_time` — could be `"09:00"` (fixed), `"MULTI"` (multiple times per day), or blank
- `images` → `image` → `url`, `url_thumbnail`, `url_large`
- `geocode_start_point` → `geocode` (lat/long as "lat,long" string)
- `duration`, `duration_desc`
- `descriptions_last_updated` — store this for incremental sync
- `new_booking.people_selection` → `rate` items with `rate_id`, `label_1`, `minimum`, `maximum`, `from_price` — **needed to build booking form**
- `has_sale` — current salability
- `tour_url` — link to TourCMS tour page (useful for iframe booking)

**In lib/tourcms.ts**: `showTour(config, tourId, params?)`

---

## 6. Availability Flow

### 6.1 Dates & Deals — Calendar (Which dates are bookable)

```
GET /c/tour/datesprices/datesndeals/search.xml?id={tour_id}&distinct_start_dates=1
                                               &startdate_start=2026-06-01
                                               &startdate_end=2026-08-31
channelId: the tour's channel_id
Cache: 30 min
```

Use to populate a date-picker BEFORE the customer selects a date. Cheap — one call per month view.

**Key querystring params:**
- `id` — tour ID (required)
- `startdate_start` + `startdate_end` — date range (YYYY-MM-DD; supply both or neither)
- `distinct_start_dates=1` — one entry per date (use for calendar; omit for list)
- `start_time` — HH:MM filter (for 24h format)
- `has_offer` — blank=all, `all`=only with offers, `1`/`2`/`3`/`4` for specific types

**Key response fields per `<date>` in `<dates_and_prices>`:**
- `start_date`, `end_date`, `start_time`, `end_time`
- `price_1`, `price_1_display` — from-price
- `spaces_remaining` — remaining capacity (can be `"UNLIMITED"` — string-check, don't parseInt)
- `special_offer_type` — `0`=no offer, `1/2/3/4`=offer type
- `original_price_1_display` — original price when there's an offer
- `status` — `"OPEN"` when available

**In lib/tourcms.ts**: `showTourDatesAndDeals(config, tourId, params?)`

---

### 6.2 Check Tour Availability — Real-Time Timeslots ⭐

```
GET /c/tour/datesprices/checkavail.xml?id={tour_id}&date=2026-06-15&r1=2
channelId: the tour's channel_id
Cache: NEVER CACHE — real-time only
```

Use when the customer has selected a date. Returns actual timeslots with `component_key` (needed for booking).

**Key querystring params:**
- `id` — tour ID (required)
- `date` — YYYY-MM-DD the customer selected
- `r1`, `r2`, `r3` — rate quantities: `r{rate_id}={quantity}` (rate IDs come from Show Tour `new_booking.people_selection`)
- `start_time` — HH:MM to filter to a specific timeslot
- `show_pickups=0` — suppress pickup list if not needed

**Key response fields per `<component>` in `<available_components>`:**
- `start_time`, `end_time` — timeslot times
- `start_time_utcseconds` — sort by this (timezone-safe)
- `date_code` — e.g. `"AM"`, `"PM"`, or language (`"EN"`, `"FR"`)
- `spaces_remaining` — per timeslot (can be `"UNLIMITED"`)
- `total_price`, `total_price_display` — final calculated price for the requested quantities
- `net_price` — what we (as agent) will be invoiced
- **`component_key`** — STORE THIS. Pass to Start New Booking. Price is locked for `component_key_valid_for` seconds (usually 1800 = 30 min)
- `questions` → `q` — booking questions to show the customer (get `question_key` for booking form)
- `pickup_points` → `pickup` — pickup options per timeslot

**Important rendering rules:**
- One `<component>` = one timeslot button/card in the UI
- Sort by `start_time_utcseconds`, not `start_time`
- `spaces_remaining` can be `"UNLIMITED"` — do not parseInt blindly
- `component_key` expires — must re-call Check Availability after `component_key_valid_for` seconds
- If `start_time` on the tour is `"MULTI"`, Check Availability is the only place you get the actual list of times

**In lib/tourcms.ts**: `checkAvailability(config, tourId, params?)`

---

## 7. Booking Flow (Marketplace Agent — 2 steps, no booking key required)

We are a Marketplace Agent. We do NOT call `Get Booking Key` — that is Tour Operator only.

### Step 1: Start New Booking

```
POST /c/booking/new/start.xml
channelId: the tour's channel_id
```

Creates a temporary booking that holds stock for `hold_time_seconds` (default 2700s / 45 min).

**POST body (minimum):**
```xml
<?xml version="1.0"?>
<booking>
  <total_customers>2</total_customers>
  <components>
    <component>
      <component_key>COMPONENT_KEY_FROM_CHECK_AVAIL</component_key>
      <!-- Optional: pickup, questions, options -->
      <replies>
        <reply>
          <question_key>Q_KEY_FROM_CHECK_AVAIL</question_key>
          <answers><answer><answer_value>Customer answer</answer_value></answer></answers>
        </reply>
      </replies>
    </component>
  </components>
  <customers>
    <customer>
      <firstname>Jane</firstname>
      <surname>Smith</surname>
      <email>jane@example.com</email>
    </customer>
  </customers>
</booking>
```

**Key response fields in `<booking>`:**
- `booking_id` — STORE THIS. Needed for Commit and Show Booking
- `hold_time_seconds` — how long the stock is held (default 2700)
- `sales_revenue_due_now`, `sales_revenue_due_now_display` — amount to charge customer now
- `sales_price_due_ever`, `sales_price_due_ever_display` — max chargeable amount
- `sale_currency`
- `available_component_count` / `unavailable_component_count` — check that all components were available
- `commission`, `commission_display` — our agent commission

**Error cases:**
- `SUPPLIER_SUBSYSTEM_ERROR` — also check `supplier_subsystem_message`
- `unavailable_component_count > 0` — some slots were sold out between Check Availability and Start — re-show Check Availability to customer

**In lib/tourcms.ts**: `startNewBooking(config, channelId, bookingXml)`

---

### Step 2: Commit New Booking

```
POST /c/booking/new/commit.xml
channelId: the tour's channel_id
```

Converts the temporary booking to a live booking. Call after payment is confirmed (or immediately if agent-payable).

**POST body:**
```xml
<?xml version="1.0"?>
<booking>
  <booking_id>12345</booking_id>
  <agent_ref>OUR-INTERNAL-REF</agent_ref>
</booking>
```

**Key response fields in `<booking>`:**
- `booking_id`, `booking_uuid`
- `status` — `0`=Quote, `1`=Provisional, `2`=Confirmed
- `status_text`
- `voucher_url` — link to voucher (show on confirmation page)
- `barcode_data`
- Per `<component>`: `component_id`, `start_date`, `start_time`, `tickets` → `ticket`, `urls` → `url` (with `type=voucher`)

**In lib/tourcms.ts**: `commitNewBooking(config, channelId, bookingId, agentRef?)`

---

### 7.1 Show Booking (Post-booking confirmation)

```
GET /c/booking/show.xml?booking_id={id}
channelId: the tour's channel_id
Cache: NEVER
```

Use on the confirmation page or for booking status checks.

**Key response fields:**
- `booking_id`, `booking_uuid`
- `status`, `status_text`
- `voucher_url`, `barcode_data`
- `lead_customer_name`, `lead_customer_email`
- `sale_currency`, `sales_revenue_display`
- Per `<component>`: `start_date`, `start_time`, `component_name`, `rate_description`, `tickets`, `urls`

**In lib/tourcms.ts**: `showBooking(config, channelId, bookingId)`

---

## 8. Show Channel — Verify Credentials + Channel Info

```
GET /c/channel/show.xml
channelId: your configured channel ID
Cache: 120 min
```

Use to verify credentials and read channel branding.

**Key response fields:**
- `channel_id`, `channel_name`, `company_name`
- `home_url`, `logo_url`
- `sale_currency`
- `connection_permission` — `1`=Sell only, `2`=Summary stats, `3`=Full booking details (ask operator for level 3)
- `booking_style` — `BOOKING` (confirmed online), `ENQUIRY`, or `QUOTE`

**In lib/tourcms.ts**: `showChannel(config)`

---

## 9. Two-Stage Availability UI Pattern (Summary)

```
Stage 1: Customer picks a date from calendar
  → Call Dates & Deals with distinct_start_dates=1 for the month
  → Cache 30 min
  → Render bookable dates as enabled, all others as greyed out

Stage 2: Customer selects a date
  → Call Check Availability with the selected date + quantities
  → NEVER CACHE
  → Render each <component> as a timeslot button
  → Store the component_key alongside the selected slot

Stage 3: Customer fills booking form
  → Show questions from Check Availability response
  → Post to our /api/checkout → calls Start New Booking → Commit New Booking

Stage 4: Booking confirmation page
  → Show voucher_url, booking_id from Commit response
  → Optionally call Show Booking for full details
```

---

## 10. Webhook — Inbound from TourCMS

TourCMS can POST events to our endpoint when things change.

**Our endpoint**: `POST /api/webhooks/palisis`

**Register in**: TourCMS → Configuration & Setup → Webhooks

**Event types** (confirm exact names with TourCMS):
- Booking events: booking created/confirmed/cancelled/updated
- Catalog events: tour updated/added/removed

**Signature verification**: TourCMS sends a signature in headers. Update our webhook handler when TourCMS confirms the exact method.

---

## Appendix: lib/tourcms.ts Method Map

| Method | Endpoint | HTTP | channelId |
|---|---|---|---|
| `pingTourCMS(config)` | `/api/rate_limit_status.xml` | GET | 0 |
| `showChannel(config)` | `/c/channel/show.xml` | GET | configured |
| `listTours(config, params?)` | `/p/tours/list.xml` | GET | **0** |
| `showTour(config, tourId, params?)` | `/c/tour/show.xml?id=` | GET | configured |
| `showTourDatesAndDeals(config, tourId, params?)` | `/c/tour/datesprices/datesndeals/search.xml` | GET | configured |
| `checkAvailability(config, tourId, params?)` | `/c/tour/datesprices/checkavail.xml` | GET | configured |
| `startNewBooking(config, channelId, bookingXml)` | `/c/booking/new/start.xml` | POST | per booking |
| `commitNewBooking(config, channelId, bookingId, agentRef?)` | `/c/booking/new/commit.xml` | POST | per booking |
| `showBooking(config, channelId, bookingId)` | `/c/booking/show.xml` | GET | per booking |

> `searchTours()` is kept in lib/tourcms.ts for customer-facing search but is **not used for import**.
> Use `listTours()` for the importer instead.
