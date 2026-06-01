---
name: TourCMS MULTI tours
description: "MULTI" tours return bookable dates with no time — must resolve via checkAvailability, not datesndeals.
---

# MULTI tours: bookable dates carry no start_time

Some TourCMS/Palisis tours (e.g. the BBQ tour) have `start_time = "MULTI"`. Their
`showTourDatesAndDeals` (datesndeals) rows return bookable DATES but **no concrete
start_time**, so a slot-shaper that requires `start_time` drops them and the trip is
falsely reported as "No openings in next 21 days".

**Why:** for MULTI tours the real per-day timeslots only exist in the real-time
`checkAvailability` endpoint, not in datesndeals.

**How to apply (in `app/api/itinerary/route.ts`):**
- Detect date-level bookability separately from time presence (`isDepartureDateBookable`:
  has start_date, not cancelled, spaces != 0 — "UNLIMITED" is bookable).
- Seed those bookable dates as empty buckets in `slotsByDate` so alternative-date
  suggestions surface them.
- For the chosen visit date with zero concrete slots, call `checkAvailability(config,
  palisisId, {date, show_pickups:"0"})` and shape `AvailabilityComponent` → LiveSlot.
- `spaces_remaining` can be the string "UNLIMITED" — never parseInt it blindly.
