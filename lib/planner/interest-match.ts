/**
 * Content-aware interest ↔ trip matching for the conversational planner and the
 * Trip Canvas recommendations.
 *
 * Why this exists: the planner used to match a visitor's interests against a
 * trip's TAGS only. Tags are sparse and hand-assigned, so a trip whose title or
 * description is clearly about museums — but that was never tagged `museums` —
 * never matched, and a multi-interest request ("museum AND walking tour") that
 * AND-filtered tags returned ZERO trips even when relevant trips existed.
 *
 * This module matches an interest against a trip using its tags AND its title,
 * description, category, duration, and highlights, and scores HOW WELL a trip
 * matches a SET of interests so callers can rank FULL matches (every interest
 * satisfied) above PARTIAL matches (≥1 interest) while still INCLUDING partials
 * — a multi-interest query is OR, never a zero-result AND.
 *
 * Pure module: no DB, no env, no server-only imports — unit-testable and safe to
 * import from the route handler, the client page, and the available-interests
 * grounding helper (so every surface matches identically).
 */

/** Any trip-like shape we can match against. All fields optional/nullable. */
export interface MatchableTrip {
  title?: string | null
  description?: string | null
  shortDescription?: string | null
  longDescription?: string | null
  category?: string | null
  duration?: string | null
  tags?: string[] | null
  tripTags?: string[] | null
  highlights?: string[] | null
}

/** An interest can be a bare canonical slug or a {value,label} vocab pair. */
export type InterestInput = string | { value: string; label?: string | null }

/**
 * Generic tourism noise stripped from text-keyword matching so a word like
 * "tour" (in nearly every trip) doesn't turn every trip into a partial match.
 * Exact canonical-tag matching is NOT affected by this list — only the
 * title/description keyword scan is.
 */
const STOPWORDS = new Set([
  "and", "the", "of", "a", "an", "to", "in", "for", "with", "or", "on", "by", "at",
  "tour", "tours", "trip", "trips", "experience", "experiences", "visit", "visits",
  "luxembourg",
  // Duration / generic-noise words — high-frequency in titles & durations, so
  // they'd turn nearly every trip into a false partial match (e.g. "day-trips"
  // → "day" matching "Full Day ..."). Themes never live in these words.
  "day", "days", "half", "full", "hour", "hours", "hr", "hrs",
  "min", "mins", "minute", "minutes", "am", "pm",
])

/**
 * Extra filler/question words stripped ONLY from a free-text `query` (not from
 * canonical-tag matching). A visitor question like "how many castle trips are
 * there?" must reduce to the concept word(s) ["castle"] — otherwise generic
 * words ("how", "many", "available") would match nothing or everything. This is
 * a superset of STOPWORDS: it keeps theme/concept words (castle, fort, museum,
 * boat, wine…) and drops only conversational scaffolding.
 */
const QUERY_STOPWORDS = new Set<string>([
  ...STOPWORDS,
  "how", "many", "much", "are", "is", "was", "were", "be", "been", "being",
  "there", "here", "want", "wants", "wanna", "would", "like", "likes", "love",
  "show", "shows", "see", "seeing", "find", "finds", "get", "gets", "give",
  "gives", "need", "needs", "looking", "look", "please", "thanks", "thank",
  "can", "could", "should", "shall", "will", "wont",
  "what", "whats", "which", "who", "where", "when", "why", "whom",
  "some", "any", "all", "more", "most", "other", "others", "else", "instead",
  "today", "todays", "tomorrow", "tonight", "now", "this", "that", "these",
  "those", "near", "around", "about", "available", "availability",
  "option", "options", "recommend", "recommended", "recommendation",
  "recommendations", "suggest", "suggests", "suggestion", "suggestions",
  "best", "good", "great", "nice", "top", "your", "yours", "you", "me", "my",
  "mine", "our", "ours", "we", "us", "do", "does", "did", "doing", "done",
  "go", "going", "gone", "went", "have", "has", "had", "having",
  "let", "lets", "okay", "yes", "yeah", "yep", "sure", "thing", "things",
  "something", "anything", "stuff", "really",
])

/** Light singular/plural fold so "museums" matches a title that says "Museum". */
function normWord(w: string): string {
  return w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w
}

function asInterest(i: InterestInput): { value: string; label?: string | null } {
  return typeof i === "string" ? { value: i } : i
}

/**
 * Meaningful lowercased keywords derived from an interest's slug (and label).
 * "walking-tours" → ["walking"]; "boat-tours" → ["boat"]; with a label like
 * "Food & Drink" → ["food", "drink"]. Words shorter than 3 chars and generic
 * tourism stopwords are dropped. Deduped, order-stable.
 */
