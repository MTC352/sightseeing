---
name: TourCMS API call logging & rate limit
description: How outbound TourCMS/Palisis calls are logged and how the rate-limit status is surfaced.
---

# TourCMS API logging & rate-limit visibility

- Every outbound TourCMS call is logged fire-and-forget to the shared error-log store under source `tourcms` (info on success, error on failure), from the central `apiRequest` helper in `lib/tourcms.ts`. Admins review them at `/admin/logs?source=tourcms`.
- **The `/api/rate_limit_status.xml` endpoint is excluded from logging** — it is a free poll that does NOT count against the TourCMS hourly quota, so logging it would just create poll noise.
  - **Why:** it's the one TourCMS call that is quota-free; treating it like a normal call pollutes the audit log and misrepresents usage.
- `RateLimitStatus` (built only by `pingTourCMS`) carries remaining + hourly cap for GET and POST separately (`remaining_hits`/`hourly_limit`, `remaining_hits_post`/`hourly_limit_post`). Surfaced on the `/admin/palisis` page via `/api/admin/palisis-rate-limit`.
- Log volume is self-bounding: TourCMS's own ~hourly quota caps how many real calls (and thus log writes) can happen, and `pruneOldLogs` keeps per-source caps via `CAPPED_SOURCES` in `lib/error-log.ts` (itinerary 5000, tourcms 3000) plus 30-day retention.
