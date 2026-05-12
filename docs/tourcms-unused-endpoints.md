# TourCMS — Endpoints We Do NOT Use

> These endpoints exist in the TourCMS API but are NOT used by sightseeing.lu.
> Stored here for reference only. Do not implement unless requirements change.
> Active endpoints are documented in `docs/tourcms-api-reference.md`.
>
> **For full schemas of any endpoint below**, see one of:
> 1. The full TourCMS API reference we received: `attached_assets/tourcms_api_reference_(2)_1778567800901.md`
>    (2200 lines — has the complete request/response shapes for every endpoint)
> 2. The official TourCMS docs URL listed alongside each endpoint below
> 3. The `tourcms-js` wrapper: https://www.npmjs.com/package/tourcms-js (cross-reference in Appendix B of the full reference)

---

## Why we don't use these

Our integration model is:
- **Read-only** from TourCMS except for booking creation
- Tours are **imported into our DB** and served from there (not fetched live per page view)
- **No modifications** to TourCMS data (tours, departures, availability, bookings) from our site

If a requirement changes and we need one of the endpoints below:
1. Look up the full schema in `attached_assets/tourcms_api_reference_(2)_*.md` (search for the endpoint path)
2. Or visit the TourCMS docs URL listed below
3. Add the method to `lib/tourcms.ts` following the existing patterns
4. Move the entry from this file to `docs/tourcms-api-reference.md` and document the use case

---

## Excluded Endpoints

### Channels

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/p/channels/list` | GET | We know our single channel | `tourcms_api_reference §5.1` · https://www.tourcms.com/support/api/mp/channel_list.php |
| `/p/channels/performance` / `/c/channel/performance` | GET | Operator analytics — not needed | `§5.3` · https://www.tourcms.com/support/api/mp/channel_perf.php |
| `/c/markups/show` | GET | Internal operator markup config | `§5.4` · https://www.tourcms.com/support/api/mp/markup_show.php |
| `/p/channel/create` / `/p/channel/update` | POST | We do not provision channels | `§5.5` (wrapper-observed) |

### Tours — General

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/p/tours/search` / `/c/tours/search` | GET | Customer-facing keyword search ONLY (not for import). Listed in active reference for that purpose. | `§6.1` · https://www.tourcms.com/support/api/mp/tour_search.php |
| `/c/tour/update` | POST | **WE NEVER MODIFY TOURS ON TOURCMS** | `§6.5` · https://www.tourcms.com/support/api/mp/tour_update.php |
| `/c/tour/locations/list` | GET | We store location in DB during import | `§6.6` · https://www.tourcms.com/support/api/mp/tour_locations.php |
| `/c/tours/filters/list` | GET | Tour Operator only | `§6.7` · https://www.tourcms.com/support/api/mp/tour_filters.php |
| `/p/hotels/search_avail` / `/p/hotels/search_range` | GET | We don't sell hotels | `§6.8` · https://www.tourcms.com/support/api/mp/hotel_search.php |
| `/c/booking/options/checkavail` | GET | For adding options to existing bookings (future feature) | `§6.8c` · https://www.tourcms.com/support/api/mp/option_checkavail.php |
| `/c/promo/show` | GET | Promo code validation (future feature if we add discounts) | `§6.8d` / `§12.9` · https://www.tourcms.com/support/api/mp/promo_show.php |
| Tour search criteria | GET | Operator search-form metadata | `§6.10` · https://www.tourcms.com/support/api/mp/tour_search_criteria.php |

