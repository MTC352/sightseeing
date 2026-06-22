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

## Rule (checkavail REQUIRES a rate quantity, e.g. r1)
TourCMS `checkavail` returns **ZERO `<component>` rows** unless the request asks for at
least one rate quantity (e.g. `r1=<n>`). `datesndeals` does NOT need this. So any
`checkAvailability(...)` call that omits `r1` silently reports "no availability" even
when real bookable slots exist — this was the **weekend under-reporting bug in the
planner CHAT** (`getTripTimeslots` / `getTripDetails` tools in `app/api/planner/route.ts`).

**Why:** confirmed live — tcms_5 returned 0 components with no `r1`, but `r1=2` returned
09:30/13-spaces slots matching the public departures page.

**How to apply:** pass `r1` = the whole party size (`adults + children`, min 1) to every
`checkAvailability` call. In the planner route this rides on the module var
`_defaultPartySize` (set per request next to `_defaultVisitDate`). Using the real party
size also keeps results seat-honest (TourCMS omits slots that can't seat the group).
**Caveat:** `_defaultPartySize`/`_defaultVisitDate` are module-scoped mutable per-request
state — same cross-request race that already existed for the date; if you ever see
wrong-party availability under concurrency, localize these (AsyncLocalStorage / per-request
tool instances). The itinerary route's own checkavail fallback should get the same `r1`.

## Rule (cancelled-departure parity)
Every availability-COUNTING surface must drop cancelled departures (`d.status` matches
`/cancel/i`), exactly like the itinerary route's `shapeSlotFromDeparture` /
`isDepartureDateBookable`. `/api/planner/availability` once counted cancelled rows as
bookable, so it over-reported a date the itinerary build then rejected — the same
"chat says N open, rebuild yields fewer" mismatch as the party-size gap. **How to apply:**
in the datesndeals loop, `continue` on a cancelled status BEFORE counting seats.

## Rule (planner availability = DATE-level, not start_time-level)
`/api/planner/availability` must establish a trip's bookable dates from `datesndeals`
at the **DATE level only** — never require a per-date `start_time`. MULTI/recurring
tours (e.g. museum Combi-ticket with 30-min departures) return bookable dates with NO
start_time; requiring one drops them and falsely reports "not available today/tomorrow"
while the booking widget shows full slots. Mirror `isDepartureDateBookable` in the
itinerary route (drop start_time req, keep cancelled-drop + party-seat filter), then
fall back to `checkavail` (with `r1`) for any selected-date miss.

## Rule (dual-source failure = UNKNOWN, never "not available")
This is the failsafe against confidently-wrong AI claims. When BOTH availability
sources fail for the selected date (`datesndeals` throws AND the `checkavail`
fallback fails/throws), the verdict is **unknown/unconfirmed**, NOT a false
`availableOnSelectedDate:false`. A `checkavail` that returns `ok` (even with zero
slots) IS authoritative → that's a real "not available", not unknown.

**Why:** the planner availability snapshot grounds the planner CHAT. A silent
false-negative there makes the AI tell a visitor a trip is closed during a TourCMS
incident. An incident must read as "couldn't confirm — try again", never "no openings".

**How to apply:** the `unknown` flag must propagate end-to-end and stay in lockstep
across the 4 surfaces — availability route → client snapshot (`page.tsx`) → planner
route `searchTrips` grounding (as an `unconfirmed` list, EXCLUDED from
`noneAvailableOnVisitDate`) → system prompt (the AI is forbidden from calling an
unconfirmed trip "not available"). Classification precedence is shared/tested in
`lib/planner/availability-parity.ts` (`classifyTripAvailability`: onDate > unknown >
alternative-dates > none; `isConfidentNoneAvailable` = 0 bookable AND 0 unconfirmed).

## Related resilience invariants
- TourCMS `apiRequest` retries (backoff + jitter, honors Retry-After) **GET only** —
  POST/booking writes are never retried (double-booking risk).
- The per-trip availability fan-out is **concurrency-bounded** (not unbounded
  Promise.all) to avoid bursting TourCMS rate limits on 5-trip builds.
- A failed availability call must surface as **TOURCMS_ERROR ("try again")**, never
  be silently downgraded to NO_SLOTS ("no openings").
- Itinerary build/API failures are persisted via `logError(source:"itinerary")`
  (`lib/error-log.ts`) and reviewable at `/admin/logs`.

- **Date-level availability must be `start_time`-INDEPENDENT.** Both the itinerary
  route (`isDepartureDateBookable`) AND the planner availability scan
  (`app/api/planner/availability/route.ts` PASS-2 checkavail fallback) must NOT
  require a per-component `start_time`. MULTI/recurring tours return bookable
  components with NO concrete time (times only materialise at booking), so a
  `if (!c.start_time) return false` gate falsely reports them "not available
  today" while the booking widget shows full slots — this directly undercounts
  the planner "Available on Today" badge. Pure backstop:
  `isCheckavailComponentBookable` (seats + party-size only) in
  `lib/planner/availability-parity.ts`; verdict resolver
  `resolveSelectedDateFallback` keeps the dual-source-failure => `unknown`
  (never a false confident closure) rule.
