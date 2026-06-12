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
import { buildPlannerSystemPromptParts } from "@/lib/planner/system-prompt"
import { z } from "zod"
import { weatherData as staticWeatherData, type Trip } from "@/lib/data"
import { dbGetSettings, dbGetTrip, dbListTrips } from "@/lib/db/queries"
import { getTourCMSConfig, showTourDatesAndDeals, checkAvailability } from "@/lib/tourcms"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"
import { logError, logCaughtError } from "@/lib/error-log"

export const maxDuration = 30
export const dynamic = "force-dynamic"

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
    "Search, filter, AND narrow the Trip Canvas to a specific shortlist. The Trip Canvas (Recommended for you) panel renders EXACTLY what this tool returns. Call it when the user asks for recommendations, OR when you've identified the day's best matches and want to pin the canvas to ONLY those trips (pass their ids in `ids`). Returns the matching trips with full Palisis-sourced details — use those fields for follow-up Q&A without re-searching.",
  inputSchema: z.object({
    query: z.string().describe("Search query or interest keywords. Pass an empty string when you are pinning by `ids` and don't need keyword ranking."),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tags to filter: food, outdoor, indoor, culture, sport, night, family, popular, romantic"),
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
    if (!hasValidPinnedIds && tags && tags.length > 0) {
      const tagged = results.filter((t) =>
        tags.some((tag) =>
          t.tags.includes(tag) || (t.tripTags ?? []).includes(tag),
        ),
      )
      if (tagged.length > 0) results = tagged
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
        let aS = 0, bS = 0
        const aTags = [...a.tags, ...(a.tripTags ?? [])]
        const bTags = [...b.tags, ...(b.tripTags ?? [])]
        if (wx === "rainy") { aS += aTags.includes("indoor") ? 5 : -2; bS += bTags.includes("indoor") ? 5 : -2 }
        else if (wx === "sunny") { aS += aTags.includes("outdoor") ? 5 : 0; bS += bTags.includes("outdoor") ? 5 : 0 }
        aS += a.rating >= 4.7 ? 2 : 0; bS += b.rating >= 4.7 ? 2 : 0
        return bS - aS
      })
    }

    return {
      trips: results.slice(0, limit).map((t) => ({
        // Card-rendering fields (used by client)
        id: t.id, title: t.title, image: t.image, price: t.price,
        originalPrice: t.originalPrice, rating: t.rating, reviewCount: t.reviewCount,
        duration: t.duration, category: t.category, tags: t.tags, badge: t.badge,
        city: t.city, description: t.description, highlights: t.highlights,
        // Rich Palisis fields (for AI reasoning + follow-up Q&A)
        tourType: t.tourType, tourLeader: t.tourLeader, grade: t.grade,
        accommodationRating: t.accommodationRating,
        tripTags: t.tripTags, languages: t.languages,
        departureLocation: t.departureLocation, endLocation: t.endLocation,
        country: t.country,
        shortDescription: t.shortDescription, longDescription: t.longDescription,
        experienceHighlights: t.experienceHighlights,
        itinerary: t.itinerary,
        essentialInformation: t.essentialInformation,
        hotelPickupInstructions: t.hotelPickupInstructions,
        voucherRedemptionInstructions: t.voucherRedemptionInstructions,
        restrictions: t.restrictions, extras: t.extras,
        cancellationPolicy: t.cancellationPolicy,
        included: t.included, excluded: t.excluded,
        minBookingSize: t.minBookingSize, maxBookingSize: t.maxBookingSize,
        nonRefundable: t.nonRefundable,
        nextBookableDate: t.nextBookableDate, lastBookableDate: t.lastBookableDate,
      })),
      weather: wx,
      total: results.length,
      catalogTotal: catalogSize,
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
    return {
      ok: true,
      tripId,
      palisisId,
      dateRange: { start, end },
      totalDateCount: res.total_date_count,
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
    const res = await checkAvailability(config, palisisId, { date: effectiveDate, show_pickups: "0" })
    if (!res.ok) {
      return {
        ok: false,
        error: "TOURCMS_ERROR",
        providerError: res.error ?? null,
        tripId,
        date,
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
          startTimeUtcSeconds: c.start_time_utcseconds ? parseInt(c.start_time_utcseconds, 10) : undefined,
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
      date,
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
    interests: z.array(z.string()).max(10).optional().describe("Interest tags chosen by the visitor. The UI caps how many are allowed; pass only what the user explicitly mentions."),
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

/**
 * Strip incomplete tool invocations out of the replayed message history.
 *
 * A tool call that was interrupted mid-stream — by the `stopSequences`
 * kill-switch, the `stepCountIs` limit, or a transport error — gets persisted
 * on the client as a tool part WITHOUT a completed input/output. When
 * convertToModelMessages turns that into an Anthropic `tool_use` block it has
 * no `input`, and Anthropic rejects the ENTIRE next request with a 400
 * ("messages.N.content.0.tool_use.input: Field required"). That is what made
 * the planner chat die on the turn after any tool-using reply, regardless of
 * whether the API key was valid.
 *
 * We keep only fully-resolved tool parts (state "output-available" /
 * "output-error") so every tool_use has both its input and a matching
 * tool_result, and drop any message left with no parts.
 */
function sanitizePlannerMessages(messages: PlannerMessage[]): PlannerMessage[] {
  const cleaned: PlannerMessage[] = []
  for (const m of messages) {
    const parts = (m.parts ?? []).filter((p) => {
      const t = (p as { type?: string }).type ?? ""
      if (!t.startsWith("tool-") && t !== "dynamic-tool") return true
      const part = p as { state?: string; input?: unknown }
      const resolved = part.state === "output-available" || part.state === "output-error"
      // A tool_use replayed to Anthropic MUST carry its input object. Parts with
      // undefined input slip through a state-only check — this happens both for
      // interrupted streams AND for client-injected synthetic cards (e.g. the
      // "manual-…" buildItinerary the planner page adds when it builds the
      // itinerary deterministically). Either way, an empty input triggers the
      // 400 "tool_use.input: Field required", so we require a real input here.
      const hasInput = part.input !== undefined && part.input !== null
      return resolved && hasInput
    })
    if (parts.length > 0) {
      cleaned.push({ ...m, parts } as PlannerMessage)
    }
  }
  return cleaned
}

export async function POST(req: Request) {
  schedulePrune()
  const limit = rateLimit(req, { limit: 10, windowMs: 60_000 })
  if (!limit.allowed) return limit.response

  try {
    const body = await req.json()
    const { preferences, cartItems, groupMembers, itinerarySummary } = body as {
      preferences?: TravelerPreferences
      cartItems?: { id: string; title: string }[]
      groupMembers?: { name: string; interests: string[] }[]
      itinerarySummary?: {
        visitDate?: string
        summary?: string
        steps?: { tripId: string; tripTitle: string; time: string; durationMinutes: number }[]
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

    // Fetch live weather once per request and make it available to tools
    _liveWeather = await fetchLiveWeather()
    const { wx, temp, condition } = _liveWeather
    const defaultTags = preferences?.interests?.length ? preferences.interests.join(", ") : "popular"

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

    const dateContext = [
      `DATE & TIME: ${dateStr}, ${timeStr} (Luxembourg / CET${luxOffset >= 0 ? "+" : ""}${luxOffset})`,
      isWeekend ? "It is currently the weekend." : `It is a weekday (${dayName}).`,
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
    // reads from, so the figure is always in sync.
    const publishedCatalogSize = (await loadTripCatalog()).length
    const systemPromptParts = buildPlannerSystemPromptParts({
      publishedCatalogSize, dateContext, visitDateContext, temp, condition, wx,
      profileLine, cartSection, groupSection, itinerarySection,
      optimizationHint, varietyHint, localBiasHint, plannerBehavior, defaultTags, visitDateYMD,
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

    const ai = await resolveAi({ storedModel: adminModel, defaultTier: "fast", settings })
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

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("[planner] POST error:", error)
    void logCaughtError("ai:planner", error, { phase: "POST" })
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
