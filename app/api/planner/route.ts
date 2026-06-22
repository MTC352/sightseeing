import {
  convertToModelMessages,
  InferUITools,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
  validateUIMessages,
} from "ai"
import { resolveAi } from "@/lib/ai/provider"
import { buildPlannerSystemPromptParts, buildCanvasCountLine, buildAvailabilityGroundTruth, buildCatalogFactsBlock, type GroundTruthTrip } from "@/lib/planner/system-prompt"
import { interpretSingleDayFallback, classifyTripAvailability, isConfidentNoneAvailable } from "@/lib/planner/availability-parity"
import { computeAvailableInterests, buildAvailableInterestsLine, type InterestTripStatus } from "@/lib/planner/available-interests"
import { scoreTripInterests, queryKeywords, tripMatchesQuery } from "@/lib/planner/interest-match"
import { sanitizePlannerMessages } from "@/lib/planner/sanitize-messages"
import { toSearchCard } from "@/lib/planner/search-card"
import { isPlannerHidden } from "@/lib/planner/visibility"
import { z } from "zod"
import { weatherData as staticWeatherData, type Trip } from "@/lib/data"
import { dbGetSettings, dbGetTrip, dbListTrips, dbGetChatPlannerConfig } from "@/lib/db/queries"
import { getTourCMSConfig, showTourDatesAndDeals, checkAvailability } from "@/lib/tourcms"
import { rateLimit, schedulePrune, oversizedBody, oversizedChat } from "@/lib/rate-limit"
import { logError, logCaughtError, requestMeta } from "@/lib/error-log"

export const maxDuration = 30
export const dynamic = "force-dynamic"

// Per-request cost cap for the planner. searchTrips returns COMPACT cards (see
// lib/planner/search-card.ts), so even a whole-catalog "skip all" search stays
// token-light and well under the model's per-minute limit. The cap exists only
// to block pathological abuse (thousands of messages / multi-MB transcripts
// forwarded to the paid model), not to constrain normal use.
const PLANNER_BUDGET = { maxMessages: 80, maxChars: 600_000, maxBytes: 1_048_576 }

/* ── Live weather fetch ── */
type WeatherSnapshot = { temp: number; condition: string; wx: "rainy" | "sunny" | "cloudy" }

async function fetchLiveWeather(): Promise<WeatherSnapshot> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"
    const res = await fetch(`${baseUrl}/api/weather`, { cache: "no-store" })
    if (!res.ok) throw new Error(`weather ${res.status}`)
    const data = await res.json()
    const c: string = (data?.current?.condition ?? "").toLowerCase()
    const wx: WeatherSnapshot["wx"] =
      c.includes("rain") || c.includes("drizzle") || c.includes("storm") ? "rainy"
      : c.includes("sun") || c.includes("clear") ? "sunny"
      : "cloudy"
    return { temp: data?.current?.temp ?? staticWeatherData.current.temp, condition: data?.current?.condition ?? staticWeatherData.current.condition, wx }
  } catch {
    // Graceful fallback to static data so the planner never breaks
    const c = staticWeatherData.current.condition.toLowerCase()
    const wx: WeatherSnapshot["wx"] =
      c.includes("rain") ? "rainy" : c.includes("sun") || c.includes("clear") ? "sunny" : "cloudy"
    return { temp: staticWeatherData.current.temp, condition: staticWeatherData.current.condition, wx }
  }
}

/* ── Tools ── */
// Will be populated per-request with live data
let _liveWeather: WeatherSnapshot = { temp: 11, condition: "Partly Cloudy", wx: "cloudy" }
// Per-request default visit date (YYYY-MM-DD) derived from the user's onboarding
// pick. Tools fall back to this when the model omits the date argument, so the
// chosen visit date is guaranteed to flow through even if the model forgets.
let _defaultVisitDate: string | null = null

// Per-request party size (adults + children, min 1). TourCMS `checkavail` returns
// ZERO components unless at least one rate quantity (e.g. r1) is requested, so the
// timeslot tools MUST pass this or they always report "no availability" even when
// real bookable slots exist (the weekend under-reporting bug). Using the real party
// size also keeps results seat-honest: TourCMS omits slots that can't seat the group.
let _defaultPartySize = 1

// Per-request live availability snapshot echoed by the client (its
// /api/planner/availability scan). Keyed by trip id → { onDate, dates[] }. Lets
// searchTrips report ACCURATE on-visit-date availability for the EXACT trips it
// returns — the only per-turn-fresh availability signal the server has (the
// system-prompt canvas line is stale on the search turn). Empty = no snapshot.
let _plannerAvail: Record<string, { onDate: boolean; dates: string[]; unknown?: boolean }> = {}
let _availDate: string | null = null

// Format a YYYY-MM-DD string as "Wed, 24 Jun 2026" for human-readable tool
// output (matches the canvas's pretty-date wording). Returns the raw string on
// any parse failure so a bad value never throws inside a tool.
function prettyYMD(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(d.getTime())) return ymd
  const dd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const mm = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${dd[d.getUTCDay()]}, ${d.getUTCDate()} ${mm[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/**
 * Rich trip shape merging Trip basics with Palisis-imported fields.
 * The AI uses this for scoring AND reasoning so it has full context
 * (itinerary, languages, included/excluded, cancellation, etc.) when
 * making recommendations and answering follow-up questions.
 */
type RichTrip = Trip & {
  // Classification (from Palisis)
  tourType?: string | null
  tourLeader?: string | null
  grade?: string | null
  accommodationRating?: string | null
  tripTags?: string[] | null
  languages?: string[] | null
  // Location
  departureLocation?: string | null
  endLocation?: string | null
  country?: string | null
  // Long-form content
  shortDescription?: string | null
  longDescription?: string | null
  experienceHighlights?: string | null
  itinerary?: unknown
  essentialInformation?: string | null
  hotelPickupInstructions?: string | null
  voucherRedemptionInstructions?: string | null
  restrictions?: string | null
  extras?: unknown
  cancellationPolicy?: string | null
  // Inclusions
  included?: string[] | null
  excluded?: string[] | null
  // Booking constraints
  minBookingSize?: number | null
  maxBookingSize?: number | null
  nonRefundable?: boolean | null
  nextBookableDate?: string | null
  lastBookableDate?: string | null
}

/** Stringify itinerary / extras (which may be JSON) into searchable text. */
function jsonToText(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v
  try { return JSON.stringify(v) } catch { return "" }
}

/**
 * Load the unified trip catalog from the DB (publicOnly).
 * Fail-CLOSED: returns [] on DB error or empty result. We never fall back to
 * the static seed catalog because that would expose archived/draft trips to
 * the AI planner.
 */
async function loadTripCatalog(): Promise<RichTrip[]> {
  try {
    const rows = (await dbListTrips({ publicOnly: true })) as Array<Record<string, unknown>>
    if (rows && rows.length > 0) {
      return rows.map((r): RichTrip => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        image: String(r.image ?? ""),
        gallery: (r.gallery as string[] | undefined) ?? undefined,
        price: Number(r.price ?? 0),
        originalPrice: r.originalPrice != null ? Number(r.originalPrice) : undefined,
        rating: Number(r.rating ?? 0),
        reviewCount: Number(r.reviewCount ?? 0),
        duration: String(r.duration ?? ""),
        category: String(r.category ?? ""),
        tags: (r.tags as string[] | undefined) ?? [],
        badge: (r.badge as string | undefined) ?? undefined,
        city: (r.city as string | undefined) ?? "Luxembourg",
        description: (r.description as string | undefined) ?? undefined,
        permalink: (r.permalink as string | undefined) ?? undefined,
        provider: (r.provider as string | undefined) ?? undefined,
        highlights: (r.highlights as string[] | undefined) ?? [],
        googleBusinessUrl: (r.googleBusinessUrl as string | undefined) ?? undefined,
        // ── Rich Palisis fields ────────────────────────────────────────────
        tourType: (r.tourType as string | null) ?? null,
        tourLeader: (r.tourLeader as string | null) ?? null,
        grade: (r.grade as string | null) ?? null,
        accommodationRating: (r.accommodationRating as string | null) ?? null,
        tripTags: (r.tripTags as string[] | null) ?? null,
        languages: (r.languages as string[] | null) ?? null,
        departureLocation: (r.departureLocation as string | null) ?? null,
        endLocation: (r.endLocation as string | null) ?? null,
        country: (r.country as string | null) ?? null,
        shortDescription: (r.shortDescription as string | null) ?? null,
        longDescription: (r.longDescription as string | null) ?? null,
        experienceHighlights: (r.experienceHighlights as string | null) ?? null,
        itinerary: r.itinerary ?? null,
        essentialInformation: (r.essentialInformation as string | null) ?? null,
        hotelPickupInstructions: (r.hotelPickupInstructions as string | null) ?? null,
        voucherRedemptionInstructions: (r.voucherRedemptionInstructions as string | null) ?? null,
        restrictions: (r.restrictions as string | null) ?? null,
        extras: r.extras ?? null,
        cancellationPolicy: (r.cancellationPolicy as string | null) ?? null,
        included: (r.included as string[] | null) ?? null,
        excluded: (r.excluded as string[] | null) ?? null,
        minBookingSize: (r.minBookingSize as number | null) ?? null,
        maxBookingSize: (r.maxBookingSize as number | null) ?? null,
        nonRefundable: (r.nonRefundable as boolean | null) ?? null,
        nextBookableDate: r.nextBookableDate ? String(r.nextBookableDate) : null,
        lastBookableDate: r.lastBookableDate ? String(r.lastBookableDate) : null,
      }))
    }
  } catch (e) {
    console.error("[planner] dbListTrips failed — returning empty catalog (fail-closed):", e)
  }
  // Fail-closed: never expose static seed (could include archived/draft trips).
  return []
}

