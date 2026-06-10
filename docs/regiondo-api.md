# Regiondo Platform API — Implementation Guide

> **Purpose:** This document covers the actual Regiondo REST API endpoints needed to build a Product Importer and real-time availability system. It is intended for implementation in a new or existing project alongside Palisis products.

---

## Table of Contents

1. [Base URL & Authentication](#1-base-url--authentication)
2. [All Regiondo API Endpoints](#2-all-regiondo-api-endpoints)
3. [What to Store vs What to Fetch Live](#3-what-to-store-vs-what-to-fetch-live)
4. [Recommended DB Schema](#4-recommended-db-schema)
5. [Flow A — Product Importer](#5-flow-a--product-importer)
6. [Flow B — Variation-based Timeslot Fetching](#6-flow-b--variation-based-timeslot-fetching)
7. [Flow C — Real-time Availability on Date Select](#7-flow-c--real-time-availability-on-date-select)
8. [Integration with Palisis Products](#8-integration-with-palisis-products)

---

## 1. Base URL & Authentication

### Base URL

```
https://api.regiondo.com/v1
```

All endpoints are relative to this base.

### Credentials needed

| Key | Description |
|---|---|
| `publicKey` | Your API public key (used as `X-API-ID`) |
| `secretKey` | Your API secret key (used for HMAC signing, never sent in request) |

### How to sign every request

Every request must include these 3 headers:

```
X-API-ID:    {publicKey}
X-API-TIME:  {timestamp_ms}
X-API-HASH:  {hmac_signature}
Accept-Language: en-US
```

**Signature formula:**

```
stringToSign = {timestamp_ms} + {publicKey} + {queryString}
X-API-HASH   = HMAC-SHA256(stringToSign, secretKey)  → lowercase hex string
```

Where:
- `timestamp_ms` = `Date.now()` — current time in **milliseconds** (not seconds)
- `queryString` = raw query string **without** the leading `?`
  e.g. `limit=250&store_locale=en-US`
- If the request has **no query params**, `queryString` is an empty string `""`

### Node.js signing example

```js
const crypto = require('crypto')

function buildHeaders(publicKey, secretKey, queryString = '') {
  const timestamp = Date.now()
  const stringToSign = `${timestamp}${publicKey}${queryString}`
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(stringToSign)
    .digest('hex')

  return {
    'X-API-ID':      publicKey,
    'X-API-TIME':    timestamp,
    'X-API-HASH':    hash,
    'Accept-Language': 'en-US',
  }
}

// GET /products?limit=250&store_locale=en-US
const qs = 'limit=250&store_locale=en-US'
const headers = buildHeaders(process.env.REGIONDO_PUBLIC_KEY, process.env.REGIONDO_SECRET_KEY, qs)
```

### Python signing example

```python
import hmac, hashlib, time, requests

def build_headers(public_key, secret_key, query_string=''):
    timestamp = int(time.time() * 1000)  # milliseconds
    string_to_sign = f"{timestamp}{public_key}{query_string}"
    hash_val = hmac.new(
        secret_key.encode(),
        string_to_sign.encode(),
        hashlib.sha256
    ).hexdigest()
    return {
        'X-API-ID':       public_key,
        'X-API-TIME':     str(timestamp),
        'X-API-HASH':     hash_val,
        'Accept-Language': 'en-US',
    }

qs = 'limit=250&store_locale=en-US'
headers = build_headers(PUBLIC_KEY, SECRET_KEY, qs)
response = requests.get(
    'https://api.regiondo.com/v1/products',
    params={'limit': 250, 'store_locale': 'en-US'},
    headers=headers
)
```

> **Important:** The `queryString` used for signing must exactly match what is sent in the URL. Always build the query string first, then sign it, then attach it to the request.

---

## 2. All Regiondo API Endpoints

### 2.1 List All Products

```
GET /products
```

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `limit` | integer | No | Max products to return (use `250` for full import) |
| `store_locale` | string | No | Locale for product names/descriptions (e.g. `en-US`) |

**Sign with query string:** `limit=250&store_locale=en-US`

**Example Request:**

```http
GET https://api.regiondo.com/v1/products?limit=250&store_locale=en-US
X-API-ID: your-public-key
X-API-TIME: 1748000000000
X-API-HASH: abc123...
Accept-Language: en-US
```

**Response — array of product objects:**

```json
[
  {
    "product_id": "12345",
    "name": "City Walking Tour",
    "sku": "CWT-001",
    "short_description": "A guided walking tour of the city center.",
    "geo_lat": "48.8566",
    "geo_lon": "2.3522",
    "distance": null,
    "location_address": "1 Rue de Rivoli",
    "city": "Paris",
    "zipcode": "75001",
    "city_id": "paris",
    "region_id": "ile-de-france",
    "poi_ids": null,
    "country_id": "fr",
    "continent_id": "eu",
    "thumbnail": "https://cdn.regiondo.net/img/12345.jpg",
    "appointment_types": "datetime",
    "image": "https://cdn.regiondo.net/img/12345_full.jpg",
    "image_label": "City Tour Photo",
    "url_key": "city-walking-tour",
    "url_path": "tours/city-walking-tour",
    "provider": "City Tours GmbH",
    "rating_summary": "90",
    "reviews_count": "42",
    "is_appointment_needed": "1",
    "ticket_suitable_for": null,
    "top_things_to_do": "1",
    "ticket_weather": null,
    "ticket_languages": "en,de,fr",
    "product_supplier_id": "supplier-99",
    "original_price": "25.00",
    "type_id": "simple",
    "as_gift": "0",
    "covid_19": "0",
    "in_stock": "1",
    "is_expired": "0",
    "regiondo_url": "https://regiondo.com/en/city-walking-tour",
    "wl_regiondo_url": "https://your-site.com/tours/city-walking-tour",
    "base_price": "25.00",
    "disable_print_at_home": null,
    "duration_type": "hours",
    "duration_values": "2",
    "variations": [
      {
        "variation_id": "var-001",
        "options": [
          { "option_id": "opt-adult" },
          { "option_id": "opt-child" }
        ]
      }
    ],
    "currency_code": "EUR",
    "tips": null
  }
]
```

---

### 2.2 Get Single Product Detail

```
GET /products/{productId}
```

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `store_locale` | string | No | Locale (e.g. `en-US`) |

**Sign with query string:** `store_locale=en-US`

**Response — single product object with full details:**

```json
{
  "status": 1,
  "data": {
    "product_id": "12345",
    "name": "City Walking Tour",
    "sku": "CWT-001",
    "short_description": "...",
    "description": "Full HTML description of the product...",
    "geo_lat": "48.8566",
    "geo_lon": "2.3522",
    "location_address": "1 Rue de Rivoli",
    "city": "Paris",
    "country_id": "fr",
    "thumbnail": "https://cdn.regiondo.net/img/12345.jpg",
    "images": [
      { "url": "https://cdn.regiondo.net/img/12345_1.jpg", "label": "Tour Start" },
      { "url": "https://cdn.regiondo.net/img/12345_2.jpg", "label": "City View" }
    ],
    "original_price": "25.00",
    "base_price": "25.00",
    "currency_code": "EUR",
    "duration_type": "hours",
    "duration_values": "2",
    "in_stock": "1",
    "is_expired": "0",
    "ticket_languages": "en,de,fr",
    "appointment_types": "datetime",
    "variations": [
      {
        "variation_id": "var-001",
        "name": "Standard Tour",
        "from": "2025-01-01",
        "to": "2025-12-31",
        "appointment_type": "datetime",
        "available_dates": {
          "2025-06-09": [ ["10:00", "14:00", "16:00"] ],
          "2025-06-10": [ ["10:00", "14:00"] ]
        },
        "options": [
          { "option_id": "opt-adult" },
          { "option_id": "opt-child" }
        ]
      },
      {
        "variation_id": "var-002",
        "name": "Premium Tour",
        "from": "2025-01-01",
        "to": "2025-12-31",
        "appointment_type": "datetime",
        "available_dates": { ... }
      }
    ]
  }
}
```

> `available_dates` is a map of `date → array of time-slot arrays`. This is included in the product detail response and can be used to pre-populate a date picker without a separate API call.

---

### 2.3 Get Product Variations

```
GET /products/variations/{productId}
```

**No query parameters.** Sign with empty query string `""`.

**Response:**

```json
{
  "status": 1,
  "data": [
    {
      "id": "var-001",
      "variation_id": "var-001",
      "name": "Standard Tour",
      "from": "2025-01-01",
      "to": "2025-12-31",
      "appointment_type": "datetime"
    },
    {
      "id": "var-002",
      "variation_id": "var-002",
      "name": "Premium Tour",
      "from": "2025-01-01",
      "to": "2025-12-31",
      "appointment_type": "datetime"
    }
  ]
}
```

---

### 2.4 Get Available Options (Ticket Types) for a Variation

Returns ticket types (options) with real-time stock/capacity for a specific variation on a given date and time.

```
GET /products/availoptions/{variationId}
```

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `date` | string | No | Date in `YYYY-MM-DD` to check availability for |
| `time` | string | No | Time in `HH:MM` to narrow to a specific slot |

**Sign with query string:** `date=2025-06-09&time=14:00`

**Response — object keyed by option_id:**

```json
{
  "opt-adult": {
    "option_id": "opt-adult",
    "name": "Adult",
    "sort_order": 1,
    "min_qty_to_sell": 1,
    "max_qty_to_sell": 10,
    "original_price": "25.00",
    "regiondo_price": "25.00",
    "vat_percentage_val": "19",
    "duration_value": "2",
    "duration_type": "hours",
    "description": "Full price adult ticket",
    "sales_start_dt": "2025-01-01 00:00:00",
    "sales_end_dt": "2025-12-31 23:59:59",
    "capacity": 50,
    "booking_notice_period": 2,
    "qty_left": 32
  },
  "opt-child": {
    "option_id": "opt-child",
    "name": "Child (under 12)",
    "sort_order": 2,
    "min_qty_to_sell": 0,
    "max_qty_to_sell": 10,
    "original_price": "15.00",
    "regiondo_price": "15.00",
    "vat_percentage_val": "19",
    "capacity": 50,
    "qty_left": 32
  }
}
```

**Key fields:**

| Field | Description |
|---|---|
| `qty_left` | Seats remaining — use this for live availability |
| `capacity` | Total seats for this option |
| `min_qty_to_sell` | Minimum quantity that must be purchased |
| `max_qty_to_sell` | Maximum per transaction |
| `booking_notice_period` | Hours before the event that booking closes |

---

### 2.5 Get Available Dates for a Variation

Returns which dates have availability in a date range.

```
GET /products/timeslots/dates
```

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `variation_id` | string | Yes | Variation ID to check |
| `from_date` | string | Yes | Start date `YYYY-MM-DD` |
| `to_date` | string | Yes | End date `YYYY-MM-DD` |

**Sign with query string:** `variation_id=var-001&from_date=2025-06-01&to_date=2025-06-30`

**Response:**

```json
{
  "status": 1,
  "data": [
    { "date": "2025-06-09" },
    { "date": "2025-06-10" },
    { "date": "2025-06-14" }
  ]
}
```

> Use this to render a date picker that only shows bookable dates. Fetch for the current month + next month on page load.

---

### 2.6 Get Timeslots for a Variation

Returns the actual time slots with capacity and availability for a variation across a datetime range. This is the **primary real-time API** for the product detail page.

```
GET /products/timeslots
```

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `regiondo_variation_id` | string | One of these two | Variation ID |
| `regiondo_option_id` | string | One of these two | Option ID (alternative filter) |
| `from_datetime` | string | Yes | Start datetime `YYYY-MM-DD HH:MM:SS` |
| `to_datetime` | string | Yes | End datetime `YYYY-MM-DD HH:MM:SS` |
| `include_past` | boolean | No | Include already-passed slots (default: false) |

**Sign with query string:** `regiondo_variation_id=var-001&from_datetime=2025-06-09 00:00:00&to_datetime=2025-06-09 23:59:59`

**Response:**

```json
{
  "status": 1,
  "total": 3,
  "data": [
    {
      "start_date_time": "2025-06-09 10:00:00",
      "booking_cut_off_hours": 2,
      "bookable_until_time": "2025-06-09 08:00:00",
      "is_available": 1,
      "event_capacity": 50,
      "qty_available": 38,
      "qty_available_by_option": {
        "opt-adult": 38,
        "opt-child": 38
      },
      "stock_available_by_option": {
        "opt-adult": 38,
        "opt-child": 38
      },
      "regiondo_variation_id": 1,
      "appointment_type": "datetime"
    },
    {
      "start_date_time": "2025-06-09 14:00:00",
      "booking_cut_off_hours": 2,
      "bookable_until_time": "2025-06-09 12:00:00",
      "is_available": 1,
      "event_capacity": 50,
      "qty_available": 12,
      "qty_available_by_option": {
        "opt-adult": 12,
        "opt-child": 12
      },
      "stock_available_by_option": {
        "opt-adult": 12,
        "opt-child": 12
      },
      "regiondo_variation_id": 1,
      "appointment_type": "datetime"
    },
    {
      "start_date_time": "2025-06-09 16:00:00",
      "is_available": 0,
      "event_capacity": 50,
      "qty_available": 0,
      "regiondo_variation_id": 1,
      "appointment_type": "datetime"
    }
  ]
}
```

**Key fields:**

| Field | Values | Description |
|---|---|---|
| `is_available` | `1` / `0` | Whether this slot can be booked |
| `qty_available` | number | Total seats available |
| `qty_available_by_option` | `{option_id: qty}` | Per ticket-type availability |
| `event_capacity` | number | Total slot capacity |
| `booking_cut_off_hours` | number | Hours before start that booking stops |

---

### 2.7 Get Option Details

Fetch details for a single option by ID.

```
GET /products/options/{optionId}
```

**No query parameters.** Sign with empty string.

**Response:**

```json
{
  "status": 1,
  "data": {
    "option_id": "opt-adult",
    "name": "Adult",
    "price": "25.00",
    "currency_code": "EUR"
  }
}
```

---

### 2.8 Get Supplier Bookings

Fetch bookings for a product. Useful for syncing booking data into your DB.

```
GET /supplier/bookings
```

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `product_ids` | string | Yes (or `booking_key`) | Regiondo product ID |
| `booking_key` | string | Yes (or `product_ids`) | Fetch a specific booking by key |
| `limit` | integer | No | Max results (default 250) |
| `type` | string | No | Filter by type: `offline_reservation,booking,voucher,redeem` |
| `date_range` | string | No | `YYYY-MM-DD,YYYY-MM-DD` (from,to) |

**Response — array of booking objects:**

```json
[
  {
    "booking_key": "BK-abc123",
    "order_id": "ORD-789",
    "order_number": "1234",
    "product_id": 12345,
    "variation_id": "var-001",
    "option_id": "opt-adult",
    "event_date_time": "2025-06-09 14:00:00",
    "qty": 2,
    "qty_cancelled": 0,
    "status": "confirmed",
    "total_amount": 50.00,
    "payment_status": { "code": "paid" },
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone_number": "+49123456789",
    "external_id": "",
    "created_at": "2025-06-01T10:00:00Z"
  }
]
```

---

### 2.9 Get Sold Items

Fetch individual sold tickets (granular — one row per ticket, not per order).

```
GET /partner/solditems
```

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `product_ids` | string | Yes | Regiondo product ID |
| `date_range` | string | No | `YYYY-MM-DD,YYYY-MM-DD` |
| `date_bought` | string | No | `Date of event` to filter by event date |

**Response — array of sold item objects** (see `SoldItem` interface in `regiondo-api-utils.ts`).

---

### 2.10 Create Permanent Reservation

Create a booking programmatically (no widget). Returns a `booking_key` for the purchase step.

```
POST /checkout/permanentreservation?place_booking=true
```

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `place_booking` | boolean | `true` = immediately place; `false` = hold only |

**Sign with query string:** `place_booking=true`

**Request Body (JSON):**

```json
{
  "product_id": 12345,
  "date_time": "2025-06-09 14:00:00",
  "skip_customer_validation": true,
  "items": [
    {
      "option_id": 456,
      "qty": 2,
      "external_item_id": "your-ref-id"
    }
  ]
}
```

**Response:**

```json
{
  "booking_key": "BK-abc123",
  "product_id": 12345,
  "date_time": "2025-06-09 14:00:00",
  "items": [
    {
      "item_code": "ITEM-001",
      "option_id": 456,
      "qty": 2,
      "reservation_code": "RES-XYZ"
    }
  ],
  "contact_data_required": ["firstname", "lastname", "email"]
}
```

---

### 2.11 Complete Purchase

Completes the purchase for a reservation made in step 2.10.

```
POST /checkout/permanentreservation/purchase?booking_key={key}
```

**Sign with query string:** `booking_key=BK-abc123`

**No request body needed.**

**Response:**

```json
{
  "order_id": "ORD-789",
  "order_number": 1234,
  "purchased_at": "2025-06-01T10:00:00Z",
  "grand_total": 50.00,
  "currency": "EUR",
  "items": [
    {
      "ticket_option_id": 456,
      "ticket_qty": 2,
      "ticket_codes": [
        {
          "code": "TC-111",
          "barcode_type": "qr",
          "validity_status": "valid",
          "ticket_pdf": "https://..."
        }
      ]
    }
  ],
  "contact_data": {
    "firstname": "John",
    "lastname": "Doe",
    "email": "john@example.com"
  }
}
```

---

## 3. What to Store vs What to Fetch Live

This is the core design decision for the importer. Split data into **static** (stored in DB once, updated periodically) and **dynamic** (always fetched live from the API).

### Static — Store in DB (import once, sync periodically)

| Data | Source API | Update frequency |
|---|---|---|
| Product ID, name, SKU, description | `GET /products/{id}` | Weekly / on demand |
| Product images, thumbnail | `GET /products/{id}` | Weekly / on demand |
| Location, city, country, coordinates | `GET /products/{id}` | Rarely changes |
| Languages, duration, price range | `GET /products/{id}` | Weekly |
| `in_stock`, `is_expired` status | `GET /products/{id}` | Daily |
| Variation IDs, names, date ranges | `GET /products/variations/{id}` | Weekly |
| Option IDs, names, base prices | `GET /products/availoptions/{varId}` | Weekly |

### Dynamic — Always fetch live from API

| Data | Source API | When to fetch |
|---|---|---|
| Available dates for a variation | `GET /products/timeslots/dates` | When user opens date picker |
| Time slots for a date | `GET /products/timeslots` | When user selects a date |
| Per-option `qty_left` / `capacity` | `GET /products/availoptions/{varId}?date=&time=` | When user selects a time slot |
| Real-time pricing | `GET /products/availoptions/{varId}?date=` | When displaying prices live |

---

---

## 5. Flow A — Product Importer

Run this once on setup, then periodically to refresh static product data.

```
STEP 1 — Fetch all products
──────────────────────────────────────────────────────
  GET https://api.regiondo.com/v1/products
    ?limit=250
    &store_locale=en-US

  → Returns array of product summaries
  → Each product includes embedded variations[] with variation_id and options[]

STEP 2 — For each product, fetch full detail (optional for enriched data)
──────────────────────────────────────────────────────
  GET https://api.regiondo.com/v1/products/{product_id}
    ?store_locale=en-US

  → Returns full description, all images, complete variation data with available_dates

  When to run this:
  - On first import (to get full description and images)
  - When product detail page is first visited
  - On a weekly schedule for price/stock updates

STEP 3 — Upsert product into DB
──────────────────────────────────────────────────────
  INSERT INTO products (...) ON CONFLICT (id) DO UPDATE SET ...

  Fields to store:
    id              = product.product_id
    trip_type       = 'regiondo'
    name            = product.name
    sku             = product.sku
    description     = product.description        (from detail endpoint)
    short_description = product.short_description
    thumbnail       = product.thumbnail
    images          = product.images             (from detail endpoint)
    location_address = product.location_address
    city            = product.city
    country_id      = product.country_id
    geo_lat         = product.geo_lat
    geo_lon         = product.geo_lon
    original_price  = product.original_price
    currency_code   = product.currency_code
    duration_type   = product.duration_type
    duration_values = product.duration_values
    appointment_types = product.appointment_types
    in_stock        = product.in_stock === "1"
    is_expired      = product.is_expired === "1"
    raw_data        = product                    (full JSON snapshot)

STEP 4 — For each product, fetch variations
──────────────────────────────────────────────────────
  GET https://api.regiondo.com/v1/products/variations/{product_id}

  → Returns array of variations

  Note: The list endpoint already embeds variation_ids.
  Use this endpoint for complete variation metadata (name, from, to, appointment_type).

STEP 5 — Upsert variations into DB
──────────────────────────────────────────────────────
  For each variation:
    INSERT INTO product_variations (...) ON CONFLICT (product_id, variation_id) DO UPDATE

    Fields to store (STATIC ONLY):
      product_id       = product_id
      variation_id     = variation.variation_id (or variation.id)
      name             = variation.name
      from_date        = variation.from
      to_date          = variation.to
      appointment_type = variation.appointment_type
      is_default       = (index === 0)          ← mark first variation as default

    Note: Do NOT store variation.available_dates — bookable dates / timeslots are
          DYNAMIC and must be fetched LIVE at view time, never persisted.

STEP 6 — For each variation, fetch today's available options
──────────────────────────────────────────────────────
  GET https://api.regiondo.com/v1/products/availoptions/{variation_id}
    ?date={today YYYY-MM-DD}

  → Returns object { option_id: { name, price, capacity, qty_left, ... } }

STEP 7 — Upsert options into DB
──────────────────────────────────────────────────────
  DELETE FROM product_options WHERE product_id = ? AND variation_id = ?
  INSERT INTO product_options (...)

  Fields to store:
    product_id          = product_id
    variation_id        = variation_id
    option_id           = option.option_id
    name                = option.name
    sort_order          = option.sort_order
    min_qty_to_sell     = option.min_qty_to_sell
    max_qty_to_sell     = option.max_qty_to_sell
    original_price      = option.original_price
    regiondo_price      = option.regiondo_price
    vat_percentage_val  = option.vat_percentage_val
    capacity            = option.capacity
    booking_notice_period = option.booking_notice_period
    description         = option.description

  Note: Do NOT rely on qty_left from the importer — it changes constantly.
        Always fetch qty_left live for booking flows.

DONE — Products, variations, and options are stored in DB.
```

**Pseudo-code:**

```js
async function importAllProducts() {
  // Step 1: Fetch product list
  const products = await get('/products', { limit: 250, store_locale: 'en-US' })

  for (const product of products) {
    // Step 2: Fetch full detail
    const detail = await get(`/products/${product.product_id}`, { store_locale: 'en-US' })

    // Step 3: Upsert product
    await db.upsert('products', {
      id:             product.product_id,
      trip_type:      'regiondo',
      name:           product.name,
      sku:            product.sku,
      thumbnail:      product.thumbnail,
      description:    detail.data.description,
      images:         detail.data.images,
      original_price: parseFloat(product.original_price),
      currency_code:  product.currency_code,
      in_stock:       product.in_stock === '1',
      is_expired:     product.is_expired === '1',
      raw_data:       product,
    })

    // Step 4: Fetch variations
    const variationsRes = await get(`/products/variations/${product.product_id}`)
    const variations = variationsRes.data

    for (let i = 0; i < variations.length; i++) {
      const variation = variations[i]
      const today = new Date().toISOString().split('T')[0]

      // Step 5: Upsert variation — STATIC fields only.
      // NOTE: variation.available_dates (bookable dates / timeslots) is DYNAMIC
      // and intentionally NOT stored — it is fetched live at view time.
      await db.upsert('product_variations', {
        product_id:       product.product_id,
        variation_id:     variation.variation_id,
        name:             variation.name,
        from_date:        variation.from,
        to_date:          variation.to,
        appointment_type: variation.appointment_type,
        is_default:       i === 0,
      })

      // Step 6: Fetch options for today
      const options = await get(`/products/availoptions/${variation.variation_id}`, { date: today })

      // Step 7: Refresh options
      await db.delete('product_options', { product_id: product.product_id, variation_id: variation.variation_id })
      for (const [optionId, option] of Object.entries(options)) {
        await db.insert('product_options', {
          product_id:    product.product_id,
          variation_id:  variation.variation_id,
          option_id:     option.option_id,
          name:          option.name,
          sort_order:    option.sort_order,
          original_price: parseFloat(option.original_price),
          regiondo_price: parseFloat(option.regiondo_price),
          capacity:      option.capacity,
        })
      }
    }
  }
}
```

---

## 6. Flow B — Variation-based Timeslot Fetching

On the product detail page, show timeslots for the selected variation. Start with the default (first) variation.

```
USER opens product detail page
  │
  ▼
Load product from DB
  SELECT * FROM products WHERE id = ? AND trip_type = 'regiondo'
  SELECT * FROM product_variations WHERE product_id = ? ORDER BY sort_order ASC
  SELECT * FROM product_options WHERE product_id = ? ORDER BY sort_order ASC
  │
  ▼
Default variation = first variation (is_default = true)
  │
  ▼
Fetch available dates for the default variation (current month + next month)
  GET /products/timeslots/dates
    ?variation_id={default_variation_id}
    &from_date={today}
    &to_date={today + 60 days}
  → Show dates on calendar / date picker
  │
  ▼
USER selects a date
  │
  ▼
Fetch timeslots for that date
  GET /products/timeslots
    ?regiondo_variation_id={variation_id}
    &from_datetime={selected_date} 00:00:00
    &to_datetime={selected_date} 23:59:59
  → Show time slots with availability
  │
  ▼
USER selects a time slot
  │
  ▼
Fetch live options with stock for that exact date + time
  GET /products/availoptions/{variation_id}
    ?date={selected_date}
    &time={selected_time}
  → Show ticket types (Adult, Child, etc.) with qty_left and price
  │
  ▼
USER changes variation (e.g. "Premium Tour" instead of "Standard")
  │
  ▼
Repeat from "Fetch available dates" with new variation_id
```

**API sequence for a single user interaction:**

```
1. Page load:
   GET /products/timeslots/dates?variation_id=var-001&from_date=2025-06-01&to_date=2025-07-31
   → [{ date: "2025-06-09" }, { date: "2025-06-10" }, ...]

2. User picks 2025-06-09:
   GET /products/timeslots?regiondo_variation_id=var-001&from_datetime=2025-06-09 00:00:00&to_datetime=2025-06-09 23:59:59
   → [{ start_date_time: "2025-06-09 10:00:00", is_available: 1, qty_available: 38 }, ...]

3. User picks 14:00:
   GET /products/availoptions/var-001?date=2025-06-09&time=14:00
   → { "opt-adult": { name: "Adult", qty_left: 38, regiondo_price: "25.00" }, ... }
```

---

## 7. Flow C — Real-time Availability on Date Select

For the product listing page (showing all Regiondo products), display the seat availability for each product's default variation.

```
PRODUCT LISTING PAGE LOAD
  │
  ▼
Fetch all products from DB
  SELECT p.*, pv.variation_id as default_variation_id
  FROM products p
  LEFT JOIN product_variations pv ON pv.product_id = p.id AND pv.is_default = true
  WHERE p.trip_type = 'regiondo' AND p.in_stock = true
  │
  ▼
For each product (in parallel, batched):
  GET /products/timeslots
    ?regiondo_variation_id={default_variation_id}
    &from_datetime={today} 00:00:00
    &to_datetime={today + 7 days} 23:59:59
  → Get next 7 days of timeslots for display
  │
  ▼
Aggregate for each product:
  total_capacity     = sum(event_capacity)
  qty_available      = sum(qty_available for is_available=1 slots)
  resource_usage_%   = (total_capacity - qty_available) / total_capacity * 100
  next_available     = earliest start_date_time where is_available=1
  │
  ▼
Display on listing:
  [Product Card]
    Name: City Walking Tour
    Next available: Tue Jun 10, 14:00
    Availability: 38 / 50 seats
    Capacity usage: 24%
```

**Recommendation:** Cache this data in the `timeslots` table and refresh every N minutes rather than calling the API on every page load. This avoids rate limiting.

---

## 8. Integration with Palisis Products

Both Palisis and Regiondo products are displayed on the same product listing page. The key differentiator is the `trip_type` column.

### Field comparison

| Field | Palisis | Regiondo |
|---|---|---|
| `id` | `tour_id` from TourCMS | `product_id` from Regiondo |
| `trip_type` | `'palisis'` | `'regiondo'` |
| `name` | `tour_name` | `name` |
| `thumbnail` | `thumbnail_image` | `thumbnail` |
| `price` | `from_price` | `original_price` |
| `currency` | `sale_currency` | `currency_code` |
| `availability` | Via TourCMS `checkTourAvailability` | Via Regiondo `/products/timeslots` |
| `booking flow` | TourCMS start/commit booking | Regiondo Booking Widget |
| Variations | Not applicable (single product) | `product_variations` table |
| Options/ticket types | Departure `component_key` | `product_options` table |

### Extra fields needed on the shared `products` table

These fields are needed specifically for Regiondo products:

### Product listing logic

```js
// On product listing page
const products = await db.query(`
  SELECT * FROM products
  WHERE in_stock = true AND is_expired = false
  ORDER BY sort_order ASC, name ASC
`)

// Render differently based on trip_type
for (const product of products) {
  if (product.trip_type === 'palisis') {
    // Show TourCMS-style info
    // Booking → TourCMS availability check flow
  } else if (product.trip_type === 'regiondo') {
    // Show variation selector
    // Availability → Regiondo /products/timeslots
    // Booking → Regiondo Booking Widget
  }
}
```

### Product detail page logic

```js
async function loadProductDetail(productId) {
  const product = await db.findOne('products', { id: productId })

  if (product.trip_type === 'palisis') {
    // Use TourCMS API for dates/prices/availability
    const avail = await tourcms.checkTourAvailability(channelId, productId, params)
    // ...

  } else if (product.trip_type === 'regiondo') {
    // Load variations from DB
    const variations = await db.findAll('product_variations', { product_id: productId })
    const defaultVariation = variations.find(v => v.is_default) || variations[0]

    // Fetch live available dates for default variation
    const dates = await regiondoApi.get('/products/timeslots/dates', {
      variation_id: defaultVariation.variation_id,
      from_date:    today,
      to_date:      in60Days,
    })

    // When user picks a date → fetch timeslots
    // When user picks a time → fetch options + qty_left
    // When user selects variation → repeat with new variation_id
  }
}
```

---

## Quick Reference — All Regiondo Endpoints

| Method | Endpoint | Purpose | Store or Live |
|---|---|---|---|
| GET | `/products?limit=250&store_locale=en-US` | List all products | **Import** |
| GET | `/products/{productId}?store_locale=en-US` | Single product full detail | **Import** |
| GET | `/products/variations/{productId}` | Product variations list | **Import** |
| GET | `/products/availoptions/{variationId}?date=&time=` | Options with live stock | **Live** |
| GET | `/products/timeslots/dates?variation_id=&from_date=&to_date=` | Available dates | **Live** |
| GET | `/products/timeslots?regiondo_variation_id=&from_datetime=&to_datetime=` | Time slots + capacity | **Live** |
| GET | `/products/options/{optionId}` | Single option detail | **Import** |
| GET | `/supplier/bookings?product_ids=&type=&date_range=` | Fetch bookings | Sync |
| GET | `/partner/solditems?product_ids=&date_range=` | Sold items / tickets | Sync |
| POST | `/checkout/permanentreservation?place_booking=true` | Create reservation | Booking |
| POST | `/checkout/permanentreservation/purchase?booking_key=` | Complete purchase | Booking |