### Tours — Bulk Export

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/c/tours/images/list` | GET | Image URLs come from Show Tour — no separate call needed | `§7.2` · https://www.tourcms.com/support/api/mp/tour_images_list.php |
| `/c/tour/datesprices/dep/show` | GET | Tour Operator only | `§7.3` · https://www.tourcms.com/support/api/mp/dep_show.php |

### Tours — Tour Operator Only (we have no access)

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/c/tour/delete` | POST | We NEVER delete tours on TourCMS | `§8.1` · https://www.tourcms.com/support/api/mp/tour_delete.php |
| `/c/tours/files/upload/url` + `/process` | POST | Tour Operator only — we manage own images | `§8.5` · https://www.tourcms.com/support/api/mp/tour_upload.php |
| `/c/tour/images/delete` / `/c/tour/document/delete` | POST | Tour Operator only | `§8.3` |
| `/c/tour/datesprices/dep/manage/search` | GET | **Operator only** — even though it's in our `lib/tourcms.ts` it may return `FAIL_TOUROPONLY`. Use `checkAvailability` instead. | `§8.4.1` · https://www.tourcms.com/support/api/mp/dep_manage_search.php |
| `/c/tour/datesprices/dep/manage/show` | GET | Operator only | `§8.4.2` |
| `/c/tour/datesprices/dep/manage/new` | POST | **WE NEVER CREATE DEPARTURES ON TOURCMS** | `§8.4.3` |
| `/c/tour/datesprices/dep/manage/update` | POST | **WE NEVER MODIFY DEPARTURES** | `§8.4.4` |
| `/c/tour/datesprices/dep/manage/delete` | POST | **WE NEVER DELETE DEPARTURES** | `§8.4.5` |
| `/c/tour/datesprices/freesale/show` | GET | Operator only | `§8.4.6` |
| `/c/channel/logo/upload/url` + `/process` | POST | Operator only | `§8.6` |

### Bookings

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/c/booking/new/get_redirect_url` | POST | **Tour Operator only** — Marketplace Agents skip this step | `§9.1` · https://www.tourcms.com/support/api/mp/booking_redirect.php |
| `/p/bookings/list` / `/c/bookings/list` | GET | Bookings managed on TourCMS platform; we don't list ours | `§9.5` · https://www.tourcms.com/support/api/mp/bookings_list.php |
| `/c/booking/update` | POST | Tour Operator only; we never modify bookings | `§9.6` · https://www.tourcms.com/support/api/mp/booking_update.php |
| `/c/booking/cancel` | POST | **WE NEVER CANCEL BOOKINGS FROM OUR SITE** (customers go via Palisis) | `§9.7` · https://www.tourcms.com/support/api/mp/booking_cancel.php |
| `/c/booking/note/new` | POST | Internal note system — not needed | `§9.8` · https://www.tourcms.com/support/api/mp/booking_note.php |
| `/c/booking/email/send` | POST | TourCMS sends confirmation emails automatically | `§9.9` · https://www.tourcms.com/support/api/mp/booking_email.php |
| `/c/booking/component/new` / `/update` / `/delete` | POST | Operator only — we don't modify booking components | `§9.10–9.12` |
| `/c/booking/delete` | POST | Releases temp bookings — useful for cart-abandonment (future) | `§9.13` · https://www.tourcms.com/support/api/mp/booking_delete.php |

### Payments

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/c/booking/payment/new` | POST | Tour Operator only; payment is out of scope | `§10.1` · https://www.tourcms.com/support/api/mp/payment_create.php |
| `/c/booking/payment/spreedly/new` | POST | Spreedly not in use | `§10.2` · https://www.tourcms.com/support/api/mp/spreedly_payment_create.php |
| `/c/booking/payment/list` | GET | Operator accounting | `§10.3` · https://www.tourcms.com/support/api/mp/payment_list.php |
| `/c/booking/payment/fail/new` | POST | Failed-payment audit log | `§10.4` · https://www.tourcms.com/support/api/mp/payment_log_fail.php |
| `/c/booking/gatewaytransaction/spreedlycomplete` | POST | Spreedly only | `§10.5` |
| `/c/booking/payment/payworks/new` | POST | Payworks only | `§10.6` |

### Vouchers

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/c/voucher/search` | POST | Voucher redemption — operators run check-in | `§11.1` · https://www.tourcms.com/support/api/mp/voucher_search.php |
| `/c/voucher/redeem` | POST | Same | `§11.2` · https://www.tourcms.com/support/api/mp/voucher_redeem.php |

### Customers & Enquiries

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/c/customer/show` | GET | Permission level 3 required; we manage own users | `§12.1` · https://www.tourcms.com/support/api/mp/customer_show.php |
| `/c/customer/update` | POST | Same | `§12.2` · https://www.tourcms.com/support/api/mp/customer_update.php |
| `/c/customer/create` | POST | Tour Operator only | `§12.3` · https://www.tourcms.com/support/api/mp/customer_create.php |
| `/c/customer/verification` | POST | Tour Operator only — we manage our own auth | `§12.4` · https://www.tourcms.com/support/api/mp/customer_verification.php |
| `/c/customers/login_search` | GET | Tour Operator only | `§12.5` · https://www.tourcms.com/support/api/mp/customer_login.php |
| `/c/enquiry/new` / `/show` / `/c/enquiries/search` | POST/GET | Enquiry flow not implemented | `§12.6–12.8` · https://www.tourcms.com/support/api/mp/enquiry_create.php |