const searchTripsTool = tool({
  description:
    "Search, filter, AND narrow the Trip Canvas to a specific shortlist. The Trip Canvas (Recommended for you) panel renders EXACTLY what this tool returns. Call it when the user asks for recommendations, OR when you've identified the day's best matches and want to pin the canvas to ONLY those trips (pass their ids in `ids`). Returns COMPACT trip cards (title, price, rating, duration, tags, a short description + a few highlights) — enough to recommend, compare, and order. For a specific trip's full inclusions, restrictions, itinerary, cancellation policy, or live timeslots, call `getTripDetails` instead. IMPORTANT — if the result has `noDirectMatches: true`, the visitor's requested concept matched NO trip and the returned list is the broadened full catalog, NOT matches: answer counting/existence questions honestly ('we don't currently offer any X trips') and optionally suggest the closest themes, instead of describing the broadened list as if it matched. IMPORTANT — when a visit date is set the result ALSO includes an `availability` object that is the AUTHORITATIVE per-turn truth for the trips just returned: `availableOnVisitDateCount` (how many of these trips are bookable on the visit date), `noneAvailableOnVisitDate`, `alternativeDates` (these trips' other bookable dates) and `similarAvailableOnVisitDate` (closest trips bookable that same day). You MUST base your reply on this, not on any earlier canvas count: if `noneAvailableOnVisitDate` is true, NEVER say the canvas shows/now shows these trips for that date — say plainly none run that day, then recommend `alternativeDates` and/or a `similarAvailableOnVisitDate` trip BY NAME.",
  inputSchema: z.object({
    query: z.string().describe("Free-text search. This FILTERS the Trip Canvas by matching the words against each trip's title, description, category and highlights — so use it for any concept the canonical tags below DON'T cover (e.g. 'castle', 'fort', 'fortress', 'ruins', 'medieval', 'vineyard', 'panoramic'). Many such trips carry no tags, so `query` is the ONLY way to find them accurately and to answer 'how many X trips' correctly. Pass the bare concept word(s); the result (and its `availability` object) will reflect exactly the matching trips. Pass an empty string when pinning by `ids`, or when you've fully captured the request as `tags` and want every trip for those tags."),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tags to filter by — use ONLY the canonical values listed under 'AVAILABLE INTEREST TAGS' in the system prompt (e.g. day-trips, museums, walking-tours, food). Do NOT invent values like 'outdoor'/'culture' that aren't in that list. Omit entirely to return ALL trips."),
    ids: z
      .array(z.string())
      .optional()
      .describe("Pin the Trip Canvas to EXACTLY these trip ids (in order). Use this after you've shortlisted the day's best matches so the canvas shows only those trips instead of the broader tag search. The returned `trips` will be filtered AND ordered to match this list."),
    maxResults: z.number().optional().describe("Optional cap. Omit to return every matching trip — the catalog has ~17 published trips and the panel scrolls."),
  }),
  execute: async ({ query, tags, ids, maxResults }) => {
    const wx = _liveWeather.wx
    const catalog = await loadTripCatalog()
    const catalogSize = catalog.length
    const limit = maxResults ?? catalogSize
    const lower = (query ?? "").toLowerCase()
    let results: RichTrip[] = [...catalog]

    // Explicit id-pinning takes precedence over keyword/tag search so the
    // AI can lock the Trip Canvas to its conversational shortlist. We
    // dedupe while preserving first-seen order, and only treat this as
    // "pinned" if at least one id actually resolves — otherwise we fall
    // through to the regular tag/keyword path so a typoed shortlist
    // can't silently dump the whole catalog back onto the canvas.
    let hasValidPinnedIds = false
    if (ids && ids.length > 0) {
      const byId = new Map(catalog.map((t) => [t.id, t]))
      const ordered: RichTrip[] = []
      const seenIds = new Set<string>()
      for (const id of ids) {
        if (seenIds.has(id)) continue
        const hit = byId.get(id)
        if (hit) {
          seenIds.add(id)
          ordered.push(hit)
        }
      }
      if (ordered.length > 0) {
        results = ordered
        hasValidPinnedIds = true
      }
    }
    // Content-aware interest narrowing. A requested tag matches a trip via an
    // exact canonical tag OR via its title/description/category/duration —
    // sparse tags alone used to drop relevant trips. Multi-tag is OR (never a
    // zero-result AND): keep EVERY trip matching ≥1 interest, and remember each
    // trip's interest score so the final sort can float FULL matches (all
    // interests satisfied) above PARTIAL ones while still showing partials.
    const tagMatchRank = new Map<string, { full: boolean; score: number }>()
    // Concept words from the free-text query that aren't covered by the canonical
    // tag vocabulary — e.g. "castle", "fort", "fortress", "medieval", "ruins".
    // Many of these trips carry NO tags at all (their theme lives only in the
    // title/description), so a tag-only filter dropped them and the free-text
    // query merely RE-SORTED the whole catalog, leaving the AI unable to
    // accurately count or judge availability ("how many castle trips?" → wrong).
    // We now FILTER by query content too, unioned with the tag matches.
    const qKeywords = !hasValidPinnedIds ? queryKeywords(query) : []
    const hasTagFilter = !hasValidPinnedIds && !!tags && tags.length > 0
    const hasQueryFilter = qKeywords.length > 0
    // True when the visitor asked for a specific concept/tag but NOTHING in the
    // catalog matched, so we fell back to showing everything. The AI must use
    // this to answer counting questions honestly ("how many skydiving trips?" →
    // "none") instead of describing the broadened full-catalog list as matches.
    let broadenedNoMatch = false
    if (hasTagFilter || hasQueryFilter) {
      const matched: RichTrip[] = []
      for (const t of results) {
        let keep = false
        if (hasTagFilter) {
          const m = scoreTripInterests(t, tags as string[])
          tagMatchRank.set(t.id, { full: m.full, score: m.score })
          if (m.hits > 0) keep = true
        }
        // Union (OR), never an AND that could zero-out a valid concept search.
        if (hasQueryFilter && tripMatchesQuery(t, qKeywords)) keep = true
        if (keep) matched.push(t)
      }
      // Broaden on a genuine no-match so the canvas is never left blank: a query
      // for a concept we simply don't offer falls back to the full catalog
      // (sorted by relevance below) rather than an empty panel.
      if (matched.length > 0) results = matched
      else broadenedNoMatch = true
    }

    if (lower && !hasValidPinnedIds) {
      const keywords = lower.split(/\s+/).filter(Boolean)
      results.sort((a, b) => {
        const scoreFor = (t: RichTrip) => {
          let s = 0
          const hay = [
            t.title, t.category, t.city ?? "",
            t.description ?? "", t.shortDescription ?? "", t.longDescription ?? "",
            t.experienceHighlights ?? "",
            ...(t.highlights ?? []),
            ...(t.tripTags ?? []),
            ...(t.included ?? []), ...(t.excluded ?? []),
            ...(t.languages ?? []),
            t.tourType ?? "", t.tourLeader ?? "", t.grade ?? "",
            t.departureLocation ?? "", t.endLocation ?? "", t.country ?? "",
            t.essentialInformation ?? "", t.restrictions ?? "",
            t.cancellationPolicy ?? "",
            jsonToText(t.itinerary), jsonToText(t.extras),
          ].join(" ").toLowerCase()
          for (const kw of keywords) { if (hay.includes(kw)) s += 10 }
          if (t.title.toLowerCase().includes(lower)) s += 20
          return s
        }
        return scoreFor(b) - scoreFor(a)
      })
    }

    // When pinning by ids, preserve the caller's exact order — don't
    // re-sort by weather/rating, which would scramble the AI's shortlist.
    if (!hasValidPinnedIds) {
      results.sort((a, b) => {
        // Interest fit dominates: trips matching ALL requested interests (FULL)
        // come first, then by interest score (partial matches still included),
        // then weather/rating. Empty when no tags were requested → weather/rating
        // ordering only, as before.
        const ra = tagMatchRank.get(a.id)
        const rb = tagMatchRank.get(b.id)
        const fa = ra?.full ? 1 : 0
        const fb = rb?.full ? 1 : 0
        if (fa !== fb) return fb - fa
        const im = (rb?.score ?? 0) - (ra?.score ?? 0)
        if (im !== 0) return im
        let aS = 0, bS = 0
        const aTags = [...a.tags, ...(a.tripTags ?? [])]
        const bTags = [...b.tags, ...(b.tripTags ?? [])]
        if (wx === "rainy") { aS += aTags.includes("indoor") ? 5 : -2; bS += bTags.includes("indoor") ? 5 : -2 }
        else if (wx === "sunny") { aS += aTags.includes("outdoor") ? 5 : 0; bS += bTags.includes("outdoor") ? 5 : 0 }
        aS += a.rating >= 4.7 ? 2 : 0; bS += b.rating >= 4.7 ? 2 : 0
        return bS - aS
      })
    }

    const finalResults = results.slice(0, limit)

    // ── AVAILABILITY GROUND TRUTH for THIS search (anti-hallucination) ─────────
    // The Trip Canvas filters by the visit date CLIENT-side, so the system-prompt
    // canvas count is stale on the very turn the AI runs searchTrips. Using the
    // client's live availability snapshot, we compute — for the EXACT trips just
    // returned — how many are bookable on the visit date, plus real alternative
    // dates and similar same-day trips. This is the per-turn-fresh signal the AI
    // MUST base its reply on (so it never claims "the canvas now shows X today"
    // when zero of these trips actually run that day).
    let availability: {
      visitDate: string
      visitDatePretty: string
      availableOnVisitDateCount: number
      noneAvailableOnVisitDate: boolean
      // Returned trips bookable on OTHER dates — recommend these specific dates.
      alternativeDates: { title: string; dates: string[] }[]
      // Trips bookable ON the visit date (whole catalog), closest to the search
      // first — offer the nearest "similar experience" by name for the same day.
      similarAvailableOnVisitDate: { title: string; tags: string[] }[]
      // Returned trips whose availability COULDN'T be confirmed (both TourCMS
      // sources failed). The AI must NOT call these "not available" — it should
      // say it couldn't confirm and suggest retrying.
      unconfirmed?: { title: string }[]
    } | undefined
    // Fail-safe: only ground on the snapshot when its date still matches THIS
    // request's visit date. _plannerAvail/_availDate are module-global (the
    // established per-request-context pattern in this file), so this guard keeps
    // a concurrent request's snapshot from leaking a wrong availability summary.
    if (_availDate && _availDate === _defaultVisitDate && Object.keys(_plannerAvail).length > 0) {
      // Classify each returned trip with the shared pure helper so the
      // available / unconfirmed / alternative / none precedence is identical and
      // unit-tested (an `unknown` incident is NEVER downgraded to a confident
      // "not available"). See lib/planner/availability-parity.ts.
      const classOf = (id: string) => classifyTripAvailability(_plannerAvail[id])
      const availCount = finalResults.filter((t) => classOf(t.id) === "available").length
      // Trips we genuinely couldn't confirm (both TourCMS sources errored). These
      // are NOT alternative-date candidates and must NOT count toward a confident
      // "none available" — they're an incident, surfaced separately so the AI can
      // honestly say it couldn't confirm rather than telling the visitor it's shut.
      const unconfirmed = finalResults
        .filter((t) => classOf(t.id) === "unconfirmed")
        .slice(0, 6)
        .map((t) => ({ title: t.title }))
      const alternativeDates = finalResults
        .filter((t) => classOf(t.id) === "alternative")
        .slice(0, 4)
        .map((t) => ({
          title: t.title,
          dates: (_plannerAvail[t.id]?.dates ?? []).slice(0, 4).map(prettyYMD),
        }))
      // Similar same-day options come from the WHOLE catalog (not just this
      // search), ranked by tag overlap with the returned trips so the closest
      // alternative surfaces first.
      const resultTags = new Set<string>(finalResults.flatMap((t) => [...t.tags, ...(t.tripTags ?? [])]))
      const similarAvailableOnVisitDate = catalog
        .filter((t) => classOf(t.id) === "available" && !finalResults.some((r) => r.id === t.id))
        .map((t) => ({
          t,
          score: [...t.tags, ...(t.tripTags ?? [])].filter((tg) => resultTags.has(tg)).length,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ t }) => ({ title: t.title, tags: t.tags.slice(0, 4) }))
      availability = {
        visitDate: _availDate,
        visitDatePretty: prettyYMD(_availDate),
        availableOnVisitDateCount: availCount,
        // Only a CONFIDENT "none available": no trip is bookable AND none are
        // merely unconfirmed. If every miss is an unconfirmed incident, this stays
        // false so the AI doesn't tell the visitor everything is closed.
        noneAvailableOnVisitDate: isConfidentNoneAvailable(availCount, unconfirmed.length),
        alternativeDates,
        similarAvailableOnVisitDate,
        ...(unconfirmed.length > 0 ? { unconfirmed } : {}),
      }
    }

    // Return COMPACT cards only. Heavy per-trip prose (longDescription,
    // itinerary, essentialInformation, inclusions, cancellation policy, …) is
    // intentionally dropped here — returning it for the whole catalog on a
    // "skip all" search blows the OpenAI per-minute TOKEN limit and kills the
    // chat. Deep details are fetched per-trip on demand via getTripDetails.
    // See lib/planner/search-card.ts.
    return {
      trips: finalResults.map(toSearchCard),
      weather: wx,
      total: results.length,
      catalogTotal: catalogSize,
      // Honest "we don't offer this" signal: the visitor's concept matched no
      // trip, so the list below is the broadened full catalog, NOT matches.
      ...(broadenedNoMatch ? { noDirectMatches: true } : {}),
      ...(availability ? { availability } : {}),
    }
  },
})

