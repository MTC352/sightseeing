# Trip Planner — How Chat, Canvas & Cart Should Work (Spec + Root‑Cause)

> Status: **proposal / source of truth for the planner rebuild.** This document
> describes (1) how the three planner surfaces *should* behave, (2) the exact
> architectural gap that has made the same bug recur, (3) why every previous fix
> failed, and (4) the concrete fix plan.

---

## 1. The three surfaces and their jobs

The planner has **three** surfaces that must always tell the same story:

| Surface | What it is | Job |
|---|---|---|
| **Chat** (left) | The AI assistant conversation | Understand the visitor's request, update preferences, and *describe* what's on the Canvas. **It curates and explains — it does not own a separate trip list.** |
| **Canvas** (right, "Recommended for you" + map) | The visible shortlist of trips | The **single source of truth** for "which trips match and are bookable on the selected date." |
| **Cart / "My Trip" list** | The trips the visitor chose to keep | The build-input for the itinerary. Separate from the Canvas (browsing ≠ committing). |

### The one invariant that must never break

> **Every trip the Chat names as a recommendation MUST be a trip currently shown
> on the Canvas, and the Canvas MUST always reflect the trips that match the
> visitor's requirements AND are bookable on the currently‑selected date.**

If the Chat names "Wine Tasting Experience" the Canvas must contain it. If the
Canvas shows Museums Mile, the Chat must be talking about Museums Mile. There is
exactly one shortlist; Chat and Canvas are two views of it.

---

## 2. How it should work (end‑to‑end behaviour)

### 2.1 Requirement matching (what makes a trip "a match")
A trip matches when it satisfies the visitor's expressed requirements:
- **Stored interests** (onboarding chips / filter bar — e.g. `day-trips`, `museums`, `food`).
- **Free‑text requirements from chat** (e.g. *"afternoon sightseeing"*, *"something with food in the evening"*). These are first‑class filters, **not** chat‑only context — they must influence the Canvas the same way a chip does.
- **Exclusions** (e.g. *"no wine"*, *"skip castles"*).
- **Soft signals** (weather, budget, duration fit) — used to **rank**, not to exclude.

### 2.2 Date & availability checking (the hard gate)
- A visit date is always effectively set (defaults to today; relative words like "friday" resolve deterministically — see `lib/planner/relative-date.ts`).
- Availability is checked against **the whole matching set** for the selected date using the authoritative real‑time path (`checkavail`, with a fallback from `datesndeals`). See `lib/planner/availability-scan.ts` and the TourCMS rules in `replit.md`.
- **A trip is shown in the on‑date Canvas only if it is bookable that day.** Matching‑but‑not‑bookable trips move to the "other dates" group with their next bookable dates — they are never silently dropped, and never presented as bookable today.

### 2.3 When the date changes (manually OR via chat)
This is the behaviour the visitor explicitly expects and that is currently broken:

> On **any** date change, re‑derive the Canvas from scratch: take **all** trips
> that match the visitor's requirements, re‑check availability for the new date,
> and show every matching trip bookable that day — **not** the previously‑pinned
> subset filtered down.

The Canvas must *re‑expand* to new matches for the new date, not just shrink the
old list. "Analyse all the trips again for this date," deterministically.

### 2.4 Preference updates
Preferences can change through four paths that must all behave identically:
onboarding steppers, the filter bar / suggestion chips (`applyDirectPref`), the
chat `updatePreferences` tool (`onToolCall`), and the route schema. Any of them
changing date/interests/exclusions must trigger the same Canvas re‑derivation and
the same chat acknowledgement.

### 2.5 Cart / "My Trip" list
- Adding a trip to the list is an explicit commit, independent of the Canvas shortlist.
- List trips with no timeslot on the selected date are disabled (greyed) before building.
- The itinerary builds from the list **minus** date‑disabled trips.

---

## 3. The architectural gap (why this keeps breaking)

There are **two independent "which trips" systems** that were never unified:

### System A — Canvas (deterministic, client)
```
resultTrips = displayedAiTrips.length > 0 ? displayedAiTrips : recommendedTrips
            └ filtered by effectiveAvail[id].availableOnSelectedDate
```
- `displayedAiTrips` (`aiTrips`) is derived **purely from the last `searchTrips`
  tool output in message history**. It has **no dependency on the current date**.
