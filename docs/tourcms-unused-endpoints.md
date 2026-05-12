# TourCMS — Endpoints We Do NOT Use

> These endpoints exist in the TourCMS API but are NOT used by sightseeing.lu.
> Stored here for reference only. Do not implement unless requirements change.
> Active endpoints are documented in `docs/tourcms-api-reference.md`.

---

## Why we don't use these

Our integration model is:
- **Read-only** from TourCMS except for booking creation
- Tours are **imported into our DB** and served from there (not fetched live per page view)
- **No modifications** to TourCMS data (tours, departures, availability, bookings) from our site

---

## Excluded Endpoints

### Channels
- `GET /p/channels/list` — we know our single channel
- `GET /p/channels/performance` / `GET /c/channel/performance` — not needed for site
- `GET /c/markups/show` — internal operator use
- `POST /p/channel/create` / `POST /p/channel/update` — we do not provision channels via API

### Tours — General
- `GET /p/tours/search` / `GET /c/tours/search` — used for customer-facing **search only** (not import). Import uses `LIST`, not `SEARCH`.
- `POST /c/tour/update` — **WE NEVER MODIFY TOURS ON TOURCMS**
- `GET /c/tour/locations/list` — not needed; we store location in DB from import
- `GET /c/tours/filters/list` — Tour Operator only; not for us
- `GET /p/hotels/search_avail` / `GET /p/hotels/search_range` — we don't sell hotels
- `GET /c/booking/options/checkavail` — for adding options to existing bookings (future feature if needed)
- `GET /c/promo/show` — promo code validation (future feature)
- `GET /c/tour/locations/list` — not needed
- Tour Search Criteria, Tour Promotions — not needed

### Tours — Bulk Export
- `GET /c/tours/images/list` — image URLs come from Show Tour; no need to call separately
- `GET /c/tour/datesprices/dep/show` — Tour Departures endpoint; for operators only

### Tours — Tour Operator Only (we have no access)
- `POST /c/tour/delete` — we NEVER delete tours on TourCMS
- `POST /c/tour/upload` / `POST /c/tours/files/upload/url` / `POST /c/tours/files/upload/process` — Tour Operator only; we manage our own images
- `POST /c/tour/images/delete` / `POST /c/tour/document/delete` — Tour Operator only
- All Departure Management endpoints (`/c/tour/datesprices/dep/manage/*`):
  - `GET /c/tour/datesprices/dep/manage/search` — Operator only
  - `GET /c/tour/datesprices/dep/manage/show` — Operator only
  - `POST /c/tour/datesprices/dep/manage/new` — **WE NEVER CREATE DEPARTURES ON TOURCMS**
  - `POST /c/tour/datesprices/dep/manage/update` — **WE NEVER MODIFY DEPARTURES**
  - `POST /c/tour/datesprices/dep/manage/delete` — **WE NEVER DELETE DEPARTURES**
  - `GET /c/tour/datesprices/freesale/show` — Operator only
- `GET /c/channel/logo/upload/url` + `POST /c/channel/logo/upload/process` — Operator only

### Bookings
- `POST /c/booking/new/get_redirect_url` — **Tour Operator only**. Marketplace Agents skip this step entirely.
- `GET /p/bookings/list` / `GET /c/bookings/list` — not needed; bookings are managed on TourCMS platform
- `POST /c/booking/update` — Tour Operator only; we do not modify bookings
- `POST /c/booking/cancel` — **WE NEVER CANCEL BOOKINGS FROM OUR SITE** (customers use TourCMS platform directly)
- `POST /c/booking/note/new` — not needed
- `POST /c/booking/email/send` — TourCMS sends confirmation emails automatically
- `POST /c/booking/component/new` / `/update` / `/delete` — Operator only; we do not modify booking components
- `POST /c/booking/delete` — for releasing temporary bookings; may be useful in future if cart-abandonment handling is needed

### Payments
- `POST /c/booking/payment/new` — Tour Operator only; payment is out of scope for now
- `POST /c/booking/payment/spreedly/new` — Spreedly integration not in use
- `GET /c/booking/payment/list` — operator accounting; not for our site
- `POST /c/booking/payment/fail/new` — payment failure logging; not in use
- `POST /c/booking/gatewaytransaction/spreedlycomplete` — Spreedly only

### Vouchers
- `POST /c/voucher/search` — voucher redemption; not our use case (operators run check-in)
- `POST /c/voucher/redeem` — same

### Customers & Enquiries
- `GET /c/customer/show` / `POST /c/customer/update` — permission 3 required; not needed
- `POST /c/customer/create` — Tour Operator only
- `POST /c/customer/verification` — Tour Operator only; we manage our own auth
- `GET /c/customers/login_search` — Tour Operator only
- `POST /c/enquiry/new` / `GET /c/enquiries/search` / `GET /c/enquiry/show` — enquiry flow not implemented

### Agents
- `GET /c/agent_profile/show` / `POST /c/agent_profile/update` — agent portal management
- `GET /c/agents/search` — Tour Operator only
- `POST /c/agent/update` — Tour Operator only
- `GET/POST /c/agent/remote_login` — Tour Operator only
- `POST /c/start_agent_login` / `GET /c/retrieve_agent_booking_key` — Operator only; agents skip booking key step

### Internal Suppliers & Staff
- `GET /c/supplier/show` — Tour Operator only
- `GET /c/staff/list` — Tour Operator only
- All Account Admin endpoints (`/p/account/create`, `/update`, `/show`) — not needed

### Pickup Points & Tour Pickup Routes
- All pickup CRUD endpoints — Tour Operator only; we show pickup info from Check Availability response

### Tour GEO Points & Tour Tiers
- All geopoint and tier endpoints — Tour Operator only

### Account Custom Fields & Tour Import (subsystem)
- `/api/account/custom_fields/get` — Tour Operator only
- `/api/tours/importer/*` — subsystem importer for operators; we use `/p/tours/list` instead
- `/api/tours/restrictions/list_tour_bookings_restrictions` — not needed for our booking form

### Alternative Auth Scheme (Appendix C)
- `X-TC-API-KEY` / `X-TC-TIMESTAMP` / `X-TC-SIGNATURE` headers — **DO NOT USE**. This is an undocumented custom scheme from older forked PHP clients. Use the standard HMAC-SHA256 scheme documented in our active reference.