const showWeatherTool = tool({
  description: "Show current weather and forecast for Luxembourg.",
  inputSchema: z.object({}),
  execute: async () => {
    const { wx, temp, condition } = _liveWeather
    return {
      current: { temp, condition, city: "Luxembourg City" },
      condition: wx,
      tip: wx === "rainy"
        ? "Bring an umbrella! We suggest indoor activities today."
        : wx === "sunny"
          ? "Beautiful day -- sunscreen and comfortable shoes recommended!"
          : "Layer up -- mixed conditions today.",
    }
  },
})

const offerCouponTool = tool({
  description:
    "Offer a limited-time coupon code to encourage booking. Use strategically: when the user seems interested but hesitant, when recommending a top pick for today, or after the second search to push a conversion. Do NOT overuse -- maximum once per conversation.",
  inputSchema: z.object({
    code: z.string().describe("The coupon code, e.g. SUNNY10, EXPLORE15, TODAY20"),
    discountPercent: z.number().describe("Discount percentage, between 5 and 20"),
    tripTitle: z.string().describe("The trip this coupon applies best to"),
    expiresLabel: z.string().describe("Urgency label, e.g. 'Today only', 'Next 2 hours', 'This weekend'"),
    reason: z.string().describe("Short reason for the offer shown to user, e.g. 'Perfect match for your interests'"),
  }),
  execute: async ({ code, discountPercent, tripTitle, expiresLabel, reason }) => {
    return { code, discountPercent, tripTitle, expiresLabel, reason }
  },
})

const showWeatherAlertTool = tool({
  description:
    "Show a proactive weather-based recommendation card. Use this on the FIRST interaction to alert users about weather conditions affecting their trip choices. If rainy, suggest indoor alternatives. If sunny, reinforce outdoor picks. Only call ONCE.",
  inputSchema: z.object({
    alertType: z.enum(["rainy", "sunny", "cloudy"]).describe("Weather condition type"),
    title: z.string().describe("Card title, e.g. 'Rainy Day? No Problem!' or 'Perfect Day for Outdoors!'"),
    message: z.string().describe("Brief recommendation message"),
    suggestedTags: z.array(z.string()).describe("Tags to search if user clicks the action, e.g. ['indoor', 'culture'] for rainy"),
  }),
  execute: async ({ alertType, title, message, suggestedTags }) => {
    return { alertType, title, message, suggestedTags }
  },
})

const buildItineraryTool = tool({
  description:
    "Build an optimized day itinerary from the user's saved/cart trips. Call when user has 3+ saved items and asks for a plan, route, itinerary, or schedule. Generates a sequenced timeline with times and travel between stops.",
  inputSchema: z.object({
    steps: z.array(z.object({
      time: z.string().describe("Suggested start time, e.g. '09:00'"),
      tripTitle: z.string().describe("Name of the trip/activity"),
      tripId: z.string().describe("Trip ID from catalog"),
      durationMinutes: z.number().describe("Duration at this stop in minutes"),
      travelToNext: z.string().optional().describe("How to get to next stop, e.g. '15 min walk' or '10 min bus'"),
    })).describe("Ordered list of itinerary steps"),
    summary: z.string().describe("Brief summary of the day plan"),
  }),
  execute: async ({ steps, summary }) => {
    return { steps, summary }
  },
})

/**
 * Resolve a tripId (either our internal id "tcms_22" or a raw Palisis tour_id "22")
 * into the Palisis tour_id used by TourCMS API calls. Returns null when the trip
 * has no Palisis link (e.g. legacy static seed trip).
 */
async function resolvePalisisId(tripId: string): Promise<{
  palisisId: string | null
  tripRow: Record<string, unknown> | null
}> {
  // 1) Try direct PK lookup (handles "tcms_22" and any other internal id).
  //    publicOnly: archived/draft trips must never be plannable from the frontend.
  let tripRow = (await dbGetTrip(tripId, { publicOnly: true }).catch(() => null)) as Record<string, unknown> | null

  // 2) If not found and the input looks like a raw Palisis tour_id, look up by palisis_id
  if (!tripRow && /^\d+$/.test(tripId)) {
    try {
      const { query } = await import("@/lib/db")
      const rows = (await query(
        // Re-select the same shape as dbGetTrip for consistency.
        // We include palisis_id explicitly so both keys are always present.
        // status = 'published' mirrors the publicOnly gate above.
        `SELECT id, palisis_id, title, duration FROM trips WHERE palisis_id = $1 AND status = 'published' LIMIT 1`,
        [tripId],
      )) as Array<Record<string, unknown>>
      if (rows && rows.length > 0) tripRow = rows[0]
    } catch { /* DB miss — trip simply isn't in our knowledgebase */ }
  }

  // 3) Resolve the Palisis tour_id from the row (TRIP_SELECT exposes it as
  //    snake_case `palisis_id`; allow camelCase too for safety).
  let palisisId: string | null = null
  const fromRow =
    (tripRow?.palisis_id as string | undefined) ??
    (tripRow?.palisisId as string | undefined) ??
    null
  if (fromRow) {
    palisisId = String(fromRow)
  }
  // NO heuristic guessing. A trip's Palisis tour_id comes ONLY from its
  // published DB row. If the trip isn't in our DB (or isn't published), it
  // isn't in the knowledgebase — we return null rather than fabricating an id
  // by stripping the "tcms_" prefix. Palisis is read-only upstream; every
  // plannable trip must already have been imported with its real palisis_id.

  return { palisisId, tripRow }
}

/** YYYY-MM-DD for today (UTC, good enough for date-range queries). */
function todayYMD(): string {
  return new Date().toISOString().split("T")[0]
}

/** Add N days to a YYYY-MM-DD string and return YYYY-MM-DD. */
function addDaysYMD(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split("T")[0]
}

