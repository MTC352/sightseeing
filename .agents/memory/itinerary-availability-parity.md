---
name: Itinerary availability — datesndeals vs checkavail parity
description: Why the planner falsely reported "No openings" and the booking-widget-parity rule that fixes it
---

# Itinerary availability source divergence

The itinerary builder and the public `/trip/[id]` Palisis booking widget read
availability from **two different TourCMS endpoints**, and they do not always agree:

- **Booking widget** → real-time `checkavail` (authoritative; this is what a
  customer actually sees and can book).
- **Itinerary builder** → bulk `datesndeals` listing (one call covers the chosen
  date + a 21-day alternative-date scan, cheap, but a *cache-style bulk feed*).

`datesndeals` can **under-report** a date that `checkavail` can actually book:
- "MULTI"/recurring tours return bookable DATES with **no per-date start_time**
  (the real times exist ONLY in `checkavail`),
- the wide multi-day window can omit the **very first day's** rows,
- a transient hiccup can return an `ok`-but-incomplete payload.

## Rule (booking-widget parity)
Whenever the bulk feed yields **zero slots for the chosen visit date**, ALWAYS
re-check the same authoritative `checkavail` endpoint the widget uses — do **not**
gate that fallback on whether the bulk feed happened to list the date.

**Why:** users saw real, bookable tomorrow slots on the trip page while the planner
said "No openings in the next 21 days" (e.g. tcms_23 Instagrammable Spots, tcms_14
BBQ Dinner Hopping). The fallback used to only fire when `datesndeals` already
listed the date, so missing dates were stamped NO_SLOTS.

**How to apply:** in `app/api/itinerary/route.ts`, the checkavail fallback fires on
`visitSlots.length === 0`. It can only ADD bookability (empty → still NO_SLOTS;
fallback error → TOURCMS_ERROR, never a false NO_SLOTS). Cost is ≤1 extra checkavail
per zero-slot trip, bounded by the fan-out concurrency cap.

## Rule (party-size parity)
Every surface that *counts* availability must filter slots by the **whole group size**,
exactly like the scheduler's `fitsParty` (`spacesRemaining >= partySize`; UNLIMITED /
empty / unparseable spaces always pass). Counting "≥1 seat" over-reports and a later
rebuild then drops trips the chat/alt-dates promised.

**Why:** chat & alternative-date counts said "N trips open" on a date, but building for
that date yielded fewer stops — a 1-seat slot looks open to a couple yet the scheduler
drops it. Three surfaces must agree: `lib/itinerary/scheduler.ts` (fitsParty, the source
of truth), `/api/planner/availability` (takes a `party` query param; cache key includes
party), and `alternativeDates` in `/api/itinerary` (counts only trips with a
party-fitting slot per date; empty MULTI buckets still pass, mirroring the date-source
rule above).

**How to apply:** the frontend passes `party = adults + children` and must refetch
availability when it changes (include it in the effect deps). Any new availability-count
surface must apply the same seat filter or it will diverge from build output.

## Related resilience invariants
- TourCMS `apiRequest` retries (backoff + jitter, honors Retry-After) **GET only** —
  POST/booking writes are never retried (double-booking risk).
- The per-trip availability fan-out is **concurrency-bounded** (not unbounded
  Promise.all) to avoid bursting TourCMS rate limits on 5-trip builds.
- A failed availability call must surface as **TOURCMS_ERROR ("try again")**, never
  be silently downgraded to NO_SLOTS ("no openings").
- Itinerary build/API failures are persisted via `logError(source:"itinerary")`
  (`lib/error-log.ts`) and reviewable at `/admin/logs`.