export function interestKeywords(interest: InterestInput): string[] {
  const { value, label } = asInterest(interest)
  const parts = [String(value || "").toLowerCase().replace(/[-_]+/g, " ")]
  if (label) parts.push(String(label).toLowerCase())
  const words = parts
    .join(" ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  return Array.from(new Set(words))
}

/**
 * Build the set of normalized WORDS appearing in a trip's text fields. Word-level
 * (not substring) matching avoids false positives like "day" hitting "Sunday";
 * `normWord` folds simple plurals so "museums" still matches a "Museum" title.
 */
function tripWordSet(trip: MatchableTrip): Set<string> {
  const text = [
    trip.title ?? "",
    trip.category ?? "",
    trip.duration ?? "",
    trip.description ?? "",
    trip.shortDescription ?? "",
    trip.longDescription ?? "",
    ...(trip.highlights ?? []),
    ...(trip.tags ?? []),
    ...(trip.tripTags ?? []),
  ]
    .join(" ")
    .toLowerCase()
  const set = new Set<string>()
  for (const w of text.split(/[^a-z0-9]+/)) {
    if (w) set.add(normWord(w))
  }
  return set
}

function tripTagSet(trip: MatchableTrip): Set<string> {
  return new Set(
    [...(trip.tags ?? []), ...(trip.tripTags ?? [])]
      .filter(Boolean)
      .map((t) => String(t).toLowerCase()),
  )
}

/** Full lowercased text blob of a trip (same fields as `tripWordSet`), used for
 *  substring matching of longer concept words (e.g. "fort" inside "fortress"
 *  or "Beaufort") that word-level matching would miss. */
function tripFullText(trip: MatchableTrip): string {
  return [
    trip.title ?? "",
    trip.category ?? "",
    trip.duration ?? "",
    trip.description ?? "",
    trip.shortDescription ?? "",
    trip.longDescription ?? "",
    ...(trip.highlights ?? []),
    ...(trip.tags ?? []),
    ...(trip.tripTags ?? []),
  ]
    .join(" ")
    .toLowerCase()
}

/**
 * Meaningful concept keywords from a visitor's free-text `query`. Drops
 * conversational scaffolding (QUERY_STOPWORDS) and words shorter than 3 chars so
 * "how many castle trips are there?" → ["castle"] and "is there a fort option?"
 * → ["fort"]. Returns [] for a query with no concept words (e.g. "show me
 * something good today") so callers can fall back to NOT filtering.
 */
export function queryKeywords(query: string | null | undefined): string[] {
  const words = String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((w) => w.length >= 3 && !QUERY_STOPWORDS.has(w))
  return Array.from(new Set(words))
}

/**
 * Does a trip match a free-text query (already reduced to concept keywords via
 * `queryKeywords`)? A trip matches if ANY keyword hits its content — either as a
 * whole word (plural-folded, e.g. "museum" ↔ "Museums") OR, for keywords ≥ 4
 * chars, as a substring of the trip's text ("fort" ↔ "fortress"/"Beaufort",
 * "castle" ↔ "Castle"). OR semantics across keywords (never a zero-result AND).
 * These trips often carry NO tags, so content matching is the only signal.
 */
export function tripMatchesQuery(trip: MatchableTrip, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false
  const words = tripWordSet(trip)
  const text = tripFullText(trip)
  return keywords.some((kRaw) => {
    const k = String(kRaw || "").toLowerCase()
    if (!k) return false
    if (words.has(normWord(k))) return true
    if (k.length >= 4 && text.includes(k)) return true
    return false
  })
}

export interface InterestMatch {
  matched: boolean
  /** Exact canonical-tag hit (strongest signal). */
  viaTag: boolean
  /** Keyword found in title/description/category/duration/highlights. */
  viaText: boolean
}

/**
 * Does a single interest match a trip? An exact canonical tag wins outright;
 * otherwise the interest's keywords are scanned across the trip's text fields.
 */
export function matchTripInterest(trip: MatchableTrip, interest: InterestInput): InterestMatch {
  const { value } = asInterest(interest)
  const slug = String(value || "").toLowerCase()
  const viaTag = !!slug && tripTagSet(trip).has(slug)
  let viaText = false
  if (!viaTag) {
    const words = tripWordSet(trip)
    viaText = interestKeywords(interest).some((k) => words.has(normWord(k)))
  }
  return { matched: viaTag || viaText, viaTag, viaText }
}

export interface TripInterestScore {
  /** Number of requested interests this trip matched (any way). */
  hits: number
  /** Number of interests requested. */
  total: number
  /** Every requested interest matched (full match). */
  full: boolean
  /** Interests matched via an exact canonical tag. */
  tagHits: number
  /** Interests matched only via text (title/description/etc). */
  textHits: number
  /** Canonical values that matched, in request order. */
  matchedValues: string[]
  /**
   * Weighted ranking score. Tag matches weigh more than text matches, and a
   * FULL match gets a bonus so it ranks above any partial. Always ≥ 0.
   */
  score: number
}

/**
 * Score a trip against a SET of interests (OR semantics). Use `full`/`score`
 * to rank: full matches first, then partials by score — but callers should keep
 * EVERY trip with `hits > 0`, never zero out a multi-interest query.
 */
export function scoreTripInterests(trip: MatchableTrip, interests: InterestInput[]): TripInterestScore {
  const norm = (interests ?? [])
    .map(asInterest)
    .filter((i) => i && typeof i.value === "string" && i.value)
  let hits = 0
  let tagHits = 0
  let textHits = 0
  const matchedValues: string[] = []
  for (const it of norm) {
    const m = matchTripInterest(trip, it)
    if (m.matched) {
      hits++
      if (m.viaTag) tagHits++
      else textHits++
      matchedValues.push(it.value)
    }
  }
  const total = norm.length
  const full = total > 0 && hits === total
  const score = tagHits * 10 + textHits * 6 + (full ? 15 : 0)
  return { hits, total, full, tagHits, textHits, matchedValues, score }
}
