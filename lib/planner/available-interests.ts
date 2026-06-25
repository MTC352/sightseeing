/**
 * Pure helper for the conversational planner's per-turn "AVAILABLE INTERESTS ON
 * VISIT DATE" grounding (used by app/api/planner/route.ts).
 *
 * Why this exists (see memory: planner-recommendations / itinerary-availability-
 * parity): the AI only receives per-trip availability AFTER it runs `searchTrips`,
 * and only for the trips that search returned. It has no standing, per-turn signal
 * for WHICH interest themes actually have a trip bookable on the chosen date. That
 * gap let the model freely suggest categories it had already determined were empty
 * — e.g. proposing "indoor options like museums or cultural tours" for a rainy day
 * even though no museum/cultural-tour trip runs that day, then telling the visitor
 * "no cultural tours available today" the moment they picked one.
 *
 * `computeAvailableInterests` folds the live availability snapshot (the same
 * party/cancellation-filtered scan `searchTrips` grounds on) up to the INTEREST
 * level: for each canonical interest tag, is there ≥1 catalog trip carrying that
 * tag that is bookable on the visit date? The route surfaces the result as a
 * directive prompt block so the model only ever proposes themes that are really
 * bookable that day, and never re-suggests a theme already shown to be empty.
 *
 * Pure module: no DB, no env, no server-only imports, so it is unit-testable and
 * safe to import from both the route handler and tests.
 */

import { matchTripInterest, type MatchableTrip } from "./interest-match"

export interface InterestVocabEntry {
  value: string
  label: string
}

/**
 * A catalog trip the theme-availability fold can match interests against. The
 * text fields (title/description/category/etc) are optional but, when present,
 * let a theme count as "offered" even when it was never tagged — matching the
 * content-aware behavior of the Trip Canvas + searchTrips (see interest-match).
 */
export interface CatalogTripLite extends MatchableTrip {
  id: string
}

/**
 * Per-trip availability status on the visit date, derived from the snapshot:
 *  - "available"   → bookable on the visit date.
 *  - "unavailable" → confidently NOT bookable on the visit date (alternative/none).
 *  - "unknown"     → not in the snapshot, or a dual-source incident (unconfirmed).
 *
 * "unknown" trips must NEVER push an interest into the not-bookable bucket — an
 * undetermined trip is not evidence the theme is empty that day.
 */
export type InterestTripStatus = "available" | "unavailable" | "unknown"

export interface AvailableInterestsResult {
  /** Interests with ≥1 catalog trip bookable on the visit date. Safe to suggest. */
  available: InterestVocabEntry[]
  /**
   * Interests that exist in the catalog but whose trips are ALL confidently not
   * bookable on the visit date (none available, at least one confidently off).
   * The AI must not propose these for that date — offer other dates instead.
   */
  unavailableOnDate: InterestVocabEntry[]
}

/**
 * Fold a per-trip availability classifier up to the interest/theme level.
 *
 * For each interest in `vocab`, find the catalog trips carrying that tag (in
 * `tags` or `tripTags`) and classify each via `tripStatus`:
 *  - any "available"  → the interest is bookable that day  → `available`.
 *  - else any "unavailable" → confidently empty that day   → `unavailableOnDate`.
 *  - else (only "unknown") → undetermined → omitted from both lists.
 *
 * Interests with NO matching catalog trip at all are omitted entirely (we make no
 * claim about a theme the site does not even offer).
 */
export function computeAvailableInterests(args: {
  vocab: InterestVocabEntry[]
  catalog: CatalogTripLite[]
  tripStatus: (tripId: string) => InterestTripStatus
}): AvailableInterestsResult {
  const { vocab, catalog, tripStatus } = args
  const available: InterestVocabEntry[] = []
  const unavailableOnDate: InterestVocabEntry[] = []
  const seen = new Set<string>()

  for (const entry of vocab) {
    if (!entry || typeof entry.value !== "string" || !entry.value) continue
    if (seen.has(entry.value)) continue
    seen.add(entry.value)

    // Content-aware: a theme is "offered" if any catalog trip matches it via an
    // exact tag OR via its title/description/category/etc — NOT tags alone. So a
    // museum trip that was never tagged `museums` still counts toward the theme.
    const themeTrips = catalog.filter((t) => matchTripInterest(t, entry).matched)
    if (themeTrips.length === 0) continue // theme not offered at all → no claim.

    let anyAvailable = false
    let anyUnavailable = false
    for (const t of themeTrips) {
      const s = tripStatus(t.id)
      if (s === "available") {
        anyAvailable = true
        break
      }
      if (s === "unavailable") anyUnavailable = true
    }

    const item = { value: entry.value, label: entry.label }
    if (anyAvailable) available.push(item)
    else if (anyUnavailable) unavailableOnDate.push(item)
    // else: only "unknown" statuses → undetermined, omit from both lists.
  }

  return { available, unavailableOnDate }
}

/**
 * Render the "AVAILABLE INTERESTS" / "NOT BOOKABLE" prompt block. Returns "" when
 * there is nothing to say (so the route omits the line). Kept pure and exported
 * so the route and unit tests format the block identically.
 */