const getTripDatesAndDealsTool = tool({
  description:
    "Fetch the BOOKABLE-DATES CALENDAR (with prices, deals, spaces remaining, and duration) for ONE trip across a date range. Use when the user asks 'when can I book', 'is there a date on Friday', 'any deals next week', 'cheapest day', 'what dates are available', or wants to plan a trip on a specific upcoming date. This is the wide calendar view — use getTripTimeslots after the user picks a specific date for exact timeslots.",
  inputSchema: z.object({
    tripId: z.string().describe("Internal trip id (e.g. 'tcms_22') or Palisis tour_id (e.g. '22')"),
    startDate: z.string().optional().describe("YYYY-MM-DD start of the date range. Defaults to today."),
    endDate: z.string().optional().describe("YYYY-MM-DD end of the date range. Defaults to 14 days from start."),
  }),
  execute: async ({ tripId, startDate, endDate }) => {
    // Priority: explicit arg > user-picked visit date > today.
    const start = startDate || _defaultVisitDate || todayYMD()
    const end   = endDate   || addDaysYMD(start, 14)
    const config = await getTourCMSConfig()
    if (!config) {
      return { ok: false, error: "TOURCMS_NOT_CONFIGURED", tripId, dates: [] }
    }
    const { palisisId, tripRow } = await resolvePalisisId(tripId)
    if (!palisisId) {
      return { ok: false, error: "NO_PALISIS_LINK", tripId, dates: [] }
    }
    const res = await showTourDatesAndDeals(config, palisisId, {
      startdate_start: start,
      startdate_end:   end,
    })
    if (!res.ok) {
      return {
        ok: false,
        error: "TOURCMS_ERROR",
        providerError: res.error ?? null,
        tripId,
        dates: [],
      }
    }
    // Compact, AI-friendly shape: keep prices, deals, spots, time, and dedupe noise
    const dates = res.dates.map((d) => {
      const raw = d.spaces_remaining
      const unlimited = raw === "UNLIMITED"
      const spotsLeft = unlimited ? null : Math.max(0, parseInt(raw ?? "0", 10))
      return {
        date: d.start_date,
        endDate: d.end_date && d.end_date !== d.start_date ? d.end_date : undefined,
        startTime: d.start_time,
        endTime: d.end_time,
        priceDisplay: d.price_1_display,
        priceNumeric: parseFloat(d.price_1 ?? "0") || 0,
        spacesRemaining: unlimited ? "UNLIMITED" : spotsLeft,
        hasOffer: d.has_offer === "1" || !!d.special_offer_type,
        offerType: d.special_offer_type ?? undefined,
        originalPriceDisplay: d.original_price_1_display ?? undefined,
        offerPriceDisplay: d.offer_price_1_display ?? undefined,
      }
    })
    // ── Single-day fallback parity (datesndeals UNDER-reports) ────────────────
    // The bulk datesndeals feed can return ZERO dates for a day that is in fact
    // bookable via the authoritative real-time checkAvailability widget (see
    // itinerary-availability-parity). When the caller is asking about ONE exact
    // day (start === end) and the calendar came back empty, re-check that day
    // with checkAvailability (party-size aware) and synthesise date rows so the
    // chat never falsely tells the user "no openings" when slots actually exist.
    let fallbackUsed = false
    if (dates.length === 0 && start === end) {
      const av = await checkAvailability(config, palisisId, {
        date: start,
        show_pickups: "0",
        r1: _defaultPartySize,
      }).catch(() => null)
      // CRITICAL (itinerary-availability-parity): datesndeals UNDER-reports, so an
      // empty single-day calendar is NOT trustworthy as "no slots" — we re-check
      // with the authoritative checkavail widget. If THAT call fails (threw → null,
      // or ok:false), we genuinely cannot confirm emptiness. A failed TourCMS call
      // must surface as TOURCMS_ERROR, never as ok:true with empty dates (which the
      // model reads as "no openings"). Only an ok checkavail with zero components is
      // a real "no slots" answer (falls through to ok:true empty below). The
      // decision is in a pure, unit-tested helper.
      const decision = interpretSingleDayFallback(av)
      if (decision === "error") {
        return {
          ok: false,
          error: "TOURCMS_ERROR",
          providerError: (av && !av.ok ? (av as { error?: string }).error : null) ?? null,
          tripId,
          dates: [],
        }
      }
      if (decision === "has-slots" && av) {
        fallbackUsed = true
        for (const c of av.components) {
          const raw = c.spaces_remaining
          const unlimited = raw === "UNLIMITED"
          const spotsLeft = unlimited ? null : Math.max(0, parseInt(raw ?? "0", 10))
          dates.push({
            date: c.start_date ?? start,
            endDate: c.end_date && c.end_date !== c.start_date ? c.end_date : undefined,
            startTime: c.start_time,
            endTime: c.end_time,
            priceDisplay: c.total_price_display ?? "",
            priceNumeric: c.total_price ? parseFloat(c.total_price) || 0 : 0,
            spacesRemaining: unlimited ? "UNLIMITED" : spotsLeft,
            hasOffer: !!c.special_offer_note,
            offerType: undefined,
            originalPriceDisplay: undefined,
            offerPriceDisplay: undefined,
          })
        }
      }
    }
    return {
      ok: true,
      tripId,
      palisisId,
      dateRange: { start, end },
      // When the calendar feed under-reported and we recovered slots from the
      // real-time widget, flag it so the model knows the data is authoritative.
      availabilitySource: fallbackUsed ? "checkavail-fallback" : "datesndeals",
      totalDateCount: fallbackUsed ? dates.length : res.total_date_count,
      // Duration text from DB (e.g. "2 hours", "Half day", "Full day", "3 nights")
      duration: (tripRow?.duration as string | undefined) ?? null,
      title: (tripRow?.title as string | undefined) ?? null,
      dates,
    }
  },
})

const getTripTimeslotsTool = tool({
  description:
    "Fetch REAL-TIME BOOKABLE TIMESLOTS for ONE trip on a SPECIFIC date — exact start/end times, current spaces, and live pricing. Use when the user picks a date and asks 'what times are available on Friday', 'is there a morning slot', 'when does it start tomorrow', or before recommending a precise booking. Never cache the result. For wider date-range planning use getTripDatesAndDeals instead. If `date` is omitted, the user's previously selected visit date is used.",
  inputSchema: z.object({
    tripId: z.string().describe("Internal trip id (e.g. 'tcms_22') or Palisis tour_id (e.g. '22')"),
    date: z.string().optional().describe("YYYY-MM-DD specific date to check. Defaults to the user's onboarding visit date."),
  }),
  execute: async ({ tripId, date }) => {
    // Priority: explicit arg > user-picked visit date > today (last-resort).
    const effectiveDate = date || _defaultVisitDate || todayYMD()
    const config = await getTourCMSConfig()
    if (!config) {
      return { ok: false, error: "TOURCMS_NOT_CONFIGURED", tripId, date: effectiveDate, timeslots: [] }
    }
    const { palisisId, tripRow } = await resolvePalisisId(tripId)
    if (!palisisId) {
      return { ok: false, error: "NO_PALISIS_LINK", tripId, date: effectiveDate, timeslots: [] }
    }
    const res = await checkAvailability(config, palisisId, { date: effectiveDate, show_pickups: "0", r1: _defaultPartySize })
    if (!res.ok) {
      return {
        ok: false,
        error: "TOURCMS_ERROR",
        providerError: res.error ?? null,
        tripId,
        date: effectiveDate,
        timeslots: [],
      }
    }
    const timeslots = res.components
      .slice()
      .sort((a, b) => {
        const aT = a.start_time_utcseconds ? parseInt(a.start_time_utcseconds, 10) : 0
        const bT = b.start_time_utcseconds ? parseInt(b.start_time_utcseconds, 10) : 0
        return aT - bT
      })
      .map((c) => {
        const raw = c.spaces_remaining
        const unlimited = raw === "UNLIMITED"
        const spotsLeft = unlimited ? null : Math.max(0, parseInt(raw ?? "0", 10))
        return {
          startDate: c.start_date,
          endDate: c.end_date && c.end_date !== c.start_date ? c.end_date : undefined,
          startTime: c.start_time,
          endTime: c.end_time,
          spacesRemaining: unlimited ? "UNLIMITED" : spotsLeft,
          priceDisplay: c.total_price_display ?? undefined,
          priceNumeric: c.total_price ? parseFloat(c.total_price) : undefined,
          currency: c.sale_currency ?? undefined,
          specialOfferNote: c.special_offer_note ?? undefined,
        }
      })
    return {
      ok: true,
      tripId,
      palisisId,
      date: effectiveDate,
      duration: (tripRow?.duration as string | undefined) ?? null,
      title: (tripRow?.title as string | undefined) ?? null,
      componentKeyValidForSeconds: res.component_key_valid_for ?? null,
      timeslotCount: timeslots.length,
      timeslots,
    }
  },
})

const getTripDetailsTool = tool({
  description:
    "Get complete details for a specific trip: full description, what's included/excluded, languages, departure location, restrictions, cancellation policy, and live timeslots for the user's visit date. " +
    "Use when the user asks about a trip's inclusions, features, language, restrictions, or timeslots by name (e.g. 'what's included in the Walking Tour?', 'what timeslots does the Casemates tour have?'). " +
    "Pass `tripId` when you have the exact ID from a prior searchTrips result. Pass `query` (partial title) when you only have the name. Both can be passed — ID takes priority.",
  inputSchema: z.object({
    tripId: z.string().optional().describe("Exact internal trip id from a prior searchTrips result (e.g. 'tcms_22')."),
    query: z.string().optional().describe("Partial trip title for fuzzy lookup when you don't have the exact ID."),
    date: z.string().optional().describe("YYYY-MM-DD date for live timeslot lookup. Defaults to the user's visit date."),
  }),
  execute: async ({ tripId, query, date }) => {
    const catalog = await loadTripCatalog()
    let trip: RichTrip | undefined

    if (tripId) {
      trip = catalog.find((t) => t.id === tripId)
    }
    if (!trip && query) {
      // Normalise: collapse whitespace, strip common punctuation/apostrophes.
      const lower = query.toLowerCase().replace(/['']/g, "").replace(/\s+/g, " ").trim()
      // Significant words = tokens longer than 2 chars (excludes "a", "an", "in", etc.)
      const words = lower.split(" ").filter((w) => w.length > 2)

      // Priority 1 — full normalised query is a substring of the title
      trip = catalog.find((t) => t.title.toLowerCase().replace(/['']/g, "").includes(lower))

      // Priority 2 — every significant word appears in the title
      //   (handles "Walking City Tour" → "walking city tour" without strict order)
      if (!trip && words.length > 1) {
        trip = catalog.find((t) => {
          const tl = t.title.toLowerCase()
          return words.every((w) => tl.includes(w))
        })
      }

      // Priority 3 — majority of words match (≥ ⌈75%⌉) for partial/mistyped names
      if (!trip && words.length > 1) {
        const needed = Math.ceil(words.length * 0.75)
        trip = catalog.find((t) => {
          const tl = t.title.toLowerCase()
          return words.filter((w) => tl.includes(w)).length >= needed
        })
      }

      // Priority 4 — fall back to shortDescription substring match
      if (!trip) {
        trip = catalog.find((t) =>
          (t.shortDescription ?? "").toLowerCase().replace(/['']/g, "").includes(lower),
        )
      }
    }
    if (!trip) {
      return {
        ok: false,
        error: "TRIP_NOT_FOUND",
        hint: "Try calling searchTrips with the trip name to get a valid ID, then retry with that ID.",
        tripId: tripId ?? null,
        query: query ?? null,
      }
    }

    // Fetch live timeslots for the visit date (best-effort — fails silently).
    const effectiveDate = date || _defaultVisitDate || todayYMD()
    const config = await getTourCMSConfig().catch(() => null)
    let timeslots: Array<{
      startTime: string | undefined
      endTime: string | undefined
      spacesRemaining: number | "UNLIMITED"
      priceDisplay: string | undefined
    }> | null = null
    if (config) {
      const { palisisId } = await resolvePalisisId(trip.id)
      if (palisisId) {
        const res = await checkAvailability(config, palisisId, {
          date: effectiveDate,
          show_pickups: "0",
          r1: _defaultPartySize,
        }).catch(() => null)
        if (res?.ok) {
          timeslots = res.components
            .slice()
            .sort((a, b) => {
              const aT = a.start_time_utcseconds ? parseInt(a.start_time_utcseconds, 10) : 0
              const bT = b.start_time_utcseconds ? parseInt(b.start_time_utcseconds, 10) : 0
              return aT - bT
            })
            .map((c) => {
              const raw = c.spaces_remaining
              const unlimited = raw === "UNLIMITED"
              return {
                startTime: c.start_time,
                endTime: c.end_time,
                spacesRemaining: unlimited
                  ? ("UNLIMITED" as const)
                  : (Math.max(0, parseInt(raw ?? "0", 10)) as number),
                priceDisplay: c.total_price_display ?? undefined,
              }
            })
        }
      }
    }

    return {
      ok: true,
      id: trip.id,
      title: trip.title,
      category: trip.category,
      duration: trip.duration,
      price: trip.price,
      tags: trip.tags,
      tripTags: trip.tripTags ?? [],
      languages: trip.languages ?? [],
      departureLocation: trip.departureLocation ?? null,
      endLocation: trip.endLocation ?? null,
      shortDescription: trip.shortDescription ?? null,
      longDescription: trip.longDescription ?? null,
      experienceHighlights: trip.experienceHighlights ?? null,
      highlights: trip.highlights ?? [],
      included: trip.included ?? [],
      excluded: trip.excluded ?? [],
      itinerary: trip.itinerary ?? null,
      essentialInformation: trip.essentialInformation ?? null,
      restrictions: trip.restrictions ?? null,
      cancellationPolicy: trip.cancellationPolicy ?? null,
      minBookingSize: trip.minBookingSize ?? null,
      maxBookingSize: trip.maxBookingSize ?? null,
      nonRefundable: trip.nonRefundable ?? false,
      timeslotsDate: effectiveDate,
      timeslots: timeslots ?? "TOURCMS_UNAVAILABLE",
    }
  },
})

