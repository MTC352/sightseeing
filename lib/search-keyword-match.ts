/**
 * Keyword matching for the public Search page's free-text search box
 * (`/search?q=…`, also fed by the homepage search bar).
 *
 * Normalizes both the query and the trip's searchable text (folds diacritics,
 * drops everything that isn't a letter/digit) so punctuation/accents/spacing
 * never block a match — e.g. "ebike" matches "e-bike", "cafe" matches "café".
 * The query is split into keywords on whitespace; every keyword must appear
 * somewhere in the haystack (AND match).
 *
 * The haystack combines both trip-tag sources: the legacy `tags` column and
 * the Palisis-synced `tripTags` column (`trip_tags` in the DB) — admins only
 * manage `tripTags` via /admin/trips/[id], so it must be included or newly
 * added tags become invisible to the search box.
 */

/** Tags imported from Palisis include internal flags like `operator-direct-product`
 *  that aren't meaningful to end users — keep these out of user-facing search. */
export const HIDDEN_TRIP_TAGS = new Set(["operator-direct-product"])

export function isVisibleTripTag(t: string): boolean {
  return Boolean(t) && !HIDDEN_TRIP_TAGS.has(t.toLowerCase())
}

export interface KeywordMatchTrip {
  title: string
  category?: string | null
  city?: string | null
  departureLocation?: string | null
  description?: string | null
  provider?: string | null
  tags?: string[] | null
  tripTags?: string[] | null
}

function stripToAlnum(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "")
}

/** Split a raw query string into normalized keywords (whitespace-separated). */
export function keywordsFromQuery(query: string): string[] {
  return query.trim().split(/\s+/).map(stripToAlnum).filter(Boolean)
}

/** Build the normalized, spaceless searchable text for one trip. */
export function tripSearchHaystack(t: KeywordMatchTrip): string {
  const tags = [...(t.tags ?? []), ...(t.tripTags ?? [])].filter(isVisibleTripTag)
  return stripToAlnum(
    [t.title, t.category ?? "", t.city ?? "", t.departureLocation ?? "", t.description ?? "", t.provider ?? "", ...tags].join(" "),
  )
}

/** True when every keyword appears in the trip's haystack. Empty keywords always match. */
export function tripMatchesKeywords(t: KeywordMatchTrip, keywords: string[]): boolean {
  if (keywords.length === 0) return true
  const hay = tripSearchHaystack(t)
  return keywords.every((kw) => hay.includes(kw))
}
