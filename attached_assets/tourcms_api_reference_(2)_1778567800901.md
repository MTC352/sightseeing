# TourCMS Marketplace API — Complete Reference

> **Source**: https://www.tourcms.com/support/api/mp/ (compiled May 2026)
> **For**: TourCMS / Palisis integration into a Next.js (TypeScript) project using a custom `lib/tourcms.ts` native fetch client.
> **Format**: XML over REST. All requests/responses are XML.

---

## Table of Contents

0. [Marketplace Partner Integration Guide](#0-marketplace-partner-integration-guide-use-case-mapping) — importer, booking flow, timeslots
1. [Authentication & Connection](#1-authentication--connection)
2. [Caching Guidance](#2-caching-guidance)
3. [Error Messages](#3-error-messages)
4. [Housekeeping](#4-housekeeping) — Rate Limit Status
5. [Channels](#5-channels) — list, show, performance, markup scheme
6. [Tours — General Use](#6-tours--general-use) — search, show, dates & deals, update, locations, product filters, hotel search, booking restrictions, search criteria, tour promotions
7. [Tours — Bulk Export Use](#7-tours--bulk-export-use) — list tours, list images, show departures
8. [Tours — Tour Operator Only](#8-tours--tour-operator-only) — delete tour, upload files, delete image/document, managing dates externally
9. [Bookings](#9-bookings) — creation flow, list, show, update, cancel, components, notes, emails, delete
10. [Payments](#10-payments) — create, Spreedly, list, log fail
11. [Vouchers](#11-vouchers) — search, redeem
12. [Customers & Enquiries](#12-customers--enquiries) — show/update/create/verify customers; create/search/show enquiries; login search; promo show
13. [Agents](#13-agents) — agent profile, agent search/update, remote login
14. [Internal Suppliers & Staff](#14-internal-suppliers--staff) — show supplier, list staff
15. [Pickup Points & Tour Pickup Routes](#15-pickup-points--tour-pickup-routes)
16. [Tour GEO Points & Tour Tiers](#16-tour-geo-points--tour-tiers)
17. [Account Custom Fields & Tour Import](#17-account-custom-fields--tour-import)
18. [Webhooks & Tour Operator vs. Marketplace Agent Notes](#18-notes-on-tour-operator-vs-marketplace-agent)
19. [Implementation Notes for `lib/tourcms.ts` (Next.js, native fetch)](#19-implementation-notes-for-libtourcmsts)

---

## 0. Marketplace Partner Integration Guide (use-case mapping)

This section maps your three real workflows directly to endpoints. **You are a Marketplace Partner (Agent)**, so use `marketplaceId = your-agent-id` in signatures and `Channel ID = 0` for cross-Channel `/p/` calls.

### 0.1 Trip Importer (sync tours to your database)

| Step | Endpoint | Section |
| --- | --- | --- |
| 1. List every tour available to you | `GET /p/tours/list.xml` (Channel ID `0`) | §7.1 |
| 2. For each tour, fetch the full record on first sync OR when `descriptions_last_updated` changes | `GET /c/tour/show.xml?id={tour_id}&show_options=1` | §6.2 |
| 3. (Optional) Pull all bookable dates as a calendar snapshot | `GET /c/tour/datesprices/datesndeals/search.xml?id={tour_id}&distinct_start_dates=1` | §6.3 |
| 4. (Optional) Mirror images | URLs come back inside Show Tour `<images>` (or use `/c/tours/images/list.xml`) | §6.2, §7.2 |

**Incremental-sync key**: `descriptions_last_updated` on List Tours. Only call Show Tour when this value differs from your stored copy. List Tours itself is cheap — one call for all tours across all your Channels.

`has_sale=0` on List Tours means the tour exists but currently has no future bookable dates. **Import it anyway** — keep the metadata so you can show "Coming soon / Currently unavailable" instead of dropping the product.

### 0.2 Booking flow (Marketplace Partner — skip "Get Booking Key")

```
┌──────────────────────────────────────────────────────────────────────────┐
│  YOUR FLOW (Marketplace Partner)                                         │
├──────────────────────────────────────────────────────────────────────────┤
│  1. Show Tour          → get rate_id, min/max, options, questions        │
│  2. Check Availability → get component_key + timeslot list + price       │
│  3. Start New Booking  → temp booking holding stock (45 min default)     │
│  4. Commit New Booking → temp → live booking                             │
└──────────────────────────────────────────────────────────────────────────┘
```

| Step | Endpoint | Verb | Section |
| --- | --- | --- | --- |
| 1. Show Tour | `/c/tour/show?id={tour_id}` | GET | §6.2 |
| 2. Check Availability | `/c/tour/datesprices/checkavail?id={tour_id}&date={YYYY-MM-DD}&r1={n}` | GET | §6.4 |
| 3. Start New Booking | `/c/booking/new/start` (POST XML) | POST | §9.2 |
| 4. Commit New Booking | `/c/booking/new/commit` (POST XML with `booking_id`) | POST | §9.3 |

**As a Marketplace Partner you do NOT call `/c/booking/new/get_redirect_url`** — that's a tour-operator-only step for client-side affiliate-click tracking. Just go straight from Check Availability to Start New Booking.

**The full schemas you need are already in this doc**:
- Show Tour (§6.2) — including the `new_booking.people_selection.rate` block which gives you every `rate_id`, agecat, min/max, and lead-in price you need to build the form.
- Check Tour Availability (§6.4) — including every field on the returned `<component>` (your timeslots).
- Start New Booking (§9.2) — full XML POST schema covering `total_customers`, `components` (with `replies` for question answers and `options`), `customers` block with every field, plus all response fields including `sales_revenue_due_now` and `sales_price_due_ever`.
- Commit New Booking (§9.3) — full POST body + response (with `voucher_url`, `barcode_data`, per-component `tickets` and `urls`).

**Payment**: as a Marketplace Partner you can either (a) handle payment on your side and just leave the booking as-is (agent pays the balance back to the operator later — `agent_type` = `RETAIL` / `TRUSTED`) or (b) use Spreedly to take a card payment directly into the operator's gateway — see §10.2 (`spreedly_payment_create` auto-commits, so you skip step 4).

**Permission level matters**: ask the operator to grant you permission level 3 if you need full booking + customer detail after commit. Levels 1 and 2 hide most fields. Check via `<connection_permission>` on Show Channel (§5.2).

### 0.3 Timeslots / per-day availability display

The customer picks a date → you show them the available times to book. **Use Check Tour Availability** — each timeslot is a separate `<component>` in the response.

```
GET /c/tour/datesprices/checkavail.xml?id=1&date=2026-06-15&r1=2
                                         ↑                  ↑
                                      tour ID         rate IDs + quantities
                                                      (r1=2 = 2 adults on rate r1)
```

**Response** (abridged from §6.4):

```xml
<response>
  <error>OK</error>
  <tour_id>1</tour_id>
  <component_key_valid_for>1800</component_key_valid_for>   <!-- price locked for 30 min -->
  <available_components>

    <component>
      <start_date>2026-06-15</start_date>
      <end_date>2026-06-15</end_date>
      <start_time>09:00</start_time>            <!-- ← timeslot 1 -->
      <end_time>12:30</end_time>
      <start_time_utcseconds>1781596800</start_time_utcseconds>
      <end_time_utcseconds>1781609400</end_time_utcseconds>
      <date_code>AM</date_code>
      <spaces_remaining>8</spaces_remaining>
      <total_price>100.00</total_price>
      <total_price_display>£100</total_price_display>
      <net_price>85.00</net_price>              <!-- what you'll be invoiced as agent -->
      <component_key>Rjqb+vKn6H5...</component_key>
      <pickup_points>
        <pickup>
          <pickup_key>...</pickup_key>
          <time>08:30</time>
          <pickup_name>Charing Cross Hotel</pickup_name>
        </pickup>
      </pickup_points>
    </component>

    <component>
      <start_time>13:00</start_time>            <!-- ← timeslot 2 -->
      <end_time>16:30</end_time>
      <date_code>PM</date_code>
      <spaces_remaining>4</spaces_remaining>
      <total_price>110.00</total_price>
      <component_key>K9pq+aZ...</component_key>
    </component>

  </available_components>
</response>
```

**Rendering rules**:
- One component = one button/card in your timeslot UI.
- Sort by `start_time_utcseconds` (handles tours with timezone-aware operators correctly).
- Show `note` and `date_code` when they differ between components — they often disambiguate (e.g. "English-language tour" vs "Spanish-language tour" at the same time).
- Store the `component_key` alongside your selected slot. **The price is locked for `component_key_valid_for` seconds** (typically 1800 = 30 min). After that you must re-call Check Availability before booking.
- `pickup_points` may differ per timeslot — render them inside each slot, not globally.
- `spaces_remaining` per slot. Could be `UNLIMITED` for some products — string-check, don't `parseInt` blindly.

**Show Tour `start_time` value**:
- If it's a regular time (e.g. `"09:00"`) — the tour has one fixed start. Check Availability will return one component.
- If it's `"MULTI"` — the tour has multiple start times per day. Check Availability is where you get the actual list.
- If it's blank — start time is unknown/irrelevant (e.g. attraction tickets with `time_type=opening_hours`).

**Reading the calendar (which dates are bookable in the first place)**:

To populate a date-picker BEFORE the customer selects a date, use **Dates & Deals** with `distinct_start_dates=1` (§6.3). This gives you one entry per available date without checking real-time availability for each — much cheaper than calling Check Availability for every date. Then when they pick a date, call Check Availability for the timeslots.

```
GET /c/tour/datesprices/datesndeals/search.xml?id=1&distinct_start_dates=1
                                                    &startdate_start=2026-06-01
                                                    &startdate_end=2026-08-31
```

```ts
// Sketch of the two-stage availability UI
// Stage 1 — calendar (cache 30 min)
const datesXml = await datesAndDeals(cfg, tourId, channelId, {
  distinct_start_dates: "1",
  startdate_start: "2026-06-01",
  startdate_end: "2026-08-31",
});
const bookableDates = parser.parse(datesXml).response.dates_and_prices.date
  .map(d => d.start_date);            // ["2026-06-01", "2026-06-02", ...]

// Stage 2 — when user picks a date, get timeslots (DO NOT CACHE)
const availXml = await checkAvailability(cfg, tourId, channelId, {
  date: "2026-06-15",
  r1: "2",                            // 2 adults
});
const slots = parser.parse(availXml).response.available_components?.component ?? [];
// Render each slot: start_time, end_time, total_price_display, component_key
```

---

## 1. Authentication & Connection

**Source page**: https://www.tourcms.com/support/api/mp/connection.php

### Connection model

- **Tour Operators** have one or more Channels in their account, with a separate API key per Channel.
- **Marketplace Agents** are connected to one or more Channels but use a single API key for all of them.
- Operators always send their `Channel ID`. Marketplace Agents pass the appropriate Channel ID for most endpoints, but for cross-Channel endpoints (under `/p/`) the Channel ID is sent as `0`.

### Required headers

Every API request must include:

| Header | Value |
| --- | --- |
| `x-tourcms-date` | GMT date/time the request was generated (RFC 7231 IMF-fixdate, e.g. `Fri, 23 Jan 2026 09:28:11 GMT`) OR a UNIX timestamp. Must match the timestamp used in the signature. |
| `Authorization` | `TourCMS {ChannelID}:{MarketplaceID}:{Signature}` |
| `Content-type` | `application/xml` (for POST) |

- `ChannelID` — Channel ID to act against. `0` when calling cross-Channel `/p/` endpoints as a Marketplace Agent.
- `MarketplaceID` — `0` for individual Tour Operator accounts. Marketplace Agents use their own ID (sent in welcome email or visible in API Settings inside the Agent Portal).
- `Signature` — see below.

### Signature generation (HMAC-SHA256, base64, then URL-encoded)

1. Build the string to sign in this exact format:

   ```
   CHANNEL_ID/MARKETPLACE_ID/VERB/OUTBOUND_TIME/PATH
   ```

   - `VERB` — `GET` or `POST` (uppercase).
   - `OUTBOUND_TIME` — UNIX timestamp matching the value in `x-tourcms-date`.
   - `PATH` — request path including the querystring, e.g. `c/tour/search.xml?id=1`.

   Example string for Operator on Channel 3930 calling tour search:
   ```
   3930/0/GET/1769160491/c/tour/datesprices/dep/manage/search.xml?id=1
   ```

2. Compute `HMAC-SHA256(stringToSign, apiKey)`.
3. Base64-encode the binary HMAC digest.
4. **URL-encode** the resulting base64 string (this is critical: `/`, `+`, `=` must be percent-encoded).
5. Use the encoded value as the signature in the `Authorization` header.

### Example final headers

```
x-tourcms-date: Tue, 12 May 2026 05:36:33 GMT
Authorization: TourCMS 3930:0:Q9d6Iq2hI5uXnXuW%2FE3vZosENPURpb53%2FCbPCog%2Bm6U%3D
Content-type: application/xml
```

### Path conventions

- `/c/...` — endpoints scoped to a specific Channel (used by both Operators and Marketplace Agents with a Channel ID).
- `/p/...` — endpoints for Marketplace Agents only that span multiple Channels. Channel ID must be `0` in these. Calling `/p/...` as a Tour Operator returns `FAIL_PARTNERSONLY`.

### Time tolerance

Signed requests are accepted within ±15 minutes of TourCMS server time. If clock skew is too large you get `FAIL_TIME`. Make sure your server clock + timezone are correct.

---

## 2. Caching Guidance

**Source page**: https://www.tourcms.com/support/api/mp/caching.php

Two broad approaches:

- **Sync to your own DB** — run scheduled jobs to import data. Use the bulk endpoints (see §7).
- **Cache on the fly** — cache successful API responses (where `<error>` is `OK`) in your framework's cache layer.

Suggested cache windows:

| Endpoint | Suggested cache time |
| --- | --- |
| Search Tours | 30 minutes |
| Show Tour | 120 minutes |
| Dates & Deals | 30 minutes |
| Check Availability | **Do not cache** |
| Booking Creation APIs | **Do not cache** |

Always only cache responses where the response contains `<error>OK</error>`.

---

## 3. Error Messages

**Source page**: https://www.tourcms.com/support/api/mp/error_messages.php

Common values returned in the `<error>` node:

| Code | Meaning |
| --- | --- |
| `OK` | No error. |
| `NO MATCHING DATA` | Parameters had no match. Also returned for un-upgraded accounts. |
| `FAIL_SIG` | Signature mismatch. Check Channel ID is correct for the data being requested. |
| `FAIL_PERM` | Lacking permission to undertake the action. |
| `FAIL_TOUROPONLY` | Endpoint is Tour Operator/supplier only — not for Agents. |
| `FAIL_KEYNOTFOUND` | API key/login details invalid. |
| `FAIL_PARTNERSONLY` | `/p/` endpoint called as a Tour Operator. Send Channel ID `0` and use Agent credentials. |
| `FAIL_ACTIVEPARTNERSONLY` | Marketplace Agent account is deactivated. |
| `FAIL_TIME` | Signed request outside the ±15-minute window — server clock skew. |
| `FAIL_VERB` | Wrong HTTP method (GET vs POST). |
| `WEBHOOK_TIMEOUT` | External system contacted by TourCMS did not respond in time. |

Endpoint-specific errors are documented on each endpoint page.

---

## 4. Housekeeping

### 4.1 API Rate Limit Status

| Endpoint | `/api/rate_limit_status` |
| --- | --- |
| **Verb** | GET |
| **Format** | XML |
| **Example** | `/api/rate_limit_status.xml` |
| **Auth** | Operator: own Channel ID. Agent: `0` (or a specific Channel ID to check per-Channel limits). |

**Notes**: Calls to this endpoint do **not** count against your throttle. Also useful as a connection/auth sanity check. Default limit is 2000 requests per Channel per hour (per type). Remaining hits are also returned in headers of every other call.

**Querystring**: none.

**Response**:

| Node | Notes |
| --- | --- |
| `request` | Echo of the request. |
| `error` | `OK` on success. |
| `remaining_hits` | Remaining GET requests this hour. |
| `hourly_limit` | Hourly GET limit. |
| `remaining_hits_post` | Remaining POST requests this hour. |
| `hourly_limit_post` | Hourly POST limit. |

Sample response:
```xml
<response>
  <request>GET /api/rate_limit_status.xml</request>
  <error>OK</error>
  <remaining_hits>2999</remaining_hits>
  <hourly_limit>3000</hourly_limit>
  <remaining_hits_post>2999</remaining_hits_post>
  <hourly_limit_post>3000</hourly_limit_post>
</response>
```

---

## 5. Channels

### 5.1 List Channels

| Endpoint | `/p/channels/list` |
| --- | --- |
| **Verb** | GET |
| **Who** | Marketplace Agents only. |
| **Example** | `/p/channels/list.xml` |

**Description**: Returns connected channels (suppliers). Useful for listing suppliers or pulling a list to feed `/c/channel/show`.

**Querystring**:

| Param | Notes |
| --- | --- |
| `count_all_tours` | `1` to count all tours (not just available). Default `0`. |

**Response — per `<channel>`** (key fields):

- `channel_id`, `account_id`, `channel_name`
- `tour_count`
- `logo_url`, `home_url`, `home_url_tracked`
- `lang`, `sale_currency`
- `short_desc`, `long_desc`
- `connection_permission` (1/2/3)
- `payment_gateway` block with `gateway_id`, `name`, `gateway_type` (e.g. `SPRE`, `PAYP`, `AUN`, `TMTP`), and card flags (`take_visa`, `take_mastercard`, `take_diners`, `take_discover`, `take_amex`, `take_unionpay`).

If `gateway_type` is `SPRE`, `spreedly_environment_key` is included (used by Spreedly-integrated payments — see §10).

### 5.2 Show Channel

| Endpoint | `/c/channel/show` |
| --- | --- |
| **Verb** | GET |
| **Example** | `/c/channel/show.xml` |

**Description**: Full company/brand info for a Channel. Most accounts have one Channel; some operators use a multi-Channel strategy.

**Querystring**: none — pass Channel ID in the header (or as the wrapper argument).

**Response — `<channel>`** (selected fields; full set is large):

- IDs: `channel_id`, `account_id`, `channel_name`, `company_name`
- API permissions: `get_perm_custbook`, `get_perm_agsup`, `post_perm_custbook`, `post_perm_agsup`, `post_perm_dpa`
- URLs: `home_url`, `home_url_tracked`, `logo_url`, `contact_us_link`, `privacy_policy_link`, `branding_colour`
- Locale/currency: `lang`, `utc_offset_mins`, `account_timezone`, `default_tour_timezone`, `sale_currency`, `base_currency`
- Booking fee block: `fee_active`, `booking_fee` (`fee`, `description`, `fee_type` — `PER_PERSON` / `PER_BOOKING`)
- Descriptive: `short_desc`, `long_desc`, `very_long_desc`, `why_desc`, `bonding`, `certification`, `cancel_policy`, `terms_and_conditions`
- Contact: `email_customer`, `phone_customer`, `office_hours`
- Social: `twitter`, `tripadvisor`, `youtube`, `facebook`, `flickr`, `othersm`
- Address: `address_1`, `address_2`, `address_city`, `address_state`, `address_postcode`, `address_country`, `latitude`, `longitude`
- `geo_location` with `geocode`, `google_place_id`, `google_place_name`, `search_term`, `google_place_refreshed`
- Commercial (`_private`): commission expectations, lead time, transaction sizes, conversion percentages, etc.
- `perm_override_sale_price` (`0` / `1`)
- `connection_permission` — `1` Sell only / `2` Summary stats / `3` Full booking details
- `payment_gateway` block (same shape as in List Channels). If gateway is Spreedly, includes `spreedly_environment_key`. If accessing as a Tour Operator, includes `field_1` … `field_10` (gateway-specific configuration).
- `booking_style` — `ENQUIRY`, `QUOTE`, or `BOOKING` (mainly for affiliates linking to the hosted booking engine).
- If called by an Agent: `agent_specific_fields` (`field` nodes with `name` and `value`).
- If called by Tour Operator: `google_analytics_id`.

### 5.3 Channel Performance

| Endpoint | `/p/channels/performance` (top 50) **or** `/c/channel/performance` (specific Channel) |
| --- | --- |
| **Verb** | GET |
| **Who** | Marketplace Agents only. |

**Description**: Returns top 50 channels by unique-visitor clicks, or stats for one Channel.

**Querystring**: none (pass Channel ID in header to scope to one Channel).

**Response — per `<channel>`** (some only with permission level 2+):

- All Channels: `channel_id`, `account_id`, `channel_name`, `connection_permission`, `unique_visitors`.
- Permission 2+: `total_bookings`, `total_customers`, `open_enquiries`, `closed_enquiries_success`, `closed_enquiries_failure`, `sales_revenue` (+ `sale_currency`, `sales_revenue_display`), `commission` (+ `commission_currency`, `commission_display`, `commission_tax`, `commission_tax_display`), `click2book`, `commercial_avclick2book_private`.
- Top-level: `report_start_date`, `report_end_date`.

### 5.4 Show Markup Scheme

| Endpoint | `/c/markups/show` |
| --- | --- |
| **Verb** | GET |
| **Who** | Tour Operator only. |

**Description**: Markup scheme attached to the Channel.

**Response — `<markup_scheme>`**:

- `markup_scheme_id`, `markup_scheme_name`, `markup_scheme_note`
- `markup_types` → repeated `markup_type` with `markup_type_id`, `markup_type_name`, `markup_type_note`, `pre`, `percentage`, `post`.

### 5.5 Create / Update Channel

| Op | Endpoint | Verb | Wrapper |
| --- | --- | --- | --- |
| Create | `/p/channel/create` | POST | `createChannel(channel, channelInfo)` |
| Update | `/p/channel/update` | POST | `updateChannel(channel, channelInfo)` |

**Who**: Marketplace-level. POST XML body with Channel configuration (name, description, language, currency, etc.). Use these when programmatically provisioning new Channels (e.g. onboarding new supplier brands).

---

## 6. Tours — General Use

### 6.1 Search Tours

| Endpoint | `/p/tours/search` (cross-Channel) **or** `/c/tours/search` (single Channel) |
| --- | --- |
| **Verb** | GET |
| **Cache** | ~30 minutes recommended. |
| **Paging** | 75/page default, max 200. |

**Description**: Listing/search endpoint. Returns a subset of tour data sufficient for list/grid pages. Use [Show Tour](#62-show-tour) for full detail.

**Querystring parameters** (most-used subset; full list very large):

- ID filters: `tour_id`, `not_tour_id`, `channel_id_tour_id`, `not_channel_id_tour_id` (latter two work across channels).
- Keyword: `k`, `k2`, `k3`, `k_type` (set to `AND` to make `k*` work as AND, default is OR).
- Location: `location`, `lat`, `long`, `geo_type` (`end` to search end point), `geo_unit` (`km`, default miles), `geo_distance` (default 50).
- Date/offer:
  - `has_sale` (default returns only future-bookable; `all` returns everything)
  - `has_offer` (`1` for tours with offers; combine with start_date_* for offer windows)
  - `has_sale_month` (e.g. `1,2`)
  - `start_date` (YYYY-MM-DD)
  - `start_date_start`, `start_date_end`
  - `between_date_start`, `between_date_end` (multi-day: start AND end within range)
- Duration/price: `duration_min`, `duration_max`, `price_range_min`, `price_range_max`, `price_range_currency` (default USD; TourCMS internally converts for ordering).
- Misc: `min_priority` (`medium` / `high`), `country`, `not_country`, `accom` / `not_accom`, `accomrating`, `product_type` (comma-sep), `grade`, `tourleader_type`, `show_tour_tags`, `cancellation_policy`, `suitable_for_*` (deprecated; use `tour_tags`), `health_and_safety_details`, `non_refundable`, `currency`, `lang`, `lang_spoken`, `video_service` (`all` / `vimeo` / `youtube`).
- `404_tour_url` — `error` (URLs returning errors) or `all` (ignore URL check).
- `airport_code` — for transfers (when `product_type=2`).
- Ordering (`order`): `comm` (default), `tour_name`, `date_soonest`, `display_points_up`/`_down`, `duration_up`/`_down`, `price_up`/`_down`, `rating_down`, `offer_recent`, `offer_soonest`, `created_recent`.
- `qc` — Quality control toggle for affiliates.
- Paging: `per_page` (default 75, max 200), `page` (default 1).
- Tour Operator only: `category` / `ANDcategory` / `ORcategory` / `NOTcategory`, `tour_tags` / `AND..` / `OR..` / `NOT..`, `booking_style`.

**Response — top-level**:
- `request`, `error`, `total_tour_count`
- Per `<tour>`: `channel_id`, `account_id`, `tour_id`, `distribution_identifier`, `has_sale`, `has_d`, `has_f`, `has_h`, `created_date`, `next_bookable_date`, `next_bookable_date_norange`, `last_bookable_date`, `has_sale_jan`…`has_sale_dec`, `tour_code`, `from_price` (+ `_display`, monthly `_jan`…`_dec` and `_display` variants), `from_price_unit` (0/1/2/3 = person/couple/vehicle/room), `sale_currency`, `priority` (HIGH/MEDIUM/LOW), `thumbnail_image`, `image`, `video` (`video_service`, `video_id`, `video_url`), `geocode_start`, `geocode_end`, `distance` (if proximity search), `tour_name`, `tour_name_long`, `start_time`, `end_time` (may be `MULTI`), `account_timezone`, `start_timezone`, `end_timezone`, `country` (CSV ISO), `duration`, `duration_desc`, `location`, `summary`, `shortdesc`, `available`, `tour_url`, `tour_url_tracked`, `book_url`, `delivery_formats` (`QR_CODE` / `PDF_URL` / `HTML` / `CODE128`), `delivery_methods` (`TICKET` / `TOUR` / `BOOKING`), `redemption_method` (`MANIFEST` / `DIGITAL` / `PRINT`), `tourleader_type` (1/2/3), `grade` (1–5), `accomrating` (1–6), `product_type` (1–9; for transfers also has `direction` and `airport_code` attributes), `pickup_on_request`, `pickup_scheduled`, `tour_tags` (tag tokens — see Show Tour), `suitable_for_*` (deprecated mirrors), `health_and_safety_details`, `non_refundable`, `languages_spoken` (CSV ISO), `ratings` (`average`, `count`, `max`, `platform`), `supplier_id` (operator only), `channel` (`channel_name`, `logo_url`, `lang`, `home_url`, `home_url_tracked`), `soonest_special_offer`, `recent_special_offer`, `dates_public_bookable`, `dates_has_offer`, and Tour Operator-only `custom1`/`custom2`/`custom3`.

**Tour `product_type` values**:
1 Accommodation · 2 Transport/Transfer · 3 Tour/Cruise w/ overnight · 4 Day tour/activity/attraction · 5 Tailor-made · 6 Event · 7 Training · 8 Other · 9 Restaurant.

### 6.2 Show Tour

| Endpoint | `/c/tour/show` |
| --- | --- |
| **Verb** | GET |
| **Cache** | ~60 minutes. |
| **Example** | `/c/tour/show.xml?id=92` |

**Description**: Full details for a single tour.

**Querystring**:

| Param | Notes |
| --- | --- |
| `id` | Tour ID (required). |
| `show_options` | `1` to also return Options. |
| `show_offers` | `1` to return `soonest_special_offer` and `recent_special_offer`. Also returns `from_price_cached` to match the Tour Search cached value. |
| `order` | Ordering for `alternative_tours` (same values as Tour Search). |
| `show_questions` | `1` to include active Questions. |

**Response — `<tour>`** (selected; the full schema is extensive):

- IDs: `channel_id`, `account_id`, `tour_id`, `distribution_identifier`, `tour_code`
- Names/text: `tour_name` (≤50), `tour_name_long` (≤100), `time_type` (`strict` / `opening_hours` / `strict_start`)
- Times/timezones: `start_time`, `end_time`, `account_timezone`, `start_timezone`, `end_timezone`
- Sale signals: `has_sale`, `has_d`, `has_f`, `has_h`, `created_date`, `descriptions_last_updated`, `support_base_price`, `base_price` (`base_price_quantity`, `base_sale_price_from`, `base_cost_price_from`), `next_bookable_date`, `last_bookable_date`, `has_sale_jan`…`has_sale_dec`
- Pricing rules: `quantity_rule` (`Q` or `1`), `volume_pricing` (0/1/2), `tour_permit_child_only`
- Prices: `from_price`, `from_price_cached`, `from_price_display`, monthly `from_price_jan`…`dec` (+ `_display`), `from_price_unit`, `sale_currency`, `priority`
- Geo: `address`, `geocode_start` (deprecated), `geocode_end` (deprecated), `geocode_start_point` / `geocode_end_point` (`geocode`, `label`, `google_place_id`, `loc_relation`), `geocode_midpoints` → repeated `midpoint` (`geocode`, `label`, `google_place_id`, `loc_relation`, `can_start_end_here`, `geo_order`)
- Pickup: `pickup_on_request` (0/1/2), `pickup_on_request_key`, `pickup_points` → repeated `pickup` (`pickup_name`, `description`, `address1`, `address2`, `postcode`, `geocode`, `pickup_id`)
- Delivery: `delivery_formats`, `delivery_methods`, `redemption_method`
- Documents: `documents` → repeated `document` (`document_description`, `document_url`)
- Categorisation: `grade`, `accomrating`, `product_type` (+ `direction`, `airport_code` attrs), `tourleader_type`, `suitable_for_*` (deprecated), `tour_tags` (`tag` nodes with `token`, `text`, `value`), `health_and_safety` (`item` nodes with `name`, `display_name`, `value` of `NOTSET`/`YES`/`NO`)
- Questions: `questions` → `q` nodes (`question`, `explanation`, `placeholder`, `question_internal`, `answer_type`, `answer_mandatory`)
- Misc: `languages_spoken`, `ratings`, `location`, `summary`, `country`, `duration`, `duration_desc`, `available`, `shortdesc`, `longdesc`, `itinerary`, `exp`, `pick`, `redeem`, `inc`, `ex`, `essential`, `extras`, `rest`, `tour_url`, `tour_url_tracked`, `book_url`
- `images` → repeated `image` (first has `thumbnail="true"`): `url_thumbnail`, `url`, `url_large`, `url_xlarge`, `image_desc`
- `videos` → `video` (`video_service`, `video_id`, `video_url`)
- `min_booking_size`, `max_booking_size`
- `new_booking` — useful for building booking forms:
  - `people_selection` → repeated `rate` (`rate_id`, `label_1`, `label_2`, `minimum`, `maximum`, `agecat` (s/a/y/c/i), `agerange_min`, `from_price`, `from_price_display`, `rate_code`, `tiers` → `tier` (`scale_from`, `scale_to`, `sale_price`))
  - `date_selection` → `date_type` (`DATE`, `DATE_DAYS`, `DATE_NIGHTS`), `duration_minimum`, `duration_maximum`
  - `required_fields` → `field` (`name`, `scope`, `require`)
  - `additional_criteria` → `criteria` (`name`)
- `tour_departure_structure` (`type`: `NOTSET`/`SINGLE`/`START_TIME`/`SUPPLIER_NOTE`/`DEPARTURE_CODE`/`SUPPLIER_NOTE_PLUS_START_TIME`; `add_new_auto`; `departure_types`)
- `alternative_tours` → up to 10 `tour` mini-records
- `options` (only with `show_options=1`) → `option` (`option_id`, `option_name`, `short_description`, `from_price`, `from_price_display`, `option_sale_currency`, `group`, `group_title`, `supplier_option_note`)
- `soonest_special_offer` / `recent_special_offer` (only with `show_offers=1`)
- `validity` (`validity_type`, `validity_value`, `validity_minutes`)
- `booking_window_end` (`unit` = `d`, `value` = `open` or 1–365)
- Tour Operator only: `supplier_id`, `supplier_tour_code`, `cost_currency`, `staff_note`, `operational_note`, `markup_type_id`, `cutoff` (`type` = `before_start_sec` / `day_before_time` / `same_day_time`, `value`), `non_refundable`, `cancellation_policy` (`policy` with `id`, `name`, `type` (d/h/m), `value`), `subsystem` (`update`, `notify`), `custom_fields` (`field` with `name`, `value`), `categories` (`group` → `name`, `values` → `value`), `fixed_sale_prices` (`rate_or_quantity`, `price`, `offer_price`)

### 6.3 Show Tour Dates & Deals

| Endpoint | `/c/tour/datesprices/datesndeals/search` |
| --- | --- |
| **Verb** | GET |
| **Cache** | ~30 minutes. |
| **Example** | `/c/tour/datesprices/datesndeals/search.xml?id=123` |

**Description**: Available start dates + prices (including freesale seasons and hotel-priced dates) for a tour. Great for calendar widgets and listing offers.

**Querystring**:

- `id` (required) — Tour ID
- `startdate_start` + `startdate_end` (range, YYYY-MM-DD; supply both or neither)
- `between_date_start` + `between_date_end` — start AND finish within range
- `start_time` — HH:MM (24h)
- `has_offer` — empty/all/1/2/3/4 (specific date, late booking, early booking, duration); combine with commas (e.g. `2,3`)
- `order` — `start_date` (default) or `offer_date`
- `distinct_start_dates` — `1` for one entry per date (calendar use)
- `supplier_note`, `supplier_note_like` (use `_` for one char, `%` for many; escape with `\`), `code`

**Response — per `<date>` inside `<dates_and_prices>`**:
- `start_date`, `end_date`, `start_time`, `end_time`, `date_code`, `note`, `guide_language` (`language` repeated, e.g. `fr`), `sale_currency`, `min_booking_size`, `spaces_remaining` (numeric or `UNLIMITED`), `spaces_remaining_by_rate` (`rate` with `rate_id`, `spaces_remaining`), `special_offer_type` (0/1/2/3/4), `status` (`OPEN`), `book_url`, `supplier_note`, `price_1` (+ `_display`), `price_2` (+ `_display`).
- If special offer: `special_offer_datetime`, `special_offer_note`, `original_price_1` (+ `_display`), `original_price_2` (+ `_display`).

Top-level: `request`, `error`, `total_date_count`, `channel_id`, `account_id`, `tour_id`.

### 6.4 Check Tour Availability

| Endpoint | `/c/tour/datesprices/checkavail` |
| --- | --- |
| **Verb** | GET |
| **Cache** | **Do not cache.** Real-time only. |
| **Example** | `/c/tour/datesprices/checkavail.xml?id=33&date=2027-10-26&r1=4&r3=7` |

**Description**: Real-time availability + final calculated price for chosen quantity/date. Returns one or more components representing different times/routes/durations available. Each has a `component_key` that locks the price (not the stock) for `component_key_valid_for` seconds, until a temporary booking is created with [Start New Booking](#92-start-new-booking).

**Querystring**:

- `id` (required) — Tour ID
- `date` — YYYY-MM-DD (defaults to today)
- `hdur` — duration integer for hotel-priced tours (days or nights, per Show Tour)
- Rates — e.g. `r1=2&r2=1` (rate IDs from Show Tour `new_booking.people_selection`)
- `pickup_order` — `pickup_time` (default) or `pickup_name`
- `show_pickups` — `0` to suppress pickup list
- `booking_key` — Tour Operator only; impersonates an agent-driven webhook (testing)
- `supplier_note`, `start_time`, `code`, `supplier_note_like`
- `unavailable_components` — `1` to include unavailable component diagnostics

**Response — top-level**:
- `request`, `error`, `channel_id`, `account_id`, `tour_id`, `tour_name`, `tour_name_long`, `component_key_valid_for` (seconds)
- `available_components` → 0+ `component` nodes (see below)
- If `unavailable_components=1`: `unavailable_components` → `component` with diagnostics (`excluded_by_webhook`, `status`, `manually_closed`, `max_booking_size_exceeded`, `spaces_remaining_exceeded`, etc.)
- `webhook_id` — if a Check Availability webhook ran

**Per `<component>` (available)**:
- `start_date`, `end_date`, `start_time`, `end_time`, `start_time_utcseconds`, `end_time_utcseconds`, `public_bookable`
- `date_code`, `date_id`, `date_type` (`departure` / `freesale` / `hotel`)
- `sale_currency`, `min_booking_size`, `spaces_remaining`, `spaces_remaining_by_rate`
- `sale_quantity_rule` (`PERSON` / `GROUP`)
- `total_price` (+ `_display`), `net_price` (agents)
- `price_breakdown` → repeated `price_row`
- `note`, `cost_currency` (operator only), `guide_language`, `special_offer_note`
- **`component_key`** — the key you pass to Start New Booking
- `questions` → `q` with `question_key`, `question`, `explanation`, `placeholder`, `question_internal`, `repeat`, `repeat_type`, `answer_type`, `answer_mandatory`
- `options` → `option` (`option_id`, `option_name`, `short_description`, `local_payment`, `sale_quantity_rule`, `duration_rule`, `extension`, `group`, `group_title`, `option_type` (`ONE_FROM_GROUP` / `ANY_FROM_GROUP` / `TOUR_QUANTITY_FROM_GROUP`), `per_text`, `quantities_and_prices` → `selection` (`quantity`, `price`, `price_display`, `option_sale_currency`, `component_key`))
- `pickup_on_request_key` — if free-text pickups are accepted
- `pickup_points` → `pickup` (`pickup_key`, `time`, `pickup_name`, `description`, `address1`, `address2`, `postcode`, `geocode`)
- `supplier_note`

### 6.5 Update Tour

| Endpoint | `/c/tour/update` (path inferred from naming convention; payload shape per source — only a subset of fields is supported) |
| --- | --- |
| **Verb** | POST |
| **Who** | Tour Operator only. |

**Description**: Update a subset of Tour fields. Source page: https://www.tourcms.com/support/api/mp/tour_update.php — endpoint accepts XML with `<tour>` root containing the fields to update. Currently supports a subset (descriptions, custom fields, basic metadata). Refer to the live page for the up-to-date field whitelist.

### 6.6 List Tour Locations

| Endpoint | `/c/tour/locations/list` (or similar; check live page) |
| --- | --- |
| **Verb** | GET |

**Description**: Returns primary locations and associated countries — useful for autocomplete/dropdowns. Source: https://www.tourcms.com/support/api/mp/locations_list.php

### 6.7 List Product Filters

| Endpoint | `/c/tours/filters/list` |
| --- | --- |
| **Verb** | GET |
| **Who** | Tour Operator only. |

**Description**: Product Filters group related tours. Source: https://www.tourcms.com/support/api/mp/product_filters_list.php

### 6.8 Search Hotels (by specific availability)

| Endpoint | `/p/hotels/search_avail` (cross-Channel) **or** `/c/hotels/search_avail` (single Channel) |
| --- | --- |
| **Verb** | GET |
| **Wrapper** | `searchHotelsSpecific(channel, tourId, params)` |

**Description**: Tailored version of Search Tours for room availability where pricing is Hotel-type. Pass `hdur` along with rates. Source: https://www.tourcms.com/support/api/mp/hotel_search_specific.php

### 6.8b Search Hotels (by date range)

| Endpoint | `/p/hotels/search_range` |
| --- | --- |
| **Verb** | GET |
| **Wrapper** | `searchHotelsRange(channel, tourId, params)` |

**Description**: Marketplace-wide hotel search across a date range. Useful for "find me any hotel available between date X and Y" type queries vs. the per-tour `search_avail` endpoint above.

### 6.8c Check Option Availability

| Endpoint | `/c/booking/options/checkavail` |
| --- | --- |
| **Verb** | GET |
| **Example** | `/c/booking/options/checkavail.xml?booking_id={bookingId}&tour_component_id={componentId}` |
| **Wrapper** | `checkOptionAvailability(channel, bookingId, tourComponentId)` |

**Description**: Check availability of Options (ancillary items / upgrades) that can be added to an **existing** tour component on a booking. Returns `component_key` values you can pass to [Add Booking Component](#910-add-booking-component) with `component_key="ADD_OPTION_TO_EXISTING_TOUR"`.

### 6.8d Show Promo Code

| Endpoint | `/c/promo/show` |
| --- | --- |
| **Verb** | GET |
| **Example** | `/c/promo/show.xml?promo_code={code}` |
| **Wrapper** | `showPromo(channel, promoCode)` |

Validates a promo/gift code without creating a booking. Reports whether a membership number is required and its expected format. Source: https://www.tourcms.com/support/api/mp/promo_show.php

### 6.9 List Tour Booking Restrictions

| Endpoint | per source page |
| --- | --- |

**Description**: Lists the field restrictions configured for specific tours (which customer fields are required/rejected and for which scope — `allpax`, `leadpax`, `otherpax`). Source: https://www.tourcms.com/support/api/mp/list_tour_booking_restrictions.php

### 6.10 Tours Search Criteria

**Description**: Lists the tour tag tokens currently selected on a tour and its locations. Useful for building filter UIs that match a tour's actual tag set. Source: https://www.tourcms.com/support/api/mp/tours_search_criteria.php

### 6.11 Get Tour Promotions

| Endpoint | per source page |
| --- | --- |
| **Who** | Marketplace Agents only. |

**Description**: Returns active Tour Promotions for a tour/channel. Source: https://www.tourcms.com/support/api/mp/get_tour_promotions.php

---

## 7. Tours — Bulk Export Use

These endpoints exist for mirroring tour data into your own database. Combine with Show Tour for full detail per product.

### 7.1 List Tours

| Endpoint | `/c/tours/list` (single Channel) **or** `/p/tours/list` (cross-Channel) |
| --- | --- |
| **Verb** | GET |
| **Example** | `/c/tours/list.xml` |

**Description**: The primary endpoint for **importing tours into your own database**. Provides a basic list of every tour available to you via the API. **Includes tours with no future bookable dates** — these are flagged via `has_sale=0`. Run [Show Tour](#62-show-tour) against each `tour_id` to get the full record.

> Use this endpoint, **not** Tour Search, when you're populating a local DB. Tour Search is for customer-facing listing pages and only returns currently-saleable tours by default.

**Querystring parameters** (all optional):

| Param | Notes |
| --- | --- |
| `booking_style` | Set to `booking` to only return Tours from Channels that take confirmed online bookings (excludes Channels that take "bookings" as Enquiries/Quotations). |
| `qc` | Quality control toggle. `on` returns only tours where TourCMS is confident web tracking + minimum image/description criteria are met. Default is off. No effect when called by the Tour Operator on their own data. |
| `show_options` | `0` or `1`. If `1`, includes an `<options>` block on each tour with public, non-mandatory, no-question options that have future bookable dates. |
| `supplier_tour_code` | Filter to tours with this supplier-set code. The supplier tour code is the identifier inside the supplier's subsystem — useful for cross-system mapping. |
| `filter_tour_ids` | Comma-separated list of tour IDs to filter to. |

A Channel ID is passed via the request header. With `0` (Marketplace Agent only) you'll get tours across all connected Channels — perfect for a one-shot importer.

**Response — top-level**: `request`, `error`, then 0+ `<tour>` nodes.

**Per `<tour>`** (lean — by design):

| Node | Notes |
| --- | --- |
| `channel_id` | Channel ID. |
| `account_id` | Account ID. |
| `tour_id` | Tour ID (unique within a Channel, not globally). |
| `distribution_identifier` | Globally unique tour identifier (used to distribute tour data). |
| `tour_name` | Tour name. |
| `has_sale` | `1` if there's a future bookable date, `0` otherwise. **Crucial for importers — products with `has_sale=0` still exist but can't currently be booked.** |
| `has_d` | `1` if a tour Departure is loaded. |
| `has_f` | `1` if a tour Freesale season is loaded. |
| `has_h` | `1` if a hotel product type is loaded. |
| `descriptions_last_updated` | YYYY-MM-DD — use this for **incremental imports** (re-pull Show Tour only when this changes). |
| `delivery_formats` → `delivery_format` | Repeated. Values: `QR_CODE`, `PDF_URL`, `HTML`, `CODE128`. |
| `delivery_methods` → `delivery_method` | Repeated. Values: `TICKET` (one per person), `TOUR` (one per tour), `BOOKING` (one per whole booking). |
| `redemption_method` | `MANIFEST` / `DIGITAL` / `PRINT`. Empty if not set. |
| `options` (only when `show_options=1`) → `option` | Each with `option_id`, `option_name`, `short_description`, `from_price` (+ `_display`), `group`, `group_title`. Tour Operators also see `supplier_option_note`. |

**Tour Operator only fields** (not returned to Marketplace Agents):
- `supplier_id` — internal supplier reference number
- `supplier_tour_code` — supplier's own tour identifier (for cross-system mapping with external reservation systems)

**Sample response**:
```xml
<response>
  <request>GET /c/tours/list.xml</request>
  <error>OK</error>
  <tour>
    <channel_id>3930</channel_id>
    <account_id>4069</account_id>
    <tour_id>1</tour_id>
    <distribution_identifier>TE_4069_1</distribution_identifier>
    <tour_name>Half day rafting</tour_name>
    <has_sale>1</has_sale>
    <has_d>1</has_d>
    <has_f>0</has_f>
    <has_h>0</has_h>
    <descriptions_last_updated>2018-02-10</descriptions_last_updated>
    <delivery_formats>
      <delivery_format>QR_CODE</delivery_format>
    </delivery_formats>
    <delivery_methods>
      <delivery_method>TICKET</delivery_method>
    </delivery_methods>
    <redemption_method>DIGITAL</redemption_method>
  </tour>
  <!-- ... more <tour> nodes ... -->
</response>
```

**Suggested importer loop**:
```ts
// 1. Get the lean list (single call, gives you every tour you have access to)
const listXml = await tourcmsRequest(cfg, {
  path: "/p/tours/list.xml",       // /p/ for cross-channel as Marketplace Partner
  method: "GET",
  channelId: 0,
});
const list = parser.parse(listXml);
const tours = list.response?.tour ?? [];

// 2. For each tour, decide whether to re-fetch full details
for (const t of tours) {
  const existing = await db.getTour(t.channel_id, t.tour_id);

  // Skip the expensive Show Tour call if descriptions haven't changed
  if (existing?.descriptions_last_updated === t.descriptions_last_updated) {
    // Still update lightweight fields (has_sale, has_d/f/h) — these change frequently
    await db.upsertTourMeta({
      channel_id: t.channel_id,
      tour_id: t.tour_id,
      has_sale: t.has_sale,
      has_d: t.has_d, has_f: t.has_f, has_h: t.has_h,
    });
    continue;
  }

  // 3. Full record refresh
  const showXml = await tourcmsRequest(cfg, {
    path: `/c/tour/show.xml?id=${t.tour_id}&show_options=1`,
    method: "GET",
    channelId: t.channel_id,
  });
  const tour = parser.parse(showXml).response.tour;
  await db.upsertTour(tour);

  // 4. Optionally pull all dates (for calendar UI / availability snapshot)
  const datesXml = await tourcmsRequest(cfg, {
    path: `/c/tour/datesprices/datesndeals/search.xml?id=${t.tour_id}&distinct_start_dates=1`,
    method: "GET",
    channelId: t.channel_id,
  });
  await db.upsertTourDates(t.tour_id, parser.parse(datesXml).response);
}
```

**Cache & rate-limit notes for the importer**:
- Run nightly or per-webhook. List Tours is cheap (1 call → all tours).
- Show Tour is the expensive part — gate it with `descriptions_last_updated` as above.
- Hourly limit defaults to 2000 GET per Channel. For an importer pulling across many Channels with `/p/tours/list`, that limit applies per Channel for downstream Show Tour calls.
- **Never** cache or pre-fetch availability via `tour_checkavail` — it must be real-time at the moment the customer is choosing.

### 7.2 List Tour Images

**Endpoint**: `/c/tours/images/list` (GET) · Source: https://www.tourcms.com/support/api/mp/images_list.php
List image URLs for all Tours from a channel. Useful when mirroring assets to your own CDN.

### 7.3 Show Tour Departures

**Endpoint**: `/c/tour/datesprices/dep/show` (GET) · Source: https://www.tourcms.com/support/api/mp/tour_datesprices_departures_show.php
All dates+prices generated by Departures (not Freesale, not Hotel). Slightly more detail per date than Dates & Deals but doesn't include freesale/hotel dates.

---

## 8. Tours — Tour Operator Only

### 8.1 Delete Tour

**Endpoint**: `/c/tour/delete` (POST) · Source: https://www.tourcms.com/support/api/mp/delete_tour.php
Delete a tour from a channel.

### 8.2 Upload Files

**Endpoint**: `/c/tour/upload` (POST) · Source: https://www.tourcms.com/support/api/mp/file_upload.php
Upload images or documents (PDFs) against a tour.

### 8.3 Delete Tour Image / Delete Tour Document

**Endpoints**: `/c/tour/image/delete`, `/c/tour/document/delete` (POST) · Sources: https://www.tourcms.com/support/api/mp/tour_image_delete.php, https://www.tourcms.com/support/api/mp/tour_document_delete.php

### 8.4 Departure Management (Managing Dates & Prices Externally)

**Who**: Tour Operator only. **Overview**: https://www.tourcms.com/support/api/mp/managing_datesprices_externally.php

Family of endpoints for creating/updating Departures, Freesale seasons and Hotel pricing entirely via API. Verified against the `tourcms-js` wrapper.

#### 8.4.1 Search Raw Departures

| Endpoint | `/c/tour/datesprices/dep/manage/search` |
| --- | --- |
| **Verb** | GET |
| **Example** | `/c/tour/datesprices/dep/manage/search.xml?id={tourId}` |

Wrapper: `searchRawDepartures(channel, tourId, params)`. Returns the raw departure list (pre-markup, pre-currency-conversion). Use when you need departure IDs for subsequent show/update/delete calls.

#### 8.4.2 Show Departure

| Endpoint | `/c/tour/datesprices/dep/manage/show` |
| --- | --- |
| **Verb** | GET |
| **Example** | `/c/tour/datesprices/dep/manage/show.xml?id={tourId}&departure_id={departureId}` |

Wrapper: `showDeparture(channel, tourId, departureId)`. Full record for a single departure including raw cost/sale prices and capacity.

#### 8.4.3 Create Departure

| Endpoint | `/c/tour/datesprices/dep/manage/new` |
| --- | --- |
| **Verb** | POST |

Wrapper: `createDeparture(channel, departureData)`. POST XML `<departure>` with date/time, capacity, per-rate prices, supplier note, departure code.

#### 8.4.4 Update Departure

| Endpoint | `/c/tour/datesprices/dep/manage/update` |
| --- | --- |
| **Verb** | POST |

Wrapper: `updateDeparture(channel, departureData)`. POST XML with `departure_id` and the fields to change.

#### 8.4.5 Delete Departure

| Endpoint | `/c/tour/datesprices/dep/manage/delete` |
| --- | --- |
| **Verb** | POST |
| **Example** | `/c/tour/datesprices/dep/manage/delete.xml?id={tourId}&departure_id={departureId}` |

Wrapper: `deleteDeparture(channel, tourId, departureId)`.

#### 8.4.6 Show Tour Freesale

| Endpoint | `/c/tour/datesprices/freesale/show` |
| --- | --- |
| **Verb** | GET |
| **Example** | `/c/tour/datesprices/freesale/show.xml?id={tourId}` |

Wrapper: `showTourFreesale(channel, tourId)`. Returns Freesale seasons configured for the tour (date ranges that are always-bookable).

### 8.5 Tour File Upload (2-step pattern)

Files (images, PDFs) are uploaded in two steps: first request an upload URL, then notify TourCMS to process the upload.

| Step | Endpoint | Verb | Wrapper |
| --- | --- | --- | --- |
| 1. Get upload URL | `/c/tours/files/upload/url` | GET | `tourUploadFileGetUrl(channel, tourId, fileType, fileId)` |
| 2. Process upload | `/c/tours/files/upload/process` | POST | `tourUploadFileProcess(channel, uploadInfo)` |

The legacy single-call `file_upload.php` endpoint may still work; this 2-step pattern is what the current wrapper uses.

### 8.6 Channel Logo Upload (2-step pattern)

Same pattern as tour file upload, scoped to a Channel's logo.

| Step | Endpoint | Verb | Wrapper |
| --- | --- | --- | --- |
| 1. Get upload URL | `/c/channel/logo/upload/url` | GET | `channelUploadLogoGetUrl(channel)` |
| 2. Process upload | `/c/channel/logo/upload/process` | POST | `channelUploadLogoProcess(channel, uploadInfo)` |

---

## 9. Bookings

The full booking flow is documented at https://www.tourcms.com/support/api/mp/booking_creation.php. The required steps are:

1. **Show Tour** — get rate IDs, min/max, options structure.
2. **Check Tour Availability** — get a `component_key` and the locked-in price.
3. **(Tour Operators only)** **Get Booking Key** — needed to maintain marketplace tracking. Agents skip this step.
4. **Start New Booking** — create temporary booking holding off stock (default hold: 2700s / 45 min).
5. **Commit New Booking** — convert temporary booking to a live booking.

Subsequent operations: Show Booking, Update Booking, Cancel Booking, Add/Update/Remove Components, Add Note, Send Email, Record Payment, etc.

### 9.1 Get Booking Key (Tour Operators only)

| Endpoint | `/c/booking/new/get_redirect_url` |
| --- | --- |
| **Verb** | POST |

**Description**: Two-step redirect dance. Step 1: POST to TourCMS with the URL you want them returned to; receive `redirect_url`. Step 2: redirect the customer's browser to that URL; TourCMS processes any marketplace tracking cookies and redirects them back to your `response_url` with `booking_key` in the querystring. Valid for 24 hours per customer. **Bypass values**: `"NO_AGENT"` for staff-created bookings not assigned to an agent. For agent-assigned bookings, get the booking_key from [Agent Search](#134-agent-search) instead.

**POST body**:
```xml
<url>
  <response_url>https://example.com/step2.php</response_url>
</url>
```

**Response**:
```xml
<response>
  <request>POST /c/booking/new/get_redirect_url.xml</request>
  <error>OK</error>
  <url>
    <redirect_url>https://live.tourcms.com/.....</redirect_url>
  </url>
</response>
```

### 9.2 Start New Booking

| Endpoint | `/c/booking/new/start` |
| --- | --- |
| **Verb** | POST |

**POST body** (`<booking>` root):

| Field | Notes |
| --- | --- |
| `total_customers` | Total customers on the booking. Blank customer records are created for missing ones up to this count. |
| `booking_key` | **Required for Tour Operators**. Not used by Marketplace Agents. |
| `customer_special_request` | Multi-line free text. |
| `agent_ref` | Travel agent reference (text, ≤50 chars). Particularly important when using voucher redemption. Can also be supplied at commit. |
| `tracking_miscid` | Integer; Agents only — useful for campaign tracking. |
| `promo_code` | Promo/gift code to validate and apply. Invalid codes silently ignored. |
| `promo_membership` | Membership number if the promo code requires one. |
| `skip_inline_webhook` | Operators only; `1` to fall back to async webhooks for this single booking. |
| `components` → `component` (repeating) | Each contains: |
| &nbsp;&nbsp;`component_key` | Required. From Check Tour Availability. |
| &nbsp;&nbsp;`note` | Multi-line. |
| &nbsp;&nbsp;`pickup_key` | If chosen. If using `pickup_on_request_key`, you MUST also send `pickup_note`. |
| &nbsp;&nbsp;`pickup_note` | Free-text pickup info; required when pickup_key is the on-request key. |
| &nbsp;&nbsp;`replies` → `reply` (repeating) | Each with `question_key` (from Check Availability) and `answers` → `answer` → `answer_value`. |
| &nbsp;&nbsp;`options` → `option` (repeating) | Each with `component_key` from Check Availability. |
| &nbsp;&nbsp;`customers` → `customer` (repeating, for Named Tickets) | Each with `index` (0-based) and `rate`. |
| `customers` → `customer` (repeating) | Either provide `customer_id` for an existing customer, or supply fresh contact data. |

**Customer fields** (subset): `title`, `firstname`, `surname`, `perm_email` (1/0), `email`, `tel_home`, `tel_work`, `tel_mobile`, `tel_sms`, `address`, `city`, `county`, `postcode`, `country` (ISO-2), `middlename`, `nationality`, `gender` (`m`/`f`/`x`), `dob` (YYYY-MM-DD), `age` (`age_unit`, `age_value`), `agecat` (`i`/`c`/`a`/`s`), `pass_num`, `pass_issue`, `pass_issue_date`, `pass_expiry_date`, `wherehear`, `fax`, `contact_note`, `diet`, `medical`, `nok_name`, `nok_relationship`, `nok_tel`, `nok_contact`, `agent_customer_ref`.

**Response** (`<booking>`):
- `booking_id`, `hold_time_seconds`, `channel_id`, `account_id`, `booking_engine_url`
- `balance_owed_by` (`A` agent / `C` customer)
- Pricing: `sale_currency`, `sales_revenue`, `sales_revenue_display`, `sales_revenue_due_now` (+ `_display`), `sales_price_due_ever` (+ `_display`) — **the max amount you can take as payment now**.
- `promo` (if used): `promo_code`, `valid` (`OK`/`INVALID PROMO CODE`/`MEMBERSHIP REQUIRED`), `value`, `value_type` (`PERCENT`/`FIXED_VALUE`), `value_currency`, `customer_promo_membership`.
- `booking_fee` (if configured): `description`, `fee`, `fee_display`, `fee_type` (`PER_PERSON`/`PER_BOOKING`).
- `available_component_count`, `unavailable_component_count`, `unavailable` → `component_key`.
- `lead_customer_id`, `customers` → `customer` (`customer_id`, `firstname`, `surname`), `components` → `component` (`component_id`, `product_id`).
- If Agent: `commission`, `commission_display`, `commission_currency`, `commission_tax` (+ `_display`).
- If Tour Operator: `creditcard_fee_type`.
- On `error="SUPPLIER_SUBSYSTEM_ERROR"` you also get `supplier_subsystem_error` and `supplier_subsystem_message`. If the tour has restricted fields and validation failed, `errors` → `tour` → `restricted_fields` → `field` (`restriction`, `name`).

### 9.3 Commit New Booking

| Endpoint | `/c/booking/new/commit` |
| --- | --- |
| **Verb** | POST |

**POST body**:
```xml
<booking>
  <booking_id>12345</booking_id>
  <suppress_email>1</suppress_email>     <!-- Operators only -->
  <agent_ref>YOUR-REF-123</agent_ref>    <!-- optional -->
</booking>
```

`booking_id` may also be the booking UUID if one exists.

**Response** (`<booking>`):
- `booking_id`, `booking_uuid`, `channel_id`, `account_id`
- `status` (`0` Quote / `1` Provisional / `2` Confirmed), `status_text`
- `voucher_url`, `barcode_data`
- `components` → `component` (per-line-item operational data): `component_id`, `component_name`, `linked_component_id`, `product_id`, `product_code`, `product_note`, `sale_quantity`, `date_id`, `date_code`, `start_date`, `end_date`, `start_time`, `end_time`, `operator_reference`, `barcode_symbology` (`QR_CODE`/`CODE_128`), `tickets` → `ticket` (`value`, `label`, `seat` → `section`/`row`/`seat`), `urls` → `url` (`type` = `voucher`, `mime_type`, `link`, `label`), `rate_description`, `rate_breakdown`.

On `error="SUPPLIER_SUBSYSTEM_ERROR"`: `supplier_subsystem_error`, `supplier_subsystem_message`.

### 9.4 Show Booking

| Endpoint | `/c/booking/show` |
| --- | --- |
| **Verb** | GET |
| **Example** | `/c/booking/show.xml?booking_id=12345` |

**Querystring**:
- `booking_id` (required)
- `components_order_by_rate` — `1` to order components by rate_breakdown

**Response — `<booking>`** (extensive; selected fields):

Basic info: `booking_id`, `booking_uuid`, `channel_id`, `account_id`, `channel_name`, `made_date_time`, `start_date`, `end_date`, `booking_name`, `booking_name_custom`, `voucher_url`, `barcode_data`, `made_date_time_at_utc_seconds`, `confirmed_at_utc_seconds`, `updated_at_utc_seconds`.

Lead customer: `lead_customer_id`, `lead_customer_name`/`_firstname`/`_surname`/`_country`/`_postcode`/`_email`/`_tel_home`/`_tel_mobile`/`_contact_note`/`_birth_place`, `nationality`/`_text`, `pass_num`/`_issue`/`_issue_date`/`_expiry_date`, `lead_customer_travelling`, `customer_count`.

Customers list: `customers` → `customer` with `customer_id`, `customer_name`, `title`, `firstname`, `middlename`, `surname`, `agent_customer_ref`, `birth_place`, `country`, `postcode`, `nationality`/`_text`, `pass_num`/`_issue`/`_issue_date`/`_expiry_date`. Permission 3+: `customer_email`, `customer_tel_home`/`_tel_mobile`/`_contact_note`, `gender`, `dob` (or `age`), `agecat`, `insurance_number`, `insurance_supplier_name`, `insurance_note`. Tour Operator: `insurance_supplier_id`.

Revenue/deposit: `sale_currency`, `sales_revenue` (+ `_display`), `deposit` (+ `_display`), `cancellable`.

Status: `status` (0/1/2), `status_text`, `cancel_reason` (0–23; full list on source page), `withheld` (Expedia book-and-hold), `cancel_text`, `cancel_date_time`, `cancelled_at_utc_seconds`, `final_check`, `expiry_date` (+ `_at_utc_seconds`), `booking_has_net_price`.

Agent: `commission`, `commission_tax`, `commission_currency`, `commission_display`, `commission_tax_display`, `tracking_miscid`, `agent_ref`, `agent_ref_components`.

Payment summary: `payment_status` (0–4), `payment_status_text`, `balance_owed_by` (`C`/`A`), `balance` (+ `_display`), `balance_due`.

Components (line items): `components` → `component` with `component_id`, `redeemed_at` (+ `_at_utc_seconds`), `linked_component_id`, `product_id`/`_code`/`_note`, `date_type` (`departure`/`freesale`/`hotel`/`option`/`fee`), `date_id`, `tour_promotions` → `tour_promotion` (`promo_name`, `promo_discount_percentage`), `promo_apply`, `date_code`, `start_date`/`end_date`/`start_time`/`end_time`, `component_name`, `product_type`, `sale_quantity`, `local_payment`, `note`, `supplier_note`, `operator_reference`, `barcode_symbology`, `tickets` (with `seat`), `urls`, `questions` (with `q` → `question_key`/`question`/`explanation`/`placeholder`/`question_internal`/`repeat`/`repeat_type`/`answer_type`/`answer_mandatory`/`answers`), `guide_language`, `redeem`, `receipt_info`, `pickup_id` (-1 for on-request), `pickup_name`, `pickup_time`, `pickup_note`, `pickup_description`, `pickup_route_code`, `voucher_redemption_status` (0/1), `bus_checkin_status`, `customers` → `customer` → `customer_id` (named-ticket associations).

Price details per component: `rate_description`, `rate_breakdown` (e.g. `r1|a`), `sale_tax_inclusive`, `sale_quantity_rule` (`PERSON`/`GROUP`), `sale_currency`, `sale_price`, `sale_tax_percentage`, `tax_total`, `sale_price_inc_tax_total`, `net_price`, `net_price_quantity_rule`, `net_price_tax_total`, `net_price_inc_tax_total`, `sale_exchange_rate`, `currency_base`, `sale_price_base`, `tax_total_base`, `sale_price_inc_tax_total_base`. Tour Operator only: `rate_code`, `supplier_id`/`_subsystem_credentials`/`_ref`/`_tour_code`/`_option_note`/`_name`, `operational_note`, full cost block (`cost_quantity`, `cost_tax_inclusive`, `cost_quantity_rule`, `cost_currency`, `cost_price`, `cost_tax_percentage`, `cost_tax_total`, `cost_price_inc_tax_total`, `cost_exchange_rate`, `cost_price_base`, `cost_tax_total_base`, `cost_price_inc_tax_total_base`), `component_added_datetime`, `upsell_username`.

Permission 3+ extras: `customer_special_request`, `customers_agecat_breakdown` (e.g. "2 Adults"), `payments` → `payment` (`payment_date_time`, `payment_value`, `payment_currency`, `payment_value_display`, `payment_type`, `gateway_mode`, `payment_reference`, `payment_transaction_reference`, `payment_note`, `paid_by` (C/A), `paid_by_id`), `promo` (`promo_code`, `valid`, `value`, `value_type`, `value_currency`, `customer_promo_membership`).

Tour Operator only: `important_note`, `workflow_note`, `agent_name`/`_code`/`_id`, `marketplace_agent_id`, `agent_type` (`TRACK`/`AFFILIATE`/`RETAIL`/`TRUSTED`), `agent_credentials`, `custom_fields`.

### 9.5 List Bookings

| Endpoint | `/p/bookings/list` (cross-Channel) **or** `/c/bookings/list` (single Channel) |
| --- | --- |
| **Verb** | GET |

**Querystring**:
- Date ranges (all YYYY-MM-DD): `made_date_start` + `made_date_end`; `start_date_start` + `start_date_end`; `end_date_start` + `end_date_end`; `cancel_date_start` + `cancel_date_end`
- `channel_id_booking_id` — e.g. `10_8,10_100`
- `per_page` (default & max 250), `page` (default 1)
- `customer_id` (requires Channel ID in header)
- `agent_ref`, `booking_id`, `pii` (lead customer email or surname match), `account_id`, `channel_ids` (CSV)

**Response — top-level**: `request`, `error`, `total_bookings_count`, `bookings` → `booking` repeated. Each `<booking>` contains the same key fields as Show Booking but in a more compact form (no per-component price breakdown, no payments unless permission 3+, etc.). Also includes `components` → `component` with `start_time_utcseconds`/`end_time_utcseconds`, `customer_payment` (agent split), `voucher_redemption_username`.

Use Show Booking for the full record on a specific booking.

### 9.6 Update Booking

| Endpoint | `/c/booking/update` |
| --- | --- |
| **Verb** | POST |

**Notes**: Tour Operators can update many fields; Marketplace Agents can only update `agent_ref` and must use [Add Note to Booking](#98-add-note-to-booking) for other changes.

**POST body**:
```xml
<booking>
  <booking_id>12345</booking_id>
  <!-- any subset of allowed fields -->
</booking>
```

**Updatable fields** (Tour Operator unless noted):
- `agent_ref` (also for Agents)
- `booking_name_custom` (empty = revert to auto-calculated name)
- `final_check` (0/1)
- `customer_special_request`
- `important_note` (pinned note)
- `workflow_note`
- `customers` → `customer` (`customer_id`, `insurance_number`, `insurance_note`) — for booking-specific insurance info
- `custom_fields` → `field` (`name`, `value`)

**Response**: `error` is `OK` on success, or `NO DATA CHANGED` if values matched existing (treat as success). `booking` → `booking_id`, `channel_id`, `account_id`.

### 9.7 Cancel Booking

| Endpoint | `/c/booking/cancel` |
| --- | --- |
| **Verb** | POST |

Cancels a committed booking. Temporary bookings should be deleted, not cancelled.

**POST body**:
```xml
<booking>
  <booking_id>12345</booking_id>
  <cancel_reason>22</cancel_reason>           <!-- optional; default 22 -->
  <note>Optional staff-facing note</note>
  <suppress_email>0</suppress_email>          <!-- Operators only -->
  <refund>0</refund>                          <!-- 1 to send refund email -->
  <allow_cancel_after_start_date>0</allow_cancel_after_start_date>
</booking>
```

`booking_id` may also be UUID.

**Response**:
- `OK` — success
- `PREVIOUSLY CANCELLED` — already cancelled; treat as success
- `CANCELLATION DATE EXCEEDED` — only when `allow_cancel_after_start_date=1` and we're past the start

### 9.8 Add Note to Booking

| Endpoint | `/c/booking/note/new` |
| --- | --- |
| **Verb** | POST |

**Note types**:
- `AUDIT` — log only (least visible)
- `SERVICE` — customer-facing note in Notes section
- `MODIFY` — sets a Modification Request flag, notifies staff. **Agents use this for change requests.**

**POST body**:
```xml
<booking>
  <booking_id>12345</booking_id>
  <note>
    <type>AUDIT</type>
    <text>Some information to store</text>
  </note>
</booking>
```

**Response**: `error` is `OK` on success.

### 9.9 Send Booking Email

| Endpoint | `/c/booking/email/send` |
| --- | --- |
| **Verb** | POST |
| **Who** | Tour Operators (Agents only with permission and the right email type). |

**Email types** (`email_type` integer):
`1` New booking · `2` Provisional · `3` Confirmed #1 · `4` Pre-trip #1 · `5` Post-trip #1 · `6` Expired quotation · `7` Expired provisional · `8` Ad-hoc mass · `9` Balance due SOON · `10` Balance due NOW · `11` Balance OVERDUE · `12` Quotation chaser · `13` Provisional chaser · `14` Mid-trip · `15` Booking anniversary · `16` Post-trip #2 · `17` Payment acknowledgement · `18` Deposit chaser · `19` Pre-trip #2 · `20` Pre-trip #5 · `21` Supplier notification (Confirmed) · `22` Payment failed · `23` Pre-trip #3 · `24` Pre-trip #4 · `28` Confirmed #2 · `29` Cancel #1 · `30` Cancel #2 · `31` Payment refund · `32` Supplier notification (Cancel) · `33` Manage my booking.

**POST body**:
```xml
<booking>
  <booking_id>12345</booking_id>
  <email_type>1</email_type>
</booking>
```

### 9.10 Add Booking Component

| Endpoint | `/c/booking/component/new` |
| --- | --- |
| **Verb** | POST |
| **Who** | Tour Operator only. (Agents must use Add Note with type `MODIFY`, or cancel + rebook.) |

Bookings must be committed (non-temporary), non-archived.

**POST body**:
```xml
<booking>
  <booking_id>12345</booking_id>
  <component>
    <component_key>AAA...</component_key>      <!-- from Check Availability, OR "ADD_OPTION_TO_EXISTING_TOUR" -->
    <note>...</note>
    <pickup_key>...</pickup_key>
    <pickup_note>...</pickup_note>
    <nocommission>0</nocommission>             <!-- 1 = block commission, flag as up-sell -->
    <replies>
      <reply>
        <question_key>...</question_key>
        <answers><answer><answer_value>...</answer_value></answer></answers>
      </reply>
    </replies>
    <options>
      <option>
        <component_key>...</component_key>     <!-- from Check Availability OR from Check Option Availability if adding to an existing tour -->
      </option>
    </options>
  </component>
</booking>
```

### 9.11 Update Booking Component

| Endpoint | `/c/booking/component/update` |
| --- | --- |
| **Verb** | POST |
| **Who** | Tour Operator only. |

**Updatable fields** inside `<component>`:
- `component_id` (required)
- `date_id` — quick-change to a different departure (does NOT validate availability/prices; pre-validate yourself with Check Availability)
- `note`
- `pickup_key` (set to `UPDATE` to update an existing pickup), `pickup_note`, `pickup_time`, `pickup_route_code`
- `supplier_ref`
- `sale_quantity`, `sale_quantity_rule` (`PERSON`/`GROUP`), `sale_price`
- `net_quantity_rule`, `net_price`
- `customer_payment` (1 to mark as paid by customer on an agent-payable booking)
- `replies` → `reply` (`question_key`, `answers` → `answer` → `answer_value`)

### 9.12 Remove Booking Component

| Endpoint | `/c/booking/component/delete` |
| --- | --- |
| **Verb** | POST |

```xml
<booking>
  <booking_id>12345</booking_id>
  <component>
    <component_id>1</component_id>
  </component>
</booking>
```

### 9.13 Delete (Temporary) Booking

**Endpoint**: `/c/booking/delete` (POST) — only works on **temporary** (pre-commit) bookings, useful for releasing held stock when a cart is abandoned. Source: https://www.tourcms.com/support/api/mp/booking_delete.php

---

## 10. Payments

### 10.1 Record Payment / Refund

| Endpoint | `/c/booking/payment/new` |
| --- | --- |
| **Verb** | POST |
| **Who** | Tour Operator only. |

**Description**: Log a payment (or refund — use negative `payment_value`) on a booking. Works on both committed and temporary bookings (it'll show up alongside other payments once committed). If the channel is configured for status-on-payment, this may move the booking to Provisional/Confirmed and trigger the relevant email.

**POST body** (`<payment>` root):

| Field | Notes |
| --- | --- |
| `booking_id` | Required. |
| `payment_value` | Numeric (negative = refund). |
| `payment_currency` | E.g. `GBP`. Optional. |
| `payment_type` | Free text e.g. `Credit Card`. |
| `payment_reference` | Free text reference. |
| `payment_transaction_reference` | Specific gateway-formatted reference (e.g. `WORL|1224`) — enables later refunds. |
| `payment_note` | Free text. |
| `paid_by` | `C` (customer) or `A` (agent). |
| `gateway_mode` | `web`, `pos`, or `moto`. |
| `creditcard_fee_type` | Use the value returned by Start New Booking. |

Source: https://www.tourcms.com/support/api/mp/payment_create.php

### 10.2 Create Spreedly Payment

| Endpoint | `/c/booking/payment/spreedly/new` |
| --- | --- |
| **Verb** | POST |
| **Who** | Tour Operator OR Marketplace Agent (with Spreedly Environment Key from Show Channel). |

**Description**: Charge a Spreedly-vaulted card token. On success TourCMS commits the booking if not already committed and records the payment — **so you do NOT need to also call Commit New Booking**.

**POST body**:
```xml
<payment>
  <spreedly_payment_method>SPREEDLY_PAYMENT_METHOD_TOKEN</spreedly_payment_method>
  <booking_id>8400</booking_id>
  <payment_value>10</payment_value>
  <currency>GBP</currency>
</payment>
```

If payment fails, you can show the error to the client and let them retry, or commit + record-fail. Source: https://www.tourcms.com/support/api/mp/spreedly_payment_create.php

### 10.3 List Payments

| Endpoint | `/c/booking/payment/list` |
| --- | --- |
| **Verb** | GET |

**Description**: Payment list for a period. Defaults to today if no dates passed. Operators and Agents.

**Querystring**:
- `from_date`, `to_date` (YYYY-MM-DD)
- `from_time`, `to_time` (HH:MM:SS)
- `staff_user_payments` — staff username (Operators only)
- `per_page` (default & max 1000), `page`

**Response — `<payments>` → `<payment>`**: `payment_id`, `booking_id`, `booking_status`, `booking_name`, `account_id`, `channel_id`, `staff_username`, `payment_date_time`, `payment_value`, `refunded_value`, `payment_currency`, `payment_type`, `payment_reference`, `payment_note`, `paid_by` (`C`/`A`), `paid_by_id`, `payment_transaction_reference`, `gateway_mode`. Top-level: `total_payments`.

### 10.4 Log Failed Payment

**Endpoint**: `/c/booking/payment/fail/new` (POST) · Wrapper: `logFailedPayment(channel, paymentData)` · Source: https://www.tourcms.com/support/api/mp/payment_log_fail.php
Log a failed payment attempt into the booking audit trail. Triggers the "Failed payment email" if configured.

> **Note**: Wrapper-observed path is `/c/booking/payment/fail.xml` (without `/new`). Both forms exist; the wrapper uses the shorter path.

### 10.5 Spreedly — Complete Transaction

| Endpoint | `/c/booking/gatewaytransaction/spreedlycomplete` |
| --- | --- |
| **Verb** | POST |
| **Example** | `/c/booking/gatewaytransaction/spreedlycomplete.xml?id={transactionId}` |
| **Wrapper** | `spreedlyCompletePayment(channel, transactionId)` |

**Description**: Used to complete a Spreedly transaction after 3DSecure / SCA challenge flows where the initial `spreedly_payment_create` call returned a pending state. Pass the gateway transaction ID returned by Spreedly.

### 10.6 Payworks Payment

| Endpoint | `/c/booking/payment/payworks/new` |
| --- | --- |
| **Verb** | POST |
| **Wrapper** | `payworksBookingPaymentNew(channel, payment)` |

**Description**: Payworks-specific payment creation endpoint, analogous to Spreedly's. Use if your operator has Payworks configured as their gateway.

---

## 11. Vouchers

Voucher redemption supports tour operator ticket booths and check-in agents. There are two endpoints. API credentials for ticket booths should typically be a Marketplace Agent account per booth (Tour Operators must explicitly grant redemption access on each agent record). For testing, use the **TourCMS Example Tour Operator** (channel 3930) and Tour ID 1 ("Half day rafting") which has daily availability.

### 11.1 Search Vouchers

| Endpoint | `/c/voucher/search` |
| --- | --- |
| **Verb** | POST |

**Description**: Find bookings + components that match a voucher barcode, optionally with date scope.

**POST body**:
```xml
<voucher>
  <barcode_data>12345</barcode_data>     <!-- contents of scanned barcode, OR "TOURCMS|account_id|booking_id", OR just a TourCMS booking_id, OR a surname (partial-start match) -->
  <surname>Bloggs</surname>              <!-- specific surname search -->
  <surname_start>Khan</surname_start>    <!-- matches "Khan" but not "Beckham" -->
  <wide_dates>0</wide_dates>             <!-- 1 = search last 60 → next 60 days, default 0 = today only -->
</voucher>
```

**Response — per `<booking>`**:
- `booking_id`, `account_id`, `booking_valid` (`OK` / `INVALID BOOKING`), `booking_valid_reason`, `channel_id`, `channel_name`, `logo_url`, `lead_customer_id`/`_name`/`_firstname`/`_surname`, `sale_currency`, `balance` (+ `_display`), `balance_owed_by` (`A`/`C`), `has_local_payment`, `agent_ref`, `promo_code_question`, `customer_special_request`
- If valid: `component` (repeating, due to start today) → `component_id`, `name`, `code`, `rate_description`, `sale_quantity_description`, `start_date`, `end_date`, `note`, `voucher_redemption_status` (0/1), **`redeem_voucher_key`** (if not yet redeemed), **`redeem_voucher_key_reverse`** (if already redeemed), `bus_checkin_status`, `bus_checkin_key`/`_reverse`, `questions` (with `q` → all question fields including `answers`).

### 11.2 Redeem Voucher

| Endpoint | `/c/voucher/redeem` |
| --- | --- |
| **Verb** | POST |

**Description**: Check in (or reverse a check-in) using a key from Voucher Search. Only confirmed (non-cancelled) bookings can be redeemed.

**POST body**:
```xml
<voucher>
  <key>REDEEM_KEY_HERE</key>             <!-- redeem_voucher_key OR redeem_voucher_key_reverse OR bus_checkin_key OR bus_checkin_key_reverse -->
  <note>Optional note (e.g. ticket booth ID)</note>
</voucher>
```

**Response**:
- `OK` — success
- `NO CHANGE` — no state change (idempotent re-redeem/reverse)
- Returns a fresh `redeem_voucher_key_reverse` / `redeem_voucher_key` / `bus_checkin_key_reverse` / `bus_checkin_key` so you can immediately flip state again.

---

## 12. Customers & Enquiries

### 12.1 Show Customer

| Endpoint | `/c/customer/show` |
| --- | --- |
| **Verb** | GET |
| **Example** | `/c/customer/show.xml?customer_id=12345` |

**Permission**: Operators see everything. Agents see based on permission level:
- Level 1: nothing
- Level 2: basic name fields only
- Level 3: everything except username/password

**Response — `<customer>`** (selected; full set on source):
- Always (perm 2+): `customer_id`, `channel_id`, `account_id`, `title`, `firstname`, `middlename`, `surname`, `customer_name`, `staff`
- Perm 3+: `perm_email`, `email`, `tel_home`/`_work`/`_mobile`/`_sms`, `address`/`city`/`county`/`postcode`/`country`/`_text`, `birth_place`, `fax`, `nationality` (+ `_text`), `gender`, `dob` (or `age`), `agecat` (+ `_text`), `pass_num`/`_issue`/`_issue_date`/`_expiry_date`, `wherehear`, `contact_note`, `diet`, `medical`, `nok_name`/`_relationship`/`_tel`/`_contact`, `agent_customer_ref`
- Tour Operator only: `customer_username`/`_password`, `agent_name`/`_code`/`_id`, `tokenized_payment_details` (`billing_id`, `billing_id_type`, `payer_name`, `payment_method_type`, `payment_method_number`, `payment_method_expiry`), `custom_fields`, `external_customer_profile`

### 12.2 Update Customer

| Endpoint | `/c/customer/update` |
| --- | --- |
| **Verb** | POST |

**Who**: Tour Operators can update any customer; Agents (with permission 3) can update customers they created, except `customer_username`/`_password` and custom fields.

**POST body** (`<customer>` root):
`customer_id` (required) + any of: `perm_email`, `title`, `firstname`/`middlename`/`surname`, `email`, `birth_place`, `tel_*`, `contact_note`, address fields, `country`, `nationality`, `gender`, `dob`, `agecat`, `age` (`age_unit`, `age_value`), `pass_*`, `wherehear`, `diet`, `medical`, `nok_*`, `agent_customer_ref`.

Tour Operator only: `customer_username` (6–12 chars, A-Z/a-z/0-9), `customer_password` (empty = disable login; invalid format silently ignored), `tokenized_payment_details`, `custom_fields`.

**Response**: `OK` or `NO DATA CHANGED` (treat as success).

### 12.3 Create Customer

| Endpoint | `/c/customer/create` |
| --- | --- |
| **Verb** | POST |
| **Who** | Tour Operator only. |

```xml
<customer>
  <email>test@example.com</email>
  <username>test@example.com</username>   <!-- optional; if omitted, defaults to email; if supplied MUST match email -->
  <firstname>Tester</firstname>
  <surname>Test</surname>
</customer>
```

**Response**: `aid` (operator account ID), `customer_id`.

### 12.4 Customer Verification

| Endpoint | `/c/customer/verification` |
| --- | --- |
| **Verb** | POST |
| **Who** | Tour Operator only. |

**Description**: Two-step token verification flow. Step 1 looks up the customer by username and sends them a magic link; step 2 exchanges the token for a verified customer ID.

**Step 1 body**:
```xml
<customer>
  <verification_methods>
    <method>CHECKEMAIL</method>
  </verification_methods>
  <username>a@a.a</username>
  <redirect_url>https://yoursite/myaccount/</redirect_url>
  <token_placement>QUERYSTRING</token_placement>  <!-- or PATH (default QUERYSTRING) -->
</customer>
```

**Step 2 body**:
```xml
<customer>
  <token>RECEIVED_TOKEN_FROM_REDIRECT</token>
</customer>
```

**Responses**: Step 1 returns `message`. Step 2 returns `customer_id`.

### 12.5 Customer Login Search

| Endpoint | `/c/customers/login_search` |
| --- | --- |
| **Verb** | GET |
| **Who** | Tour Operator only. |
| **Example** | `/c/customers/login_search.xml?customer_username=jbloggs123&customer_password=password` |

**Querystring**: `username`, `password` (optional — verify-username-only flow).

**Response**: `<customer>` with `customer_id`, `channel_id`, `account_id`, `title`, `firstname`/`middlename`/`surname`, `customer_name`.

### 12.6 Create Customer/Enquiry

| Endpoint | `/c/enquiry/new` |
| --- | --- |
| **Verb** | POST |
| **Who** | Marketplace Agents only. (Operators post forms directly to TourCMS.) |

**POST body** (`<enquiry>` root):

Commonly used: `customer_id` (to update an existing customer record), `title`, `firstname`, `surname`, `email`, `tel_home`, `address`, `city`, `county`, `postcode`, `country`, `enquiry_detail`.

Less commonly used: `enquiry_type` ("Brochure", "Tailor-made", etc.), `enquiry_category`, `enquiry_assignto`, `enquiry_value`, `enquiry_outcome`, `enquiry_followup_date`, `middlename`, `nationality`, `gender`, `dob`, `agecat`, `pass_*`, `wherehear`, `fax`, `tel_work`/`_mobile`/`_sms`, `contact_note`, `diet`, `medical`, `nok_*`.

**Response** (`<enquiry>`): `channel_id`, `account_id`, `enquiry_id`, `customer_id`.

### 12.7 Search Enquiries

| Endpoint | `/p/enquiries/search` (cross-Channel) **or** `/c/enquiries/search` (single Channel) |
| --- | --- |
| **Verb** | GET |

Agents need permission level 2+ on the channel.

**Querystring** (all optional): `made_date_start`/`_end`, `unique` (1 to dedupe across multi-channel accounts), `customer_id` (requires Channel ID), `per_page` (default 100, max 500), `page`.

**Response — per `<enquiry>`**: `channel_id`, `account_id`, `enquiry_id`, `customer_id`, `made_date_time`, `status` (0–6), `status_text`, `type`, `category`, `detail`, `value`, `outcome`, `followup_date`, `closed_date_time`. Top-level: `total_enquiries_count`.

**Enquiry statuses**: `0` Triage · `1` Open (Staff) · `2` Open (Customer) · `3` Open (Agent) · `4` Open (Supplier) · `5` Closed/Solved (Success/Booked) · `6` Solved (Failure/Not Booked).

### 12.8 Show Enquiry

| Endpoint | `/c/enquiry/show` |
| --- | --- |
| **Verb** | GET |
| **Example** | `/c/enquiry/show.xml?enquiry_id=12345` |

Returns the same `<enquiry>` shape as Search Enquiries, restricted to one record.

### 12.9 Show Promo Code

**Endpoint**: `/c/promo/show` (GET) · Source: https://www.tourcms.com/support/api/mp/promo_show.php
Validates a promo/gift code for a channel without creating a booking. Reports whether a membership number is required and the expected format.

---

## 13. Agents

### 13.1 Show Agent Profile / 13.2 Update Agent Profile

**Endpoints**: `/c/agent_profile/show` (GET), `/c/agent_profile/update` (POST). Manage Marketplace Agent's own profile information. Sources: https://www.tourcms.com/support/api/mp/show_agent_profile.php, https://www.tourcms.com/support/api/mp/update_agent_profile.php

### 13.3 Agent Search

**Endpoint**: `/c/agents/search` (GET) · **Who**: Tour Operator only. · Source: https://www.tourcms.com/support/api/mp/agent_search.php
List/search travel agents on the account. Used to obtain a `booking_key` for an agent-attributed booking (alternative to the public-website `Get Booking Key` flow).

### 13.4 Agent Update

**Endpoint**: `/c/agent/update` (POST) · **Who**: Tour Operator only. · Source: https://www.tourcms.com/support/api/mp/agent_update.php
Update fields on a specific agent.

### 13.5 Remote Agent Login

**Endpoint**: `/c/agent/remote_login` (GET/POST) · **Who**: Tour Operator only. · Source: https://www.tourcms.com/support/api/mp/remote_agent_login.php
Allow Marketplace travel agents to log into your website to book on behalf of customers.

### 13.6 Start New Agent Login

| Endpoint | `/c/start_agent_login` |
| --- | --- |
| **Verb** | POST |
| **Wrapper** | `startNewAgentLogin(channel, params)` |

**Description**: Initiate an agent login session — wrapper-observed endpoint that creates a server-side login state and returns a token. Pair with **Retrieve Agent Booking Key** below to complete the flow and obtain a `booking_key` for subsequent Start New Booking calls.

### 13.7 Retrieve Agent Booking Key

| Endpoint | `/c/retrieve_agent_booking_key` |
| --- | --- |
| **Verb** | GET |
| **Example** | `/c/retrieve_agent_booking_key.xml?k={privateToken}` |
| **Wrapper** | `retrieveAgentBookingKey(channel, privateToken)` |

**Description**: Exchange the private token from `startNewAgentLogin` for a `booking_key` representing the authenticated agent. Use this key when calling [Start New Booking](#92-start-new-booking) as a Tour Operator on behalf of a logged-in travel agent (alternative to the public `getBookingRedirectUrl` flow).

---

## 14. Internal Suppliers & Staff

### 14.1 Show Supplier

**Endpoint**: `/c/supplier/show` (GET) · **Who**: Tour Operator only. · Source: https://www.tourcms.com/support/api/mp/supplier_show.php
View details of an internal supplier record (the entities behind tour cost prices).

### 14.2 Staff Members List

**Endpoint**: `/c/staff_members/list` (GET) — also wrapper-observed as `/c/staff/list` · **Who**: Tour Operator only. · Wrapper: `listStaffMembers(channel)` · Source: https://www.tourcms.com/support/api/mp/staff_members_list.php
List staff members on the channel — useful with `staff_user_payments` on List Payments.

### 14.3 Account Admin

Marketplace-level account management. Used when programmatically provisioning new TourCMS accounts (e.g. white-label reseller flows).

| Op | Endpoint | Verb | Wrapper |
| --- | --- | --- | --- |
| Create Account | `/p/account/create` | POST | `createAccount(uploadInfo)` |
| Update Account | `/p/account/update` | POST | `updateAccount(channel, uploadInfo)` |
| Show Account | `/p/account/show` | GET | `showAccount(accountId)` — example: `/p/account/show.xml?account_id={id}` |

---

## 15. Pickup Points & Tour Pickup Routes

Overview pages:
- Pickup points: https://www.tourcms.com/support/api/mp/pickup_point_managing.php
- Tour Pickup Routes (no dedicated overview page; endpoints below)

All Tour Operator only.

### 15.1 Pickup Points (account-wide)

All Tour Operator only. Wrapper paths differ from the legacy doc URLs — both forms shown.

| Op | Doc path | Wrapper path | Verb | Wrapper method |
| --- | --- | --- | --- | --- |
| Create | `/c/pickup/create` | `/c/pickups/new` | POST | `createPickup(channel, pickupData)` |
| Delete | `/c/pickup/delete` | `/c/pickups/delete` | POST | `deletePickup(channel, pickupData)` |
| Update | `/c/pickup/update` | `/c/pickups/update` | POST | `updatePickup(channel, pickupData)` |
| List | `/c/pickups/list` | `/c/pickups/list` | GET | `listPickups(channel, params)` |

Typical pickup fields: `pickup_id`, `pickup_name`, `description`, `address1`, `address2`, `postcode`, `geocode`, plus per-route-link metadata when attached to a tour.

### 15.2 Tour Pickup Routes (per-tour ordered pickup lists)

All Tour Operator only. Wrapper uses `/api/tours/pickup/routes/...` prefix; legacy doc URLs use `/c/tour/pickup_routes/...`.

| Op | Doc path | Wrapper path | Verb | Wrapper method |
| --- | --- | --- | --- | --- |
| Show routes | `/c/tour/pickup_routes/show` | `/api/tours/pickup/routes/show` | GET | `showToursPickupRoutes(channel, tourId)` |
| Update route | `/c/tour/pickup_routes/update` | `/api/tours/pickup/routes/update` | POST | `updateToursPickupRoutes(channel, data)` |
| Add pickup to route | `/c/tour/pickup_routes/pickup/add` | `/api/tours/pickup/routes/pickup_add` | POST | `toursPickupRoutesAddPickup(channel, data)` |
| Update pickup in route | `/c/tour/pickup_routes/pickup/update` | `/api/tours/pickup/routes/pickup_update` | POST | `toursPickupRoutesUpdatePickup(channel, data)` |
| Delete pickup from route | `/c/tour/pickup_routes/pickup/delete` | `/api/tours/pickup/routes/pickup_delete` | POST | `toursPickupRoutesDeletePickup(channel, data)` |

---

## 16. Tour GEO Points & Tour Tiers

### 16.1 Tour GEO Points

Overview: https://www.tourcms.com/support/api/mp/tour_geopoint_managing.php — Tour Operator only. Wrapper uses `/api/tours/geos/...` prefix.

| Op | Doc path | Wrapper path | Verb | Wrapper method |
| --- | --- | --- | --- | --- |
| Create | `/c/tour/geopoint/create` | `/api/tours/geos/create` | POST | `createTourGeopoint(channel, geopoint)` |
| Update | `/c/tour/geopoint/update` | `/api/tours/geos/update` | POST | `updateTourGeopoint(channel, geopoint)` |
| Delete | `/c/tour/geopoint/delete` | `/api/tours/geos/delete` | POST | `deleteTourGeopoint(channel, geopoint)` |

Fields: `geocode`, `label`, `google_place_id`, `loc_relation` (0 None / 1 Admission Granted / 2 Supplementary Add-on), `geo_order`, `can_start_end_here`. Equivalent to the `midpoint` entries on Show Tour.

### 16.2 Tour Tiers (volume-pricing rate scales)
Tour Operator only.
- **Create Tier**: `/c/tour/tier/add` (POST) — https://www.tourcms.com/support/api/mp/tour_tier_add.php
- **Delete Tier**: `/c/tour/tier/delete` (POST) — https://www.tourcms.com/support/api/mp/tour_tier_delete.php
- **Update Tier**: `/c/tour/tier/update` (POST) — https://www.tourcms.com/support/api/mp/tour_tier_update.php
- **Show Tier**: `/c/tour/tier/show` (GET) — https://www.tourcms.com/support/api/mp/tour_tier_show.php
- **List Tiers**: `/c/tour/tier/list` (GET) — https://www.tourcms.com/support/api/mp/tour_tier_list.php

Fields per tier: `scale_from`, `scale_to`, `sale_price` (linked to a `rate_id`).

---

## 17. Account Custom Fields & Tour Import

### 17.1 List Custom Fields

| Endpoint | Doc path: `/c/custom_fields/get` · Wrapper path: `/api/account/custom_fields/get` |
| --- | --- |
| **Verb** | GET |
| **Who** | Tour Operator only. |
| **Wrapper** | `getCustomFields(channel)` |

Source: https://www.tourcms.com/support/api/mp/custom_fields_get.php
Returns the schema of extra tour content fields configured at account level — `name`, `value` keys you can pass to Update Tour / Update Booking custom_fields blocks.

### 17.2 Tour Import (sub-system bulk import)

For Tour Operators importing tours from an external subsystem. Wrapper uses `/api/tours/importer/...` prefix.

| Op | Doc URL | Wrapper path | Verb | Wrapper method |
| --- | --- | --- | --- | --- |
| Get Tour Facets | `tour_facets_get.php` | `/api/tours/importer/get_tour_facets` | GET | `getTourFacets(channel)` |
| Get Tour List | `tour_list_get.php` | `/api/tours/importer/get_tour_list` | GET | `getListTours(channel, params)` |
| Get Import Status | `import_tours_status_get.php` | `/api/tours/importer/get_import_tours_status` | POST | `getImportToursStatus(channel, codes)` |

### 17.3 List Tour Booking Restrictions

| Endpoint | Wrapper path: `/api/tours/restrictions/list_tour_bookings_restrictions` |
| --- | --- |
| **Verb** | GET |
| **Wrapper** | `listTourBookingRestrictions(channel, params)` |

Source: https://www.tourcms.com/support/api/mp/list_tour_booking_restrictions.php
Lists field restrictions configured for specific tours (which customer fields are required/rejected per scope: `allpax`, `leadpax`, `otherpax`).

---

## 18. Notes on Tour Operator vs. Marketplace Agent

| Concept | Tour Operator | Marketplace Agent |
| --- | --- | --- |
| `MARKETPLACE_ID` in signature | `0` | Agent's marketplace ID |
| `Channel ID` per call | Own Channel ID | Channel ID being targeted, OR `0` for cross-Channel `/p/` calls |
| Get Booking Key step | **Required** before Start New Booking | Skip |
| Endpoints under `/p/` | Forbidden (`FAIL_PARTNERSONLY`) | Required path for cross-Channel actions |
| Show Booking visibility | Full | Filtered by permission level 1/2/3 granted by Channel owner |
| Show Customer visibility | Full | Level 1 nothing, level 2 basic name, level 3 everything except username/password |
| Add Booking Component | Allowed | Not allowed — use Add Note (type `MODIFY`) |
| Update Booking | All fields | Only `agent_ref` |
| Cancel Booking | Allowed | Allowed (on own bookings) |
| Booking statuses on commit | Confirmed | Quotation / Provisional unless granted Trusted Travel Agent status |

**Permission levels** (set per-Channel by the Tour Operator):
- **1** Sell only / no booking access — affiliate-style PPC/listing fee
- **2** Summary statistics — top-level click/booking summary, basic booking info
- **3** Full booking details — full booking + customer record access (own bookings only)

---

## 19. Implementation Notes for `lib/tourcms.ts`

### Recommended TypeScript native fetch wrapper

```ts
// lib/tourcms.ts
import crypto from "node:crypto";

const BASE_URL = "https://api.tourcms.com";  // verify exact host with TourCMS support; the docs use relative paths

export interface TourCMSConfig {
  channelId: number;       // 0 for cross-channel /p/ calls as an agent
  marketplaceId: number;   // 0 for tour operators
  apiKey: string;
  userAgent?: string;
}

interface TourCMSRequest {
  path: string;             // e.g. "/c/tour/show.xml?id=1"
  method: "GET" | "POST";
  body?: string;            // XML string for POST
  channelId?: number;       // override default
}

export function signRequest(
  cfg: TourCMSConfig,
  method: "GET" | "POST",
  path: string,
  channelId: number,
  outboundTime: number,
): string {
  const stringToSign = `${channelId}/${cfg.marketplaceId}/${method}/${outboundTime}/${path.replace(/^\//, "")}`;
  const hmac = crypto.createHmac("sha256", cfg.apiKey).update(stringToSign).digest("base64");
  return encodeURIComponent(hmac);
}

export async function tourcmsRequest(
  cfg: TourCMSConfig,
  req: TourCMSRequest,
): Promise<string> {
  const channelId = req.channelId ?? cfg.channelId;
  const outboundTime = Math.floor(Date.now() / 1000);
  const dateHeader = new Date(outboundTime * 1000).toUTCString();
  const signature = signRequest(cfg, req.method, req.path, channelId, outboundTime);

  const headers: Record<string, string> = {
    "x-tourcms-date": dateHeader,
    Authorization: `TourCMS ${channelId}:${cfg.marketplaceId}:${signature}`,
    "User-Agent": cfg.userAgent ?? "next-tourcms/1.0",
  };
  if (req.method === "POST") headers["Content-Type"] = "application/xml";

  const res = await fetch(`${BASE_URL}${req.path}`, {
    method: req.method,
    headers,
    body: req.method === "POST" ? req.body : undefined,
  });

  if (!res.ok) throw new Error(`TourCMS HTTP ${res.status}`);
  return await res.text();   // XML — parse with fast-xml-parser or similar
}

// Example helpers
export async function rateLimitStatus(cfg: TourCMSConfig) {
  return tourcmsRequest(cfg, { path: "/api/rate_limit_status.xml", method: "GET" });
}

export async function searchTours(cfg: TourCMSConfig, qs: Record<string, string>, channelId?: number) {
  const search = new URLSearchParams(qs).toString();
  const scope = (channelId ?? cfg.channelId) === 0 ? "/p/tours/search.xml" : "/c/tours/search.xml";
  return tourcmsRequest(cfg, { path: `${scope}?${search}`, method: "GET", channelId });
}

export async function showTour(cfg: TourCMSConfig, tourId: number, channelId: number, opts?: { show_options?: 1; show_offers?: 1; show_questions?: 1 }) {
  const qs = new URLSearchParams({ id: String(tourId), ...(opts ?? {}) as any }).toString();
  return tourcmsRequest(cfg, { path: `/c/tour/show.xml?${qs}`, method: "GET", channelId });
}

export async function checkAvailability(cfg: TourCMSConfig, tourId: number, channelId: number, opts: Record<string, string>) {
  const qs = new URLSearchParams({ id: String(tourId), ...opts }).toString();
  return tourcmsRequest(cfg, { path: `/c/tour/datesprices/checkavail.xml?${qs}`, method: "GET", channelId });
}

export async function startNewBooking(cfg: TourCMSConfig, bookingXml: string, channelId: number) {
  return tourcmsRequest(cfg, { path: "/c/booking/new/start.xml", method: "POST", body: bookingXml, channelId });
}

export async function commitNewBooking(cfg: TourCMSConfig, bookingId: number, channelId: number, suppressEmail = false) {
  const body = `<?xml version="1.0"?><booking><booking_id>${bookingId}</booking_id>${suppressEmail ? "<suppress_email>1</suppress_email>" : ""}</booking>`;
  return tourcmsRequest(cfg, { path: "/c/booking/new/commit.xml", method: "POST", body, channelId });
}
```

### XML parsing in Node (no DOM)

Use `fast-xml-parser` (a few KB, no dependencies, supports forcing arrays to make `tour`/`component`/etc consistently array-shaped):

```ts
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  isArray: (name) => ["tour", "component", "customer", "image", "pickup", "rate", "option", "tag", "q", "payment", "booking"].includes(name),
});

const xml = await searchTours(cfg, { k: "rafting" });
const data = parser.parse(xml);
const tours = data.response?.tour ?? [];
```

### Signing checklist

1. **Path includes the querystring.** `c/tour/show.xml?id=1` — NOT just `c/tour/show.xml`.
2. **Path has no leading slash** in the string-to-sign.
3. **Verb uppercase**.
4. **Timestamp matches** the `x-tourcms-date` header exactly (both should be derived from the same `Date.now()`).
5. **URL-encode the base64 signature** before placing it in the `Authorization` header — `/`, `+`, and `=` must become `%2F`, `%2B`, `%3D`.
6. **No double-encoding**. URL-encode only the signature; don't re-encode the path or querystring.

### Channel ID logic

- Tour Operator: hard-code your Channel ID; pass it on every call.
- Marketplace Agent acting on a specific channel: pass that Channel ID.
- Marketplace Agent calling cross-channel `/p/` endpoints: pass `0`.
- The signature string MUST use the same Channel ID that ends up in the `Authorization` header.

### Caching layer

Use `unstable_cache` (Next.js App Router) or Redis with TTLs from §2:

```ts
import { unstable_cache } from "next/cache";

export const cachedSearchTours = unstable_cache(
  async (qs: Record<string, string>) => searchTours(cfg, qs),
  ["tourcms-search"],
  { revalidate: 1800 },        // 30 min
);
```

Always check the parsed `<error>` is `OK` before caching.

### Booking flow in a Next.js Route Handler

```ts
// app/api/checkout/route.ts
export async function POST(req: Request) {
  const { tourId, channelId, date, rates, customer } = await req.json();

  // 1. Check availability — gets component_key + locked-in price
  const availXml = await checkAvailability(cfg, tourId, channelId, { date, ...rates });
  const avail = parser.parse(availXml);
  const component = avail.response?.available_components?.component?.[0];
  if (!component) return new Response("No availability", { status: 409 });

  // 2. (Operator only) Get booking_key — assume agent for this snippet, so skip

  // 3. Start new booking
  const bookingXml = `<?xml version="1.0"?>
    <booking>
      <total_customers>${customer.count}</total_customers>
      <components>
        <component>
          <component_key>${component.component_key}</component_key>
        </component>
      </components>
      <customers>
        <customer>
          <title>${escapeXml(customer.title)}</title>
          <firstname>${escapeXml(customer.firstname)}</firstname>
          <surname>${escapeXml(customer.surname)}</surname>
          <email>${escapeXml(customer.email)}</email>
        </customer>
      </customers>
    </booking>`;
  const startedXml = await startNewBooking(cfg, bookingXml, channelId);
  const started = parser.parse(startedXml);
  if (started.response.error !== "OK") return Response.json({ error: started.response.error }, { status: 400 });

  const bookingId = started.response.booking.booking_id;
  const totalDue = started.response.booking.sales_revenue_due_now;

  // 4. Take payment (Spreedly, Stripe, etc.) — record_payment, or use spreedly_payment_create which auto-commits

  // 5. Commit
  const committed = await commitNewBooking(cfg, bookingId, channelId, /*suppress_email*/ false);
  return Response.json({ bookingId, status: parser.parse(committed).response.booking.status });
}
```

### Rate-limit handling

- Hourly bucket per Channel per direction (GET/POST), default 2000.
- Remaining is on response headers of every call AND via `rate_limit_status` (free).
- Implement a simple back-off: when `remaining_hits` drops below your threshold, queue / 429-equivalent.

### XML escaping helper

```ts
function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, c => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
  }[c]!));
}
```

---

## Appendix A — Endpoint quick index

| # | Endpoint | Verb | Section |
| --- | --- | --- | --- |
| A | `/api/rate_limit_status` | GET | 4.1 |
| B | `/p/channels/list` | GET | 5.1 |
| C | `/c/channel/show` | GET | 5.2 |
| D | `/p/channels/performance`, `/c/channel/performance` | GET | 5.3 |
| E | `/c/markups/show` | GET | 5.4 |
| F | `/p/tours/search`, `/c/tours/search` | GET | 6.1 |
| G | `/c/tour/show` | GET | 6.2 |
| H | `/c/tour/datesprices/datesndeals/search` | GET | 6.3 |
| I | `/c/tour/datesprices/checkavail` | GET | 6.4 |
| J | `/c/tour/update` | POST | 6.5 |
| K | Tour locations, filters, hotel search, restrictions, criteria, promotions | GET | 6.6–6.11 |
| L | `/c/tours/list`, `/c/tours/images/list`, `/c/tour/datesprices/dep/show` | GET | 7 |
| M | Delete tour, upload file, delete image/doc | POST | 8 |
| N | `/c/booking/new/get_redirect_url` | POST | 9.1 |
| O | `/c/booking/new/start` | POST | 9.2 |
| P | `/c/booking/new/commit` | POST | 9.3 |
| Q | `/c/booking/show` | GET | 9.4 |
| R | `/p/bookings/list`, `/c/bookings/list` | GET | 9.5 |
| S | `/c/booking/update` | POST | 9.6 |
| T | `/c/booking/cancel` | POST | 9.7 |
| U | `/c/booking/note/new` | POST | 9.8 |
| V | `/c/booking/email/send` | POST | 9.9 |
| W | `/c/booking/component/new`, `/update`, `/delete` | POST | 9.10–9.12 |
| X | `/c/booking/delete` (temp only) | POST | 9.13 |
| Y | `/c/booking/payment/new` | POST | 10.1 |
| Z | `/c/booking/payment/spreedly/new` | POST | 10.2 |
| AA | `/c/booking/payment/list` | GET | 10.3 |
| AB | `/c/booking/payment/fail/new` | POST | 10.4 |
| AC | `/c/voucher/search` | POST | 11.1 |
| AD | `/c/voucher/redeem` | POST | 11.2 |
| AE | `/c/customer/show`, `/update`, `/create`, `/verification` | GET/POST | 12.1–12.4 |
| AF | `/c/customers/login_search` | GET | 12.5 |
| AG | `/c/enquiry/new`, `/show`; `/p/enquiries/search`, `/c/enquiries/search` | POST/GET | 12.6–12.8 |
| AH | `/c/promo/show` | GET | 12.9 |
| AI | Agent profile + agent search/update + remote login | various | 13 |
| AJ | Supplier show, staff members list | GET | 14 |
| AK | Pickup point CRUD + tour pickup routes | various | 15 |
| AL | Tour geopoint CRUD + tour tier CRUD | various | 16 |
| AM | Custom fields, tour facets, tour list, import status | GET | 17 |

---

*End of TourCMS API Reference. For the latest details on any single endpoint, the live documentation pages on tourcms.com are the source of truth.*

---

## Appendix B — `tourcms-js` Wrapper Method Cross-Reference

This appendix maps every method exposed by the [`tourcms-js`](https://www.npmjs.com/package/tourcms-js) Axios-based wrapper to its endpoint path and the section in this doc where the full schema lives. Source: developer-verified against an in-production integration. Use as a quick lookup when porting from the wrapper to a custom native-fetch implementation.

### B.1 Housekeeping

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `APIRateLimitStatus(channel=0)` | GET | `/api/rate_limit_status.xml` | §4.1 |

### B.2 Channels

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `listChannels()` | GET | `/p/channels/list.xml` | §5.1 |
| `showChannel(channel)` | GET | `/c/channel/show.xml` | §5.2 |
| `channelPerformance(channel=0)` | GET | `/p/channels/performance.xml` or `/c/channels/performance.xml` | §5.3 |
| `channelUploadLogoGetUrl(channel)` | GET | `/c/channel/logo/upload/url.xml` | §8.6 |
| `channelUploadLogoProcess(channel, uploadInfo)` | POST | `/c/channel/logo/upload/process.xml` | §8.6 |
| `createChannel(channel, channelInfo)` | POST | `/p/channel/create.xml` | §5.5 |
| `updateChannel(channel, channelInfo)` | POST | `/p/channel/update.xml` | §5.5 |
| `showMarkupScheme(channel)` | GET | `/c/markups/show.xml` | §5.4 |

### B.3 Tours

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `searchTours(channel=0, params)` | GET | `/p/tours/search.xml` or `/c/tours/search.xml` | §6.1 |
| `listTours(channel=0, params)` | GET | `/p/tours/list.xml` or `/c/tours/list.xml` | §7.1 |
| `showTour(channel, tourId, params)` | GET | `/c/tour/show.xml?id={tourId}` | §6.2 |
| `updateTour(channel, tourData)` | POST | `/c/tour/update.xml` | §6.5 |
| `deleteTour(channel, tourId)` | POST | `/c/tour/delete.xml?id={tourId}` | §8.1 |
| `listTourImages(channel=0, params)` | GET | `/p/tours/images/list.xml` or `/c/tours/images/list.xml` | §7.2 |
| `listTourLocations(channel=0, params)` | GET | `/p/tours/locations.xml` or `/c/tours/locations.xml` | §6.6 |
| `listProductFilters(channel=0)` | GET | `/c/tours/filters.xml` | §6.7 |
| `toursSearchCriteria(channel)` | GET | `/api/tours/search_criteria/get.xml` | §6.10 |
| `deleteTourImage(channel, imageInfo)` | POST | `/c/tour/images/delete.xml` | §8.3 |
| `deleteTourDocument(channel, documentXml)` | POST | `/c/tour/document/delete.xml` | §8.3 |
| `tourUploadFileGetUrl(channel, tourId, fileType, fileId)` | GET | `/c/tours/files/upload/url.xml` | §8.5 |
| `tourUploadFileProcess(channel, uploadInfo)` | POST | `/c/tours/files/upload/process.xml` | §8.5 |

### B.4 Dates / Prices / Availability

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `checkTourAvailability(channel, tourId, params)` | GET | `/c/tour/datesprices/checkavail.xml?id={tourId}` | §6.4 |
| `showTourDatesAndDeals(channel, tourId, params)` | GET | `/c/tour/datesprices/datesndeals/search.xml?id={tourId}` | §6.3 |
| `showTourDepartures(channel, tourId, params)` | GET | `/c/tour/datesprices/dep/show.xml?id={tourId}` | §7.3 |
| `showTourFreesale(channel, tourId)` | GET | `/c/tour/datesprices/freesale/show.xml?id={tourId}` | §8.4.6 |
| `searchHotelsRange(channel=0, tourId, params)` | GET | `/p/hotels/search_range.xml` | §6.8b |
| `searchHotelsSpecific(channel=0, tourId, params)` | GET | `/p/hotels/search_avail.xml` or `/c/hotels/search_avail.xml` | §6.8 |
| `showPromo(channel, promoCode)` | GET | `/c/promo/show.xml?promo_code={code}` | §6.8d |
| `checkOptionAvailability(channel, bookingId, tourComponentId)` | GET | `/c/booking/options/checkavail.xml` | §6.8c |

### B.5 Departure Management

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `searchRawDepartures(channel, tourId, params)` | GET | `/c/tour/datesprices/dep/manage/search.xml?id={tourId}` | §8.4.1 |
| `showDeparture(channel, tourId, departureId)` | GET | `/c/tour/datesprices/dep/manage/show.xml` | §8.4.2 |
| `createDeparture(channel, departureData)` | POST | `/c/tour/datesprices/dep/manage/new.xml` | §8.4.3 |
| `updateDeparture(channel, departureData)` | POST | `/c/tour/datesprices/dep/manage/update.xml` | §8.4.4 |
| `deleteDeparture(channel, tourId, departureId)` | POST | `/c/tour/datesprices/dep/manage/delete.xml` | §8.4.5 |

### B.6 Bookings

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `getBookingRedirectUrl(channel, urlData)` | POST | `/c/booking/new/get_redirect_url.xml` | §9.1 |
| `startNewBooking(channel, bookingData)` | POST | `/c/booking/new/start.xml` | §9.2 |
| `commitBooking(channel, bookingId)` | POST | `/c/booking/new/commit.xml` | §9.3 |
| `searchBookings(channel=0, params)` | GET | `/p/bookings/search.xml` or `/c/bookings/search.xml` | §9.5 |
| `listBookings(channel=0, params)` | GET | `/p/bookings/list.xml` or `/c/bookings/list.xml` | §9.5 |
| `showBooking(channel, bookingId, params)` | GET | `/c/booking/show.xml?booking_id={id}` | §9.4 |
| `updateBooking(channel, bookingData)` | POST | `/c/booking/update.xml` | §9.6 |
| `cancelBooking(channel, bookingData)` | POST | `/c/booking/cancel.xml` | §9.7 |
| `deleteBooking(channel, bookingId)` | POST | `/c/booking/delete.xml?booking_id={id}` | §9.13 |
| `addNoteToBooking(channel, bookingId, text, type)` | POST | `/c/booking/note/new.xml` | §9.8 |
| `sendBookingEmail(channel, postData)` | POST | `/c/booking/email/send.xml` | §9.9 |
| `bookingAddComponent(channel, componentData)` | POST | `/c/booking/component/new.xml` | §9.10 |
| `bookingUpdateComponent(channel, componentData)` | POST | `/c/booking/component/update.xml` | §9.11 |
| `bookingRemoveComponent(channel, componentData)` | POST | `/c/booking/component/delete.xml` | §9.12 |

### B.7 Vouchers

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `searchVoucher(channel=0, voucherData)` | POST | `/p/voucher/search.xml` or `/c/voucher/search.xml` | §11.1 |
| `redeemVoucher(channel=0, voucherData)` | POST | `/c/voucher/redeem.xml` | §11.2 |

### B.8 Payments

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `createPayment(channel, paymentData)` | POST | `/c/booking/payment/new.xml` | §10.1 |
| `logFailedPayment(channel, paymentData)` | POST | `/c/booking/payment/fail.xml` | §10.4 |
| `spreedlyCreatePayment(channel, paymentData)` | POST | `/c/booking/payment/spreedly/new.xml` | §10.2 |
| `spreedlyCompletePayment(channel, transactionId)` | POST | `/c/booking/gatewaytransaction/spreedlycomplete.xml?id={id}` | §10.5 |
| `payworksBookingPaymentNew(channel, payment)` | POST | `/c/booking/payment/payworks/new.xml` | §10.6 |
| `listPayments(channel, params)` | GET | `/c/booking/payment/list.xml` | §10.3 |

### B.9 Enquiries & Customers

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `createEnquiry(channel, enquiryData)` | POST | `/c/enquiry/new.xml` | §12.6 |
| `searchEnquiries(channel=0, params)` | GET | `/p/enquiries/search.xml` or `/c/enquiries/search.xml` | §12.7 |
| `showEnquiry(channel, enquiryId)` | GET | `/c/enquiry/show.xml?enquiry_id={id}` | §12.8 |
| `showCustomer(channel, customerId)` | GET | `/c/customer/show.xml?customer_id={id}` | §12.1 |
| `updateCustomer(channel, customerData)` | POST | `/c/customer/update.xml` | §12.2 |
| `checkCustomerLogin(channel, username, password)` | GET | `/c/customers/login_search.xml` | §12.5 |

### B.10 Agents

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `searchAgents(channel, params)` | GET | `/p/agents/search.xml` or `/c/agents/search.xml` | §13.3 |
| `updateAgent(channel, agentData)` | POST | `/c/agents/update.xml` | §13.4 |
| `showAgentProfile(agentId, channel=0)` | GET | `/api/agent/profile/get.xml?id={id}` | §13.1 |
| `updateAgentProfile(agentData)` | POST | `/api/agent/profile/update.xml` | §13.2 |
| `startNewAgentLogin(channel, params)` | POST | `/c/start_agent_login.xml` | §13.6 |
| `retrieveAgentBookingKey(channel, privateToken)` | GET | `/c/retrieve_agent_booking_key.xml?k={token}` | §13.7 |

### B.11 Staff & Suppliers

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `listStaffMembers(channel)` | GET | `/c/staff/list.xml` *(wrapper)* or `/c/staff_members/list.xml` *(doc)* | §14.2 |
| `showSupplier(channel, supplierId)` | GET | `/c/supplier/show.xml?supplier_id={id}` | §14.1 |

### B.12 Pickup Points

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `listPickups(channel, params)` | GET | `/c/pickups/list.xml` | §15.1 |
| `createPickup(channel, pickupData)` | POST | `/c/pickups/new.xml` | §15.1 |
| `updatePickup(channel, pickupData)` | POST | `/c/pickups/update.xml` | §15.1 |
| `deletePickup(channel, pickupData)` | POST | `/c/pickups/delete.xml` | §15.1 |
| `showToursPickupRoutes(channel, tourId)` | GET | `/api/tours/pickup/routes/show.xml?id={id}` | §15.2 |
| `updateToursPickupRoutes(channel, data)` | POST | `/api/tours/pickup/routes/update.xml` | §15.2 |
| `toursPickupRoutesAddPickup(channel, data)` | POST | `/api/tours/pickup/routes/pickup_add.xml` | §15.2 |
| `toursPickupRoutesUpdatePickup(channel, data)` | POST | `/api/tours/pickup/routes/pickup_update.xml` | §15.2 |
| `toursPickupRoutesDeletePickup(channel, data)` | POST | `/api/tours/pickup/routes/pickup_delete.xml` | §15.2 |

### B.13 Account & Channel Admin

| Wrapper method | HTTP | Endpoint | Section |
| --- | --- | --- | --- |
| `createAccount(uploadInfo)` | POST | `/p/account/create.xml` | §14.3 |
| `updateAccount(channel, uploadInfo)` | POST | `/p/account/update.xml` | §14.3 |
| `showAccount(accountId)` | GET | `/p/account/show.xml?account_id={id}` | §14.3 |
| `getCustomFields(channel)` | GET | `/api/account/custom_fields/get.xml` | §17.1 |
| `getTourFacets(channel)` | GET | `/api/tours/importer/get_tour_facets.xml` | §17.2 |
| `getListTours(channel, params)` | GET | `/api/tours/importer/get_tour_list.xml` | §17.2 |
| `getImportToursStatus(channel, codes)` | POST | `/api/tours/importer/get_import_tours_status.xml` | §17.2 |
| `listTourBookingRestrictions(channel, params)` | GET | `/api/tours/restrictions/list_tour_bookings_restrictions.xml` | §17.3 |
| `createTourGeopoint(channel, geopoint)` | POST | `/api/tours/geos/create.xml` | §16.1 |
| `updateTourGeopoint(channel, geopoint)` | POST | `/api/tours/geos/update.xml` | §16.1 |
| `deleteTourGeopoint(channel, geopoint)` | POST | `/api/tours/geos/delete.xml` | §16.1 |

### B.14 Utility / Helper (wrapper-only, no remote endpoint)

| Wrapper method | Purpose |
| --- | --- |
| `setBaseURL(url)` | Override default API base URL |
| `XMLToJson(xml)` | Convert Axios XML response to JS object (via x2js) |
| `JSONToXML(json)` | Convert JS object to XML string |
| `XMLStringToJson(xmlString)` | Parse XML string to JS object |
| `generateSignature(path, channelId, verb, outboundTime)` | Generate HMAC-SHA256 auth signature |
| `validateXMLHash(xml)` | Validate a webhook XML signature |
| `getLastResponseHeaders()` | Get headers from last response (for rate-limit tracking) |
| `time()` | Returns current Unix timestamp (seconds) |

---

## Appendix C — Alternative Auth Scheme (`X-TC-*` headers)

An alternative custom auth scheme observed in production (used by the `PalisisAPI` class in some Palisis Next.js integrations):

```
X-TC-API-KEY:    {apiKey}
X-TC-TIMESTAMP:  {unix_timestamp}
X-TC-SIGNATURE:  Base64(SHA256("{marketplaceId}/{channelId}/{VERB}/{timestamp}{path}" + apiKey))
```

**Differences from the standard scheme (§1)**:
- Plain SHA-256 of `(stringToSign + apiKey)`, **not** HMAC-SHA256 with apiKey as the key.
- The base64 output is **not** URL-encoded.
- Three distinct headers instead of bundling into `Authorization`.

**Caveats**:
- This scheme is **not documented on tourcms.com**. It appears to be a custom implementation in older / forked TourCMS PHP clients ported to JS.
- Use the standard `Authorization: TourCMS …` + `x-tourcms-date` headers (§1) for new integrations. They're the documented contract and what current TourCMS server-side validation expects.
- If you inherit a codebase using `X-TC-*`, verify it actually works against the current TourCMS production servers before relying on it — some endpoints may reject it as unsigned.

---

## Appendix D — Endpoint additions/updates from wrapper review (May 2026)

Quick changelog of what was added/clarified after cross-referencing the `tourcms-js` wrapper against the public docs:

**New endpoints documented**:
- §5.5 Create / Update Channel (`/p/channel/create`, `/p/channel/update`)
- §6.8b Search Hotels Range (`/p/hotels/search_range`)
- §6.8c Check Option Availability (`/c/booking/options/checkavail`)
- §8.4 Departure Management — all 5 endpoints fully documented (search/show/create/update/delete) + §8.4.6 Show Tour Freesale
- §8.5 Tour File Upload (2-step `url`/`process` pattern)
- §8.6 Channel Logo Upload (2-step pattern)
- §10.5 Spreedly Complete Transaction (`/c/booking/gatewaytransaction/spreedlycomplete`)
- §10.6 Payworks Payment (`/c/booking/payment/payworks/new`)
- §13.6 Start New Agent Login (`/c/start_agent_login`)
- §13.7 Retrieve Agent Booking Key (`/c/retrieve_agent_booking_key`)
- §14.3 Account admin (create/update/show)

**Alternative paths recorded** (both work, wrapper uses the second):
- Custom fields: `/c/custom_fields/get` ↔ `/api/account/custom_fields/get`
- Tour importer: `/c/tour_*/get` ↔ `/api/tours/importer/*`
- Booking restrictions: `/c/tour/restrictions/list` ↔ `/api/tours/restrictions/list_tour_bookings_restrictions`
- Pickups: `/c/pickup/{op}` ↔ `/c/pickups/{op}` (`new`/`update`/`delete`)
- Tour pickup routes: `/c/tour/pickup_routes/*` ↔ `/api/tours/pickup/routes/*`
- Tour geopoints: `/c/tour/geopoint/*` ↔ `/api/tours/geos/*`
- Staff list: `/c/staff_members/list` ↔ `/c/staff/list`
- Failed payment: `/c/booking/payment/fail/new` ↔ `/c/booking/payment/fail`

When implementing your custom `lib/tourcms.ts`, **prefer the wrapper paths** for newer endpoints (channel admin, departure management, account admin) since the public doc pages haven't been updated to cover them. For everything else, both paths work — pick one and be consistent.