- `recommendedTrips` is the deterministic interest‑matched set (`fallbackTrips`),
  ordered by availability.

### System B — Chat prose (gpt‑4o‑mini free text)
- The prose names whatever trips the model chooses.
- It is constrained **only by prompt instructions and data signals** (the
  `availability` object on `searchTrips`, the canvas‑count line, "NEVER say the
  canvas shows X", etc.).
- **There is no programmatic reconciliation** between the prose's named trips and
  the trips the Canvas actually renders.

### How this produces the exact reported bugs
1. **Chat names a trip not on the Canvas (Wine Tasting):** the model named a trip
   that was not in the latest `searchTrips`/available set (it came from an earlier
   tool result, the `similarAvailableOnVisitDate` field, or model memory). Nothing
   forces *prose ⊆ canvas*, so it leaks.
2. **Date change keeps the same trips:** `displayedAiTrips` is pinned from old
   message history. Changing the date re‑runs `plannerAvail` — but that only
   *filters* the existing pinned set; it never *re‑derives* the matching set, so
   the Canvas can't re‑expand to other trips bookable on the new date.
3. **Chat & Canvas read different inputs:** the Canvas filters by stored
   `prefs.interests` (e.g. `day-trips`), while the Chat searches by the visitor's
   free‑text message (e.g. "food at evening"). Different inputs → different sets →
   guaranteed divergence.

---

## 4. Why every previous fix failed

All prior fixes were one of two kinds, and **both depend on the model obeying**:
- **Prompt instructions** — "base your reply on the availability object", "NEVER
  say the canvas shows X", "recommend by name only from the available list".
- **Richer data signals** — the per‑turn `availability` ground‑truth object, the
  live canvas‑count line, per‑card `available` flags.

gpt‑4o‑mini does not reliably follow allow‑list / negative instructions, so the
prose drifts. **There has never been a deterministic enforcement layer** that
makes the prose physically unable to contradict the Canvas, nor a date‑change
re‑derivation. That missing enforcement is the recurring root cause.

---

## 5. The fix plan

### Fix A — Canvas is the single source of truth + re‑derive on date change *(deterministic, no model dependency)*
- On **any** date/requirement change, re‑derive the Canvas from the full matching
  set re‑checked for the new date. Concretely: when the AI's pinned set
  (`aiAvailInfo.date`) is for a different date than `prefs.startDate`, stop using
  the stale `displayedAiTrips` and fall back to the freshly‑scanned
  `recommendedTrips` for the current date. (Small, safe change in `resultTrips` /
  `effectiveAvail` selection in `app/planner/page.tsx`.)
- Make free‑text chat requirements ("food at evening") feed the **same**
  deterministic Canvas matcher that chips feed, so Chat and Canvas read one input.

### Fix B — Programmatic Chat↔Canvas parity *(the missing enforcement layer)*
- Constrain the model's recommendable set server‑side: when a date is set,
  `searchTrips` returns **only** trips bookable that day as recommendable; not‑bookable
  ones go in a clearly separate "other dates" bucket the model may only use to
  suggest alternative dates.
- Add a deterministic guard so the prose can never silently name an off‑Canvas
  trip (reconcile named titles against the current Canvas set; either pin named
  available trips onto the Canvas or surface a correction — exact UX in §6 decision).

### Fix C — Model lever *(product/cost decision)*
The planner currently runs **gpt‑4o‑mini**, which is the weakest link for
instruction‑following. Fixes A+B make the system robust *regardless* of model, but
upgrading the planner chat model (e.g. gpt‑4o or Claude) materially reduces prose
drift. This is admin‑selectable (AI provider resolver) and affects cost, so it is
your call — surfaced, not changed silently.

---

## 6. Decision needed before the refactor

The one genuine product fork is **how strict the enforcement is**:

- **Option 1 — Canvas‑authoritative (recommended).** The Canvas is always the
  deterministic matching+available set. The Chat may only name trips on it; if the
  model names something off‑Canvas, it is corrected/pinned. Most robust; the Chat
  becomes a *describer/curator*, not an independent list owner.
- **Option 2 — AI‑pinned with forced re‑pin.** Keep the AI's curated pins as the
  Canvas, but force a fresh AI re‑pin on every date change (extra latency + token
  cost per date change).

Recommendation: **Option 1 + Fix C (model upgrade)** for a durable fix.