const addToCartTool = tool({
  description: "Add a trip to the user's cart. Only call when user explicitly says add, book, or save.",
  inputSchema: z.object({
    tripId: z.string().describe("The trip ID to add"),
    tripTitle: z.string().describe("The trip title for confirmation"),
  }),
  // No execute -- this is a client-side tool
})

const removeFromCartTool = tool({
  description:
    "Remove ONE trip from the user's My Trip list. Call ONLY when the user explicitly asks to remove, delete, drop, or take out a specific trip from their list/plan (e.g. 'remove the boat cruise', 'take the e-bike out of my plan', 'drop the museum'). Pass the trip id when you have it from a prior tool result; ALWAYS pass the title so it can be matched if the id is missing or wrong.",
  inputSchema: z.object({
    tripId: z.string().optional().describe("The trip ID to remove (e.g. 'tcms_22'). Optional when only the title is known."),
    tripTitle: z.string().describe("The trip title to remove — used to match against the current list when the id is unknown."),
  }),
  // No execute -- this is a client-side tool (handled in onToolCall)
})

const clearCartTool = tool({
  description:
    "Remove ALL trips from the user's My Trip list at once. Call ONLY when the user explicitly asks to clear, empty, reset, wipe, or start over their whole list/plan (e.g. 'clear my list', 'remove everything', 'start fresh', 'empty my plan'). Never call this to remove a single trip — use removeFromCart for that.",
  inputSchema: z.object({
    confirm: z.boolean().optional().describe("Pass true to confirm the user explicitly asked to clear the entire list."),
  }),
  // No execute -- this is a client-side tool (handled in onToolCall)
})

const updatePreferencesTool = tool({
  description:
    "Update the user's stored trip-planning preferences whenever they ask to change any of: group (solo/couple/family/friends), adults count, children count, interests, duration, budget, visit date, OR a meal/break window (lunch, dinner, coffee). " +
    "Only call when the user explicitly changes one of these. Only include the field(s) the user actually changed — omit the rest. " +
    "MEAL BREAKS are merged BY TYPE: if the user already has a lunch window set and asks to tweak the lunch time (e.g. 'actually push lunch to 13:00' or 'cut lunch to 30 min'), include ONLY the lunch entry in `mealBreaks` — the system will REPLACE the existing lunch entry rather than stack a duplicate. Do not re-send dinner/coffee unless the user changed those. Never send conflicting entries of the same type. " +
    "The new values persist for the rest of the conversation and future visits.",
  inputSchema: z.object({
    group: z.enum(["solo", "couple", "family", "friends"]).optional().describe("Travel party type."),
    adults: z.number().int().min(1).max(10).optional().describe("Number of adults (ages 13+). Combined party size (adults + children) is capped at 10."),
    children: z.number().int().min(0).max(10).optional().describe("Number of children (ages 0-12). Combined party size (adults + children) is capped at 10."),
    interests: z.array(z.string()).max(10).optional().describe("The visitor's FULL interest list — this REPLACES the stored list, so include every interest that should remain (not just the new one). Use ONLY canonical values from 'AVAILABLE INTEREST TAGS' in the system prompt (e.g. day-trips, museums, food). To add: append to the existing list; to switch: send only the new value; to remove: send the list without it."),
    duration: z.enum(["1-2h", "half-day", "full-day"]).optional().describe("Trip duration preference."),
    budget: z.enum(["casual", "mid-range", "premium", "any"]).optional().describe("Budget preference."),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Visit date in YYYY-MM-DD format."),
    mealBreaks: z.array(z.object({
      type: z.enum(["lunch", "dinner", "coffee"]).describe("Which meal/break this entry describes."),
      earliest: z.string().regex(/^\d{2}:\d{2}$/).describe("Earliest acceptable start, HH:MM 24h."),
      latest: z.string().regex(/^\d{2}:\d{2}$/).describe("Latest acceptable start, HH:MM 24h."),
      durationMinutes: z.number().int().min(15).max(180).describe("Desired break length in minutes."),
    })).max(3).optional().describe(
      "Meal/break windows the visitor wants the itinerary to respect. At most ONE entry per `type`. Send ONLY the entry the user changed — existing entries of other types are preserved. " +
      "Examples: user says 'lunch between 12 and 13:30 for 45 min' → [{type:'lunch',earliest:'12:00',latest:'13:30',durationMinutes:45}]. User says 'shorten lunch to 30 min' → [{type:'lunch',earliest:<keep prior>,latest:<keep prior>,durationMinutes:30}]. User says 'no need for lunch, just dinner at 19:30' → [{type:'dinner',earliest:'19:00',latest:'20:00',durationMinutes:75}] (the existing lunch entry is replaced ONLY if you include lunch here)."
    ),
  }),
  // No execute -- this is a client-side tool (handled in onToolCall)
})

const tools = {
  searchTrips: searchTripsTool,
  showWeather: showWeatherTool,
  offerCoupon: offerCouponTool,
  showWeatherAlert: showWeatherAlertTool,
  buildItinerary: buildItineraryTool,
  getTripDatesAndDeals: getTripDatesAndDealsTool,
  getTripTimeslots: getTripTimeslotsTool,
  getTripDetails: getTripDetailsTool,
  addToCart: addToCartTool,
  removeFromCart: removeFromCartTool,
  clearCart: clearCartTool,
  updatePreferences: updatePreferencesTool,
} as const

/* ── Exported type for client-side typed parts ── */
export type PlannerMessage = UIMessage<never, never, InferUITools<typeof tools>>

interface TravelerPreferences {
  group: string
  interests: string[]
  duration: string
  budget: string
  /** YYYY-MM-DD — the date the user plans to visit. */
  startDate?: string
  /** Number of adults in the party (≥1). */
  adults?: number
  /** Number of children in the party (≥0). */
  children?: number
}

// ── Luxembourg timezone + public holiday helpers ──────────────────────────

/** Returns UTC offset in hours for Luxembourg (CET +1 / CEST +2) */
function getLuxembourgUtcOffset(utcDate: Date): number {
  // CEST starts: last Sunday of March at 02:00 CET
  // CET starts:  last Sunday of October at 03:00 CEST
  const year = utcDate.getUTCFullYear()

  function lastSunday(year: number, month: number): Date {
    // month: 0-based. Find last day, walk backwards to Sunday
    const d = new Date(Date.UTC(year, month + 1, 0)) // last day of month
    d.setUTCDate(d.getUTCDate() - d.getUTCDay()) // back to last Sunday
    return d
  }

  const cestStart = lastSunday(year, 2) // last Sunday March — clocks go +2 at 01:00 UTC
  const cetStart  = lastSunday(year, 9) // last Sunday October — clocks go +1 at 01:00 UTC

  if (utcDate >= cestStart && utcDate < cetStart) return 2 // CEST
  return 1 // CET
}

/** Computes Easter Sunday for a given year using the Anonymous Gregorian algorithm */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1 // 0-based
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month, day))
}

/** Returns all Luxembourg public holidays for a given year as { name, date } */
function getLuxembourgHolidays(year: number): { name: string; date: Date }[] {
  const easter = easterSunday(year)
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)
  return [
    { name: "New Year's Day",       date: new Date(Date.UTC(year, 0, 1)) },
    { name: "Easter Monday",        date: addDays(easter, 1) },
    { name: "Labour Day",           date: new Date(Date.UTC(year, 4, 1)) },
    { name: "Ascension Day",        date: addDays(easter, 39) },
    { name: "Whit Monday",          date: addDays(easter, 50) },
    { name: "National Day",         date: new Date(Date.UTC(year, 5, 23)) },
    { name: "Assumption Day",       date: new Date(Date.UTC(year, 7, 15)) },
    { name: "All Saints' Day",      date: new Date(Date.UTC(year, 10, 1)) },
    { name: "Christmas Day",        date: new Date(Date.UTC(year, 11, 25)) },
    { name: "St. Stephen's Day",    date: new Date(Date.UTC(year, 11, 26)) },
  ]
}