### Agents

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/c/agent_profile/show` / `/update` | GET/POST | Agent portal management | `§13.1–13.2` · https://www.tourcms.com/support/api/mp/show_agent_profile.php |
| `/c/agents/search` | GET | Tour Operator only | `§13.3` · https://www.tourcms.com/support/api/mp/agent_search.php |
| `/c/agent/update` | POST | Tour Operator only | `§13.4` · https://www.tourcms.com/support/api/mp/agent_update.php |
| `/c/agent/remote_login` | GET/POST | Tour Operator only | `§13.5` · https://www.tourcms.com/support/api/mp/remote_agent_login.php |
| `/c/start_agent_login` / `/c/retrieve_agent_booking_key` | POST/GET | Operator-only; agents skip booking-key step | `§13.6–13.7` |

### Internal Suppliers, Staff, Account Admin

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/c/supplier/show` | GET | Tour Operator only | `§14.1` · https://www.tourcms.com/support/api/mp/supplier_show.php |
| `/c/staff/list` / `/c/staff_members/list` | GET | Tour Operator only | `§14.2` · https://www.tourcms.com/support/api/mp/staff_members_list.php |
| `/p/account/create` / `/update` / `/show` | POST/GET | We do not provision TourCMS accounts | `§14.3` |

### Pickup Points & Tour Pickup Routes

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/c/pickups/list` / `/new` / `/update` / `/delete` | GET/POST | Tour Operator only — pickup info comes from Check Availability response | `§15.1` · https://www.tourcms.com/support/api/mp/pickup_point_managing.php |
| `/api/tours/pickup/routes/*` (5 endpoints) | GET/POST | Tour Operator only | `§15.2` |

### Tour GEO Points & Tour Tiers

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/api/tours/geos/create` / `/update` / `/delete` | POST | Tour Operator only | `§16.1` · https://www.tourcms.com/support/api/mp/tour_geopoint_managing.php |
| `/c/tour/tier/add` / `/update` / `/delete` / `/show` / `/list` | POST/GET | Tour Operator only — volume pricing | `§16.2` · https://www.tourcms.com/support/api/mp/tour_tier_add.php |

### Account Custom Fields & Tour Import (subsystem)

| Endpoint | Verb | Why unused | Source doc |
|---|---|---|---|
| `/api/account/custom_fields/get` | GET | Tour Operator only | `§17.1` · https://www.tourcms.com/support/api/mp/custom_fields_get.php |
| `/api/tours/importer/*` (3 endpoints) | GET/POST | Subsystem importer for operators — we use `/p/tours/list` | `§17.2` |
| `/api/tours/restrictions/list_tour_bookings_restrictions` | GET | Booking field restrictions metadata | `§17.3` · https://www.tourcms.com/support/api/mp/list_tour_booking_restrictions.php |

### Alternative Auth Scheme (Appendix C)

- `X-TC-API-KEY` / `X-TC-TIMESTAMP` / `X-TC-SIGNATURE` headers — **DO NOT USE.** This is an undocumented custom scheme from older forked PHP clients. Use the standard HMAC-SHA256 scheme documented in our active reference.

---

## How to look up full details

Every endpoint above has its full schema documented in **one of three places**:

1. **`attached_assets/tourcms_api_reference_(2)_1778567800901.md`** (the comprehensive 2200-line reference) — search for the `§` section number listed in the table above (e.g. `§9.7` for Cancel Booking)
2. **TourCMS official docs** — the URLs listed in the tables go directly to each endpoint's spec page
3. **The wrapper** — `tourcms-js` on npm has working examples for all of these

Once we decide to use a new endpoint:
1. Add a method to `lib/tourcms.ts` following the existing patterns (use the helpers — they handle signing, parsing, errors)
2. Move the row from this file to `docs/tourcms-api-reference.md` and add a "Why we use it" section
3. Update `app/admin/implementation/page.tsx` if it changes our data flow