export function buildAvailableInterestsLine(args: {
  result: AvailableInterestsResult
  visitDatePretty: string
}): string {
  const { result, visitDatePretty } = args
  const { available, unavailableOnDate } = result
  if (available.length === 0 && unavailableOnDate.length === 0) return ""

  const fmt = (e: InterestVocabEntry) => `${e.value} (${e.label})`
  const lines: string[] = []
  if (available.length > 0) {
    lines.push(
      `AVAILABLE INTERESTS ON ${visitDatePretty} (verified by the live availability scan — each of these themes has at least one trip BOOKABLE that day; whenever you propose interests, themes, or categories to the visitor, ONLY name ones from THIS list): ${available.map(fmt).join(", ")}.`,
    )
  }
  if (unavailableOnDate.length > 0) {
    lines.push(
      `NOT BOOKABLE ON ${visitDatePretty} (these themes exist in the catalog but NONE of their trips run that day — NEVER suggest them as options for ${visitDatePretty}, not even as weather/indoor alternatives, and never re-suggest one after you've already established it's empty; if the visitor wants one, offer to check OTHER dates for it instead): ${unavailableOnDate.map(fmt).join(", ")}.`,
    )
  }
  return lines.join("\n")
}

/**
 * A returned-search trip the per-interest breakdown can match themes against.
 * Same matchable text fields as the canvas/searchTrips matcher (see
 * interest-match), plus the id used to look up the availability class.
 */
export interface ReturnedTripLite extends MatchableTrip {
  id: string
}

/** A requested theme to break availability down by. Label is optional (a bare
 *  free-text query word has none). */
export interface RequestedTheme {
  value: string
  label?: string | null
}

/**
 * Per-trip availability class on the visit date, as produced by the shared
 * classifier (lib/planner/availability-parity.ts → classifyTripAvailability):
 *  - "available"   → bookable on the visit date.
 *  - "unconfirmed" → dual-source incident — NEVER a closure.
 *  - "alternative" → not on the visit date, but bookable on other dates.
 *  - "none"        → confidently not bookable on the visit date.
 */
export type ReturnedTripStatus = "available" | "unconfirmed" | "alternative" | "none"

/** One requested theme's availability among the trips searchTrips returned. */
export interface InterestBreakdownEntry {
  /** The requested theme slug/word (e.g. "food", "wine"). */
  interest: string
  /** Optional human label when the theme came from a canonical interest. */
  label?: string
  /** Returned trips carrying this theme. */
  matchedCount: number
  /** Of those, how many are bookable on the visit date. */
  availableCount: number
  /** Of those, how many couldn't be confirmed (incident, not a closure). */
  unconfirmedCount: number
  /**
   * TRUE only when this theme has matched trips, NONE are bookable on the visit
   * date, AND none are merely unconfirmed — i.e. a CONFIDENT empty theme. The AI
   * must never claim the canvas "shows" a theme that is true for.
   */
  noneAvailableOnVisitDate: boolean
  /** Matched trips NOT bookable on the visit date, with their real alt dates. */
  notBookable: { title: string; dates: string[] }[]
}

/**
 * Break a multi-theme search's availability down PER REQUESTED THEME.
 *
 * Why this exists (Task: planner per-interest availability honesty): the
 * searchTrips `availability` object is AGGREGATE only — in a multi-theme (OR)
 * search where, say, city + wine are bookable but food is not, the aggregate
 * `noneAvailableOnVisitDate` is false and `availableOnVisitDateCount` > 0, so the
 * model treats the WHOLE matched set (food included) as bookable and tells the
 * visitor the canvas "shows" a food tour that day — then contradicts itself. This
 * fold gives the model an explicit per-theme verdict so it can confirm only the
 * themes that are really bookable and offer real alternative dates for the rest.
 *
 * For each requested theme it finds the RETURNED trips matching that theme (via
 * the same content-aware `matchTripInterest` the canvas uses) and classifies each
 * with the caller-supplied `statusOf`. Themes with no matched trip are omitted.
 * Pure: no DB/env, so it stays unit-testable and parity-safe with the canvas.
 */
export function buildInterestAvailabilityBreakdown(args: {
  themes: RequestedTheme[]
  returnedTrips: ReturnedTripLite[]
  statusOf: (tripId: string) => ReturnedTripStatus
  datesOf: (tripId: string) => string[]
  maxNotBookablePerTheme?: number
}): InterestBreakdownEntry[] {
  const { themes, returnedTrips, statusOf, datesOf } = args
  const maxNot = args.maxNotBookablePerTheme ?? 4
  const out: InterestBreakdownEntry[] = []
  const seen = new Set<string>()

  for (const theme of themes) {
    if (!theme || typeof theme.value !== "string" || !theme.value) continue
    const key = theme.value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const matched = returnedTrips.filter((t) => matchTripInterest(t, theme).matched)
    if (matched.length === 0) continue // theme not present in the returned set.

    let availableCount = 0
    let unconfirmedCount = 0
    const notBookable: { title: string; dates: string[] }[] = []
    for (const t of matched) {
      const s = statusOf(t.id)
      if (s === "available") availableCount++
      else if (s === "unconfirmed") unconfirmedCount++
      else if (notBookable.length < maxNot) {
        notBookable.push({ title: t.title ?? t.id, dates: datesOf(t.id) })
      }
    }

    out.push({
      interest: theme.value,
      ...(theme.label ? { label: theme.label } : {}),
      matchedCount: matched.length,
      availableCount,
      unconfirmedCount,
      // Confident empty theme: matched trips but zero bookable and zero merely
      // unconfirmed. An all-unconfirmed theme stays FALSE (incident, not closed).
      noneAvailableOnVisitDate:
        matched.length > 0 && availableCount === 0 && unconfirmedCount === 0,
      notBookable,
    })
  }

  return out
}