/** If today is a Luxembourg public holiday, returns its name; otherwise null */
function getLuxembourgHoliday(luxDate: Date): string | null {
  const year = luxDate.getUTCFullYear()
  const mm = luxDate.getUTCMonth()
  const dd = luxDate.getUTCDate()
  for (const h of getLuxembourgHolidays(year)) {
    if (h.date.getUTCMonth() === mm && h.date.getUTCDate() === dd) return h.name
  }
  return null
}

/** Returns upcoming Luxembourg public holidays within the next `days` days */
function getUpcomingLuxembourgHolidays(luxDate: Date, days: number): { name: string; dateStr: string }[] {
  const year = luxDate.getUTCFullYear()
  const todayMs = Date.UTC(luxDate.getUTCFullYear(), luxDate.getUTCMonth(), luxDate.getUTCDate())
  const limitMs = todayMs + days * 86400000
  const holidays = [...getLuxembourgHolidays(year), ...getLuxembourgHolidays(year + 1)]
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return holidays
    .filter(h => {
      const hMs = h.date.getTime()
      return hMs > todayMs && hMs <= limitMs
    })
    .map(h => ({
      name: h.name,
      dateStr: `${h.date.getUTCDate()} ${MONTHS_SHORT[h.date.getUTCMonth()]}`,
    }))
}

