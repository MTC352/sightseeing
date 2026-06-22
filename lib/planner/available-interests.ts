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
