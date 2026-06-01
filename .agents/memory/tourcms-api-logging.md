---
name: TourCMS API call logging & rate limit
description: How outbound TourCMS/Palisis calls are logged and how the rate-limit status is surfaced.
---

# TourCMS API logging & rate-limit visibility

- Every outbound TourCMS call is logged fire-and-forget to the shared error-log store under source `tourcms` (info on success, error on failure), from the central `apiRequest` helper in `lib/tourcms.ts`. Admins review them at `/admin/logs?source=tourcms`.
- **The `/api/rate_limit_status.xml` endpoint is excluded from logging** — it is a free poll that does NOT count against the TourCMS hourly quota, so logging it would just create poll noise.
  - **Why:** it's the one TourCMS call that is quota-free; treating it like a normal call pollutes the audit log and misrepresents usage.
- `RateLimitStatus` (built only by `pingTourCMS`) carries remaining + hourly cap for GET and POST separately (`remaining_hits`/`hourly_limit`, `remaining_hits_post`/`hourly_limit_post`). Surfaced on the `/admin/palisis` page via `/api/admin/palisis-rate-limit`.
## channelId=0 is Marketplace-Agent-only (private-channel 401 gotcha)

- This account is a **private channel account**: channelId `13407`, marketplaceId `0`. All working `/c/` calls (availability/timeslots) sign with the real channelId.
- **`channelId=0` in the auth signature is ONLY valid for Marketplace Agent accounts (marketplaceId != 0).** Signing a private-channel account with 0 returns `FAIL_KEYNOTFOUND` / HTTP 401 even though the key is perfectly valid.
  - **Why:** caused the admin "test API key" + rate-limit card to 401 while the public site's timeslots worked fine — same key, different channelId. The fix: `pingTourCMS` signs with `config.marketplaceId ? 0 : config.channelId`.
  - **How to apply:** any rate-limit/connectivity/`/p/` call that hardcodes `0` will 401 on a private-channel account. Use the real channelId unless marketplaceId is set. `listTours` (`/p/tours/list.xml`) still hardcodes 0 — it will 401 here too if ever used.

- Log volume is self-bounding: TourCMS's own ~hourly quota caps how many real calls (and thus log writes) can happen, and `pruneOldLogs` keeps per-source caps via `CAPPED_SOURCES` in `lib/error-log.ts` (itinerary 5000, tourcms 3000) plus 30-day retention.