export async function POST(req: Request) {
  schedulePrune()
  const limit = rateLimit(req, { limit: 10, windowMs: 60_000 })
  if (!limit.allowed) return limit.response
  const tooBig = oversizedBody(req, PLANNER_BUDGET.maxBytes)
  if (tooBig) return tooBig

  // ── Server-side planner visibility gate (defense in depth) ──────────────────
  // The client checks /api/planner/visibility to hide the planner UI, but that
  // is NOT a security boundary — a direct POST here would otherwise still invoke
  // the paid model. Enforce the SAME hidePublicPlanner gate server-side: when
  // the planner is hidden and the caller is not a logged-in admin, refuse before
  // any model call. Fail-open inside isPlannerHidden() keeps legit chat working.
  if (await isPlannerHidden()) {
    return Response.json({ error: "The Trip Planner is currently unavailable." }, { status: 403 })
  }

  try {
    const body = await req.json()

    // Reject pathologically large chat history before any model call (cost
    // amplification). Generous budget — see PLANNER_BUDGET rationale above.
    const overBudget = oversizedChat(body?.messages, PLANNER_BUDGET)
    if (overBudget) return overBudget

    const { preferences, cartItems, groupMembers, itinerarySummary, canvas } = body as {
      preferences?: TravelerPreferences
      cartItems?: { id: string; title: string }[]
      groupMembers?: { name: string; interests: string[] }[]
      itinerarySummary?: {
        visitDate?: string
        summary?: string
        steps?: { tripId: string; tripTitle: string; time: string; durationMinutes: number }[]
      } | null
      // Live Trip Canvas state echoed by the client so the AI can quote the
      // EXACT number of trips the visitor sees (Gap 1 — chat↔canvas count parity).
      // When the matching count is 0 on the selected date, the client also sends
      // the alternative dates the matching trips DO run + whether OTHER trips are
      // bookable that day, so the AI recommends real dates instead of falsely
      // claiming the canvas shows trips for that date.
      canvas?: {
        count?: number
        date?: string | null
        ready?: boolean
        otherDatesCount?: number
        otherDateSamples?: { title?: string | null; dates?: string[] | null }[]
        availableTodayCount?: number
        availableTodaySamples?: { title?: string | null; tags?: string[] | null }[]
      } | null
      // Compact live availability snapshot echoed by the client (its
      // /api/planner/availability scan, party + cancellation filtered). Keyed by
      // trip id → whether bookable on the visit date + a few other bookable
      // dates. This is what lets `searchTrips` annotate its result with ACCURATE
      // on-date truth DURING the turn (the system-prompt canvas line is stale on
      // the search turn because the canvas only updates AFTER searchTrips runs).
      availability?: {
        date?: string | null
        trips?: Record<string, { onDate?: boolean; dates?: string[] | null; unknown?: boolean }>
      } | null
    }

    let messages: PlannerMessage[]
    try {
      messages = await validateUIMessages<PlannerMessage>({ messages: body.messages, tools })
    } catch (e) {
      console.error("[planner] validateUIMessages failed, using raw:", e)
      messages = body.messages ?? []
    }

    // Drop any half-finished tool calls before replaying history to the model —
    // an incomplete tool_use (no input) makes Anthropic reject the whole
    // request with a 400 and breaks the chat. See sanitizePlannerMessages.
    messages = sanitizePlannerMessages(messages)

    // ── Per-session chat turn limit (admin-configurable; defense in depth) ──
    // The client blocks at this cap too, but enforce server-side so the paid
    // model is never invoked once the visitor exceeds the configured number of
    // THEIR OWN messages (role "user"). 0 = unlimited. This is a UX cap to keep
    // the AI context focused — PLANNER_BUDGET above remains the hard abuse cap.
    // Mirror the client count (role === "user"); block only when it EXCEEDS the
    // limit (the Nth message, where N === limit, is still allowed). On any config
    // read failure we fail OPEN so legitimate chat is never wrongly blocked.
    // Canonical interest/tag vocabulary the onboarding form + canvas filter use.
    // Injected into the system prompt so the AI maps free-text themes onto the
    // EXACT values (e.g. "day tour" → day-trips) that both searchTrips and
    // updatePreferences expect — otherwise tag-driven prefs/canvas updates miss.
    let interestVocab = ""
    // Canonical {value,label} interest pairs (the array behind interestVocab).
    // Kept around so the per-turn "AVAILABLE INTERESTS ON <date>" grounding can
    // fold the live availability snapshot up to the interest/theme level.
    let interestVocabPairs: { value: string; label: string }[] = []
    try {
      const { plannerForm } = await dbGetChatPlannerConfig()
      const maxChatTurns = Number(plannerForm?.maxChatTurns) || 0
      if (maxChatTurns > 0) {
        const userTurns = messages.filter((m) => m.role === "user").length
        if (userTurns > maxChatTurns) {
          return Response.json(
            { error: "You've reached the chat limit for this session. Please reset to start a new conversation." },
            { status: 413 },
          )
        }
      }
      const opts = Array.isArray(plannerForm?.interests) ? plannerForm.interests : []
      interestVocabPairs = opts.filter((o): o is { value: string; label: string } =>
        !!o && typeof o === "object" && typeof (o as { value?: unknown }).value === "string")
      interestVocab = interestVocabPairs
        .map((o) => `${o.value} (${o.label})`)
        .join(", ")
    } catch (e) {
      console.error("[planner] chat-turn-limit check skipped:", e)
    }

    // Fetch live weather once per request and make it available to tools
    _liveWeather = await fetchLiveWeather()
    const { wx, temp, condition } = _liveWeather
    // No interest selected → empty (NOT "popular", which isn't a canonical tag).
    // The prompt instructs searchTrips with NO tags in that case so ALL trips
    // surface — a non-canonical fallback would contradict that and miss/drift.
    const defaultTags = preferences?.interests?.length ? preferences.interests.join(", ") : ""

    const cartSection = cartItems?.length
      ? `\nMY TRIP LIST — the visitor currently has ${cartItems.length} trip${cartItems.length === 1 ? "" : "s"} selected in their list (right sidebar). The Day Itinerary is built from EXACTLY these: ${cartItems.map(c => `${c.title} [${c.id}]`).join(", ")}`
      : `\nMY TRIP LIST: empty — the visitor has not added any trips to their list yet.`

    // ── Live Trip Canvas state ────────────────────────────────────────────────
    // The chat is "aware" of what's currently rendered in the center panel.
    // When a Day Itinerary is open we tell the model exactly which trips are
    // sequenced, on what date, and in what order — so it can answer
    // "what's next?", "swap the morning stop", "is the cathedral still in?"
    // accurately without needing a tool call.
    const itinerarySection = itinerarySummary?.steps?.length
      ? `\nTRIP CANVAS — DAY ITINERARY IS OPEN${itinerarySummary.visitDate ? ` for ${itinerarySummary.visitDate}` : ""} (${itinerarySummary.steps.length} stop${itinerarySummary.steps.length === 1 ? "" : "s"}):\n${itinerarySummary.steps.map((s, i) => `  ${i + 1}. ${s.time} — ${s.tripTitle} [${s.tripId}] (${s.durationMinutes} min)`).join("\n")}${itinerarySummary.summary ? `\nSummary: ${itinerarySummary.summary}` : ""}\n→ The visitor can see this itinerary right now. Do NOT re-describe stops, times, or routes — just confirm or take the next action.`
      : ""

    const groupSection = groupMembers?.length
      ? `\nGROUP MEMBERS (${groupMembers.length}):\n${groupMembers.map(m => `- ${m.name}: interests [${m.interests.join(", ")}]`).join("\n")}`
      : ""

    // ── Date / time context ──────────────────────────────────────────────────
    const now = new Date()
    // Luxembourg is UTC+1 (CET) / UTC+2 (CEST, last Sun Mar–last Sun Oct)
    const luxOffset = getLuxembourgUtcOffset(now)
    const luxNow = new Date(now.getTime() + luxOffset * 60 * 60 * 1000)
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    const dayName = DAYS[luxNow.getUTCDay()]
    const dateStr = `${DAYS[luxNow.getUTCDay()]}, ${luxNow.getUTCDate()} ${MONTHS[luxNow.getUTCMonth()]} ${luxNow.getUTCFullYear()}`
    const timeStr = `${String(luxNow.getUTCHours()).padStart(2, "0")}:${String(luxNow.getUTCMinutes()).padStart(2, "0")}`
    const isWeekend = luxNow.getUTCDay() === 0 || luxNow.getUTCDay() === 6
    const todayHoliday = getLuxembourgHoliday(luxNow)
    const upcomingHolidays = getUpcomingLuxembourgHolidays(luxNow, 30)

    // ── Pre-resolve relative dates ───────────────────────────────────────────
    // The model otherwise reads "this weekend" as NEXT week's Saturday (the
    // ambiguous "next Saturday" trap), so we resolve every common relative
    // phrase to an exact YYYY-MM-DD here and tell the model to use these
    // verbatim. All math is done on `luxNow` (already shifted to Luxembourg
    // local time) using the UTC getters, consistent with the rest of this block.
    const ymdLux = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
    const addDays = (n: number) => new Date(luxNow.getTime() + n * 86400000)
    const fmtRel = (d: Date) => `${ymdLux(d)} (${DAYS[d.getUTCDay()]})`
    const luxDow = luxNow.getUTCDay() // 0 Sun .. 6 Sat
    const daysToSat = (6 - luxDow + 7) % 7 // 0 when today is Saturday
    const tomorrowD = addDays(1)
    // "this weekend": upcoming Saturday + Sunday. On Sunday the weekend is
    // ending, so "this weekend" collapses to today (Sunday) only.
    const thisWeekendSatD = luxDow === 0 ? null : addDays(daysToSat)
    const thisWeekendSunD = luxDow === 0 ? luxNow : addDays(daysToSat + 1)
    const thisWeekendStart = luxDow === 0 ? luxNow : addDays(daysToSat)
    // "next weekend": the Saturday/Sunday one week after this weekend.
    const nextWeekendSatD = luxDow === 0 ? addDays(6) : addDays(daysToSat + 7)
    const nextWeekendSunD = luxDow === 0 ? addDays(7) : addDays(daysToSat + 8)
    const relativeDates = [
      'RELATIVE DATES (already resolved for you — use these EXACT YYYY-MM-DD values, NEVER recompute):',
      `- "today" = ${fmtRel(luxNow)}`,
      `- "tomorrow" = ${fmtRel(tomorrowD)}`,
      thisWeekendSatD
        ? `- "this weekend" / "trips this weekend" = ${fmtRel(thisWeekendSatD)} and ${fmtRel(thisWeekendSunD)} — pass startDate=${ymdLux(thisWeekendStart)} (this is the UPCOMING weekend, NOT next week).`
        : `- "this weekend" / "trips this weekend" = ${fmtRel(thisWeekendSunD)} (today is Sunday, the weekend ends today) — pass startDate=${ymdLux(thisWeekendStart)}.`,
      `- "next weekend" = ${fmtRel(nextWeekendSatD)} and ${fmtRel(nextWeekendSunD)} — pass startDate=${ymdLux(nextWeekendSatD)}.`,
    ].join("\n")

    const dateContext = [
      `DATE & TIME: ${dateStr}, ${timeStr} (Luxembourg / CET${luxOffset >= 0 ? "+" : ""}${luxOffset})`,
      isWeekend ? "It is currently the weekend." : `It is a weekday (${dayName}).`,
      relativeDates,
      todayHoliday ? `TODAY IS A PUBLIC HOLIDAY: ${todayHoliday}. All major attractions operate on holiday hours. Many local businesses may be closed.` : "",
      upcomingHolidays.length ? `UPCOMING HOLIDAYS (next 30 days): ${upcomingHolidays.map(h => `${h.name} on ${h.dateStr}`).join("; ")}.` : "",
    ].filter(Boolean).join("\n")

    const adultsCount = typeof preferences?.adults === "number" && preferences.adults >= 1 ? preferences.adults : 1
    const childrenCount = typeof preferences?.children === "number" && preferences.children >= 0 ? preferences.children : 0
    const partyLine = `${adultsCount} adult${adultsCount === 1 ? "" : "s"}` + (childrenCount > 0 ? `, ${childrenCount} child${childrenCount === 1 ? "" : "ren"}` : "")
    const profileLine = preferences
      ? "PROFILE: " + preferences.group + " (" + partyLine + "), interests: [" + preferences.interests.join(", ") + "], time: " + preferences.duration + ", budget: " + preferences.budget
      : ""

    // ── Visit date context ───────────────────────────────────────────────────
    // The user picked a specific date during onboarding. We surface it loudly
    // so the model uses it as the DEFAULT startDate / date for the live
    // availability tools (getTripDatesAndDeals / getTripTimeslots) and tunes
    // recommendations to that day (day-of-week, holiday status, weather).
    const rawVisit = preferences?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(preferences.startDate)
      ? preferences.startDate
      : null
    // Reject past dates so a stale cookie can't poison the tool defaults.
    const visitDateYMD = rawVisit && rawVisit >= todayYMD() ? rawVisit : null
    // Publish to module scope so tools (getTripDatesAndDeals / getTripTimeslots)
    // fall back to it deterministically when the model omits the date arg.
    _defaultVisitDate = visitDateYMD
    _defaultPartySize = Math.max(1, adultsCount + childrenCount)

    // Capture the client's live availability snapshot so searchTrips can report
    // accurate on-visit-date availability for the trips it returns (see the
    // _plannerAvail/_availDate notes). Only trust it when its date matches the
    // stored visit date — a mismatched/missing snapshot is ignored (no false
    // "zero matches" from a stale scan). Reset first so a turn without a snapshot
    // can't inherit the previous request's map.
    _plannerAvail = {}
    _availDate = null
    {
      const snap = body?.availability
      const snapDate = typeof snap?.date === "string" ? snap.date : null
      if (snap && snapDate && snapDate === visitDateYMD && snap.trips && typeof snap.trips === "object") {
        const map: Record<string, { onDate: boolean; dates: string[]; unknown?: boolean }> = {}
        for (const [id, v] of Object.entries(snap.trips)) {
          if (!id || typeof v !== "object" || v === null) continue
          map[id] = {
            onDate: (v as { onDate?: boolean }).onDate === true,
            dates: Array.isArray((v as { dates?: string[] }).dates)
              ? (v as { dates: string[] }).dates.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 8)
              : [],
            // "unknown" = BOTH TourCMS sources failed for this trip on the visit
            // date, so availability is genuinely undetermined (a service incident,
            // NOT a confident "no openings"). searchTrips surfaces this so the AI
            // says "couldn't confirm" rather than telling the visitor it's closed.
            ...((v as { unknown?: boolean }).unknown === true ? { unknown: true } : {}),
          }
        }
        _plannerAvail = map
        _availDate = visitDateYMD
      }
    }
    // Request-local snapshot of the availability map + its date. The module-global
    // _plannerAvail/_availDate exist so the tool executors can fall back to them,
    // but a CONCURRENT planner request can reassign those globals before THIS
    // request finishes building its prompt — which would let one visitor's chat
    // quote another visitor's availability (the exact canvas↔chat contradiction
    // this fix targets). Each request reassigns the globals to a brand-new object
    // (never mutates in place), so capturing the reference here pins this
    // request's truth immutably for the synchronous prompt build below.
    const reqAvail = _plannerAvail
    const reqAvailDate = _availDate
    let visitDateContext = ""
    if (visitDateYMD) {
      const [vy, vm, vd] = visitDateYMD.split("-").map(Number)
      const visitDate = new Date(Date.UTC(vy, vm - 1, vd))
      const vDayName = DAYS[visitDate.getUTCDay()]
      const vIsWeekend = visitDate.getUTCDay() === 0 || visitDate.getUTCDay() === 6
      const vHoliday = getLuxembourgHoliday(visitDate)
      const todayMs = Date.UTC(luxNow.getUTCFullYear(), luxNow.getUTCMonth(), luxNow.getUTCDate())
      const visitMs = visitDate.getTime()
      const daysAhead = Math.round((visitMs - todayMs) / 86400000)
      const relLabel = daysAhead === 0 ? "today" : daysAhead === 1 ? "tomorrow" : `in ${daysAhead} days`
      visitDateContext = [
        `VISIT DATE: ${vDayName}, ${visitDate.getUTCDate()} ${MONTHS[visitDate.getUTCMonth()]} ${visitDate.getUTCFullYear()} (${visitDateYMD}) — ${relLabel}.`,
        vIsWeekend ? "This is a weekend day." : `This is a weekday (${vDayName}).`,
        vHoliday ? `THIS DAY IS A PUBLIC HOLIDAY: ${vHoliday}.` : "",
        "ALWAYS pass this YYYY-MM-DD as the `startDate` for getTripDatesAndDeals and as the `date` for getTripTimeslots unless the user explicitly asks for a different date.",
      ].filter(Boolean).join("\n")
    }

    // Get planner behavior settings (must be fetched before use)
    const settings = await dbGetSettings()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plannerBehavior = (settings as any).plannerBehavior
    const optimizationHint = plannerBehavior?.optimizationPriority === "minimize_travel" 
      ? "Prioritize nearby activities to minimize travel time between stops."
      : plannerBehavior?.optimizationPriority === "maximize_activities"
      ? "Try to fit more activities into the day, keeping experiences compact."
      : plannerBehavior?.optimizationPriority === "budget_conscious"
      ? "Prioritize affordable and free activities when possible."
      : "Balance travel time, number of activities, and budget considerations."
    
    const varietyHint = (plannerBehavior?.suggestionRandomness ?? 30) > 60
      ? "Favor surprising and varied recommendations over predictable top picks."
      : (plannerBehavior?.suggestionRandomness ?? 30) < 30
      ? "Focus on consistently recommending proven top-rated experiences."
      : "Mix popular favorites with occasional hidden gems."
    
    const localBiasHint = (plannerBehavior?.localFavoritesBias ?? 40) > 60
      ? "Lean towards hidden gems and local favorites over tourist hotspots."
      : (plannerBehavior?.localFavoritesBias ?? 40) < 30
      ? "Focus on popular, well-reviewed tourist attractions."
      : "Balance popular attractions with local favorites."

    // Inject the real published-trip count so the model can never invent
    // numbers like "50+ trips". This is the same catalog `searchTrips`
    // reads from, so the figure is always in sync. Keep the array around so the
    // per-turn AVAILABLE INTERESTS grounding below reuses it (no extra DB hit).
    const promptCatalog = await loadTripCatalog()
    const publishedCatalogSize = promptCatalog.length

    // ── AVAILABLE INTERESTS ON VISIT DATE (per-turn theme-level grounding) ─────
    // The AI only learns per-trip availability AFTER it runs searchTrips, so it
    // had no standing signal for WHICH interest themes actually have a trip
    // bookable on the chosen date — and would re-suggest themes it had already
    // ruled out (e.g. "consider museums or cultural tours" on a rainy day when
    // neither runs that day). Fold the same client availability snapshot used by
    // searchTrips up to the interest level so the model only proposes themes that
    // are really bookable. Only when the snapshot matches the stored visit date.
    let availableInterestsLine = ""
    if (
      visitDateYMD &&
      _availDate === visitDateYMD &&
      Object.keys(_plannerAvail).length > 0 &&
      interestVocabPairs.length > 0
    ) {
      const tripStatus = (id: string): InterestTripStatus => {
        const snap = _plannerAvail[id]
        if (!snap) return "unknown"
        const cls = classifyTripAvailability(snap)
        if (cls === "available") return "available"
        if (cls === "unconfirmed") return "unknown" // incident, not a closure
        return "unavailable" // "alternative" | "none" → confidently not that day
      }
      const result = computeAvailableInterests({
        vocab: interestVocabPairs,
        catalog: promptCatalog,
        tripStatus,
      })
      availableInterestsLine = buildAvailableInterestsLine({
        result,
        visitDatePretty: prettyYMD(visitDateYMD),
      })
    }

    // ── PER-TRIP AVAILABILITY GROUND TRUTH (preloaded dates-and-deals) ────────
    // The client already ran the authoritative whole-catalog dates-and-deals
    // scan for the visit date and forwards it (see _plannerAvail). Previously it
    // only reached the model as a COUNT + theme-level hints, so the AI had no
    // STANDING per-trip availability statement and would contradict the canvas
    // (chat: "castle not available today" while the canvas badge shows it IS).
    // Surface the full per-trip status so the model knows, from turn 1, exactly
    // which trips are bookable on the selected date — no tool call, no "let me
    // check again". Only when the snapshot reflects the CURRENT stored visit date.
    let availabilityGroundTruth = ""
    if (
      visitDateYMD &&
      reqAvailDate === visitDateYMD &&
      Object.keys(reqAvail).length > 0 &&
      promptCatalog.length > 0
    ) {
      const titleById = new Map(promptCatalog.map((t) => [t.id, t.title] as const))
      const gtTrips: GroundTruthTrip[] = []
      for (const [id, snap] of Object.entries(reqAvail)) {
        const title = titleById.get(id)
        if (!title || !title.trim()) continue // skip ids not in the public catalog
        const cls = classifyTripAvailability(snap)
        gtTrips.push({
          title,
          status: cls,
          altDates:
            cls === "alternative"
              ? (snap.dates ?? []).slice(0, 3).map(prettyYMD)
              : undefined,
        })
      }
      availabilityGroundTruth = buildAvailabilityGroundTruth({
        visitDatePretty: prettyYMD(visitDateYMD),
        trips: gtTrips,
      })
    }

    // ── TRIP CATALOG STATIC FACTS (always-on identity knowledge) ──────────────
    // Date-INDEPENDENT facts (title · category · location · duration) for every
    // published trip, so the model can answer "what / where / how long / what
    // type" without a tool call. Deep prose stays on-demand via getTripDetails
    // to keep the prompt lean.
    const catalogFactsBlock = buildCatalogFactsBlock(
      promptCatalog.map((t) => ({
        title: t.title,
        category: t.category,
        location: t.departureLocation || t.city || null,
        duration: t.duration,
      })),
    )

    // ── Live Trip Canvas count (Gap 1 — chat↔canvas count parity) ─────────────
    // The client sends the EXACT number of trips currently rendered on the Trip
    // Canvas (already filtered by visit-date availability + interests — the same
    // filter the visitor sees). We surface it so the AI can answer "how many
    // trips can I do?" with the real on-screen number instead of the inflated
    // raw searchTrips `total`. Only inject when the client says the count is
    // READY (availability scan finished) AND it reflects the CURRENT stored date,
    // so a stale/loading number is never quoted.
    const canvasCountLine = buildCanvasCountLine({
      canvasCount: typeof canvas?.count === "number" ? canvas.count : null,
      canvasReady: canvas?.ready === true,
      canvasDate: typeof canvas?.date === "string" ? canvas.date : null,
      visitDateYMD,
      otherDatesCount:
        typeof canvas?.otherDatesCount === "number" ? canvas.otherDatesCount : null,
      otherDateSamples: Array.isArray(canvas?.otherDateSamples)
        ? canvas.otherDateSamples
        : null,
      availableTodayCount:
        typeof canvas?.availableTodayCount === "number" ? canvas.availableTodayCount : null,
      availableTodaySamples: Array.isArray(canvas?.availableTodaySamples)
        ? canvas.availableTodaySamples
        : null,
    })

    const systemPromptParts = buildPlannerSystemPromptParts({
      publishedCatalogSize, dateContext, visitDateContext, temp, condition, wx,
      profileLine, cartSection, groupSection, itinerarySection,
      optimizationHint, varietyHint, localBiasHint, plannerBehavior, defaultTags, visitDateYMD,
      interestVocab, canvasCountLine, availableInterestsLine, availabilityGroundTruth, catalogFactsBlock,
    })
    
    // Append admin-configured custom system prompt if available.
    // Precedence: the planner row's own `system_prompt` column wins (the
    // consolidated location, edited on /admin/ai-systems/planner-chat). For
    // back-compat we fall back to the legacy chat.extra.planner.systemPrompt
    // location for any override saved before migration 006 relocated it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plannerRowPrompt: unknown = (settings.ai?.planner as any)?.systemPrompt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatExtra: any = (settings.ai?.chat as any)?.extra ?? {}
    const legacyPlannerPrompt: unknown = chatExtra?.planner?.systemPrompt
    const adminPrompt = typeof plannerRowPrompt === "string" && plannerRowPrompt.trim()
      ? plannerRowPrompt
      : (typeof legacyPlannerPrompt === "string" ? legacyPlannerPrompt : "")
    if (adminPrompt && adminPrompt.trim()) {
      systemPromptParts.push("", "CUSTOM INSTRUCTIONS FROM ADMIN:", adminPrompt)
    }
    
    const systemPrompt = systemPromptParts.join("\n")

    // ── Model resolution (Task #15) ────────────────────────────────────────
    // Resolve the active provider + concrete model centrally. The stored model
    // only selects the TIER; the concrete model id always belongs to the
    // effective provider, so switching providers never points at a wrong-
    // provider model id. Fail-soft: `.model === null` → no usable key.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminModel: string | undefined =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plannerBehavior?.model || (settings.ai?.planner as any)?.model

    const ai = await resolveAi({ storedModel: adminModel, defaultTier: "balanced", settings })
    if (!ai.model) {
      // Stream a chat-shaped error so the client's useChat hook can
      // display it inline instead of failing silently on a raw 503.
      const msg = "AI is not configured. Open Admin → Integrations and save an Anthropic or OpenAI API key, or set AI_GATEWAY_API_KEY in environment variables."
      console.error("[planner] No AI credentials available —", msg)
      void logError({ source: "ai:planner", message: msg, level: "warn" })
      const sse =
        `data: ${JSON.stringify({ type: "start" })}\n\n` +
        `data: ${JSON.stringify({ type: "error", errorText: msg })}\n\n` +
        `data: [DONE]\n\n`
      return new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
      })
    }
    const model = ai.model

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      onError: ({ error }) => {
        void logCaughtError("ai:planner", error, { phase: "streamText" })
      },
      stopWhen: stepCountIs(5),
      // Hard kill-switch: if Claude starts emitting labelled-section recaps
      // (BEST MATCHES:, NOT SUITABLE:, WEATHER FIT:, DAYTIME / SUNDAY-SUITABLE,
      // ANYTIME:, NIGHT / EVENING:, FIT FOR…) or a numbered enumeration
      // ("1. <Trip Name>" at line start), we cut the stream right there.
      // The visible reply then ends before the recap can render. The system
      // prompt + this safety net together enforce the no-recap rule.
      // Narrow, high-precision recap markers. We only stop on the exact
      // labelled-header forms ("BEST MATCHES:", "NOT SUITABLE:", …) — not
      // bare words like "EVENING" or "ANYTIME" which can appear in
      // legitimate prose. The numbered "1. " line-starter is the
      // signature of a trip enumeration.
      stopSequences: [
        "\nBEST MATCHES:",
        "\nNOT SUITABLE:",
        "\nWEATHER FIT:",
        "\nDAYTIME:",
        "\nDAYTIME /",
        "\nNIGHT:",
        "\nNIGHT /",
        "\nEVENING:",
        "\nANYTIME:",
        "\nFIT FOR ",
        "\nNOT FIT FOR",
        "\n1. ",
        "\n1) ",
      ],
    })

    // Classify runtime stream errors so the client can show accurate guidance.
    // The AI SDK's default masker forwards a generic "An error occurred" for
    // EVERY failure, which made the chat blame the API key even on transient
    // issues (rate-limit 429, model overload 529, network/timeout/abort) with a
    // perfectly valid key. Emit a stable token: "AI_AUTH" only for real
    // credential failures, "AI_TEMP" for everything else (retryable).
    return result.toUIMessageStreamResponse({
      onError: (error) => {
        const e = error as { statusCode?: number; status?: number; message?: string } | undefined
        const status = e?.statusCode ?? e?.status
        const msg = (e?.message ?? String(error ?? "")).toLowerCase()
        const isAuth =
          status === 401 ||
          status === 403 ||
          /invalid x-api-key|authentication|unauthor|invalid api key|api[_ ]?key/i.test(msg)
        // ALWAYS log the stream-phase failure to admin errors. streamText.onError
        // only covers errors raised during generation; errors surfaced while
        // serializing the UI message stream to the HTTP response land HERE and
        // were previously mapped to a client token WITHOUT ever being logged —
        // which is why "couldn't reach the AI assistant" never showed up in
        // /admin/logs. Now both phases are covered.
        void logCaughtError("ai:planner", error, {
          phase: "stream-response",
          classified: isAuth ? "AI_AUTH" : "AI_TEMP",
          ...requestMeta(req),
        })
        return isAuth ? "AI_AUTH" : "AI_TEMP"
      },
    })
  } catch (error) {
    console.error("[planner] POST error:", error)
    void logCaughtError("ai:planner", error, { phase: "POST" })
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
