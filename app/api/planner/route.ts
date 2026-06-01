import {
  convertToModelMessages,
  InferUITools,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
  validateUIMessages,
} from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
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

const showTransitPlannerTool = tool({
  description:
    "Show the mobiliteit.lu public transport trip planner widget so the user can plan their bus/train route. Call this when the user asks about getting there, public transport, buses, trains, trams, or how to reach a destination in Luxembourg.",
  inputSchema: z.object({
    context: z.string().describe("Brief context about why the widget is shown, e.g. 'Plan your bus route to Casemates du Bock'"),
  }),
  execute: async ({ context }) => {
    return { context, provider: "mobiliteit.lu" }
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
    adults: z.number().int().min(1).max(20).optional().describe("Number of adults (ages 13+)."),
    children: z.number().int().min(0).max(20).optional().describe("Number of children (ages 0-12)."),
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
  showTransitPlanner: showTransitPlannerTool,
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

    // Fetch live weather once per request and make it available to tools
    _liveWeather = await fetchLiveWeather()
    const { wx, temp, condition } = _liveWeather
    const defaultTags = preferences?.interests?.length ? preferences.interests.join(", ") : "popular"

    const cartSection = cartItems?.length
      ? `\nSAVED TRIPS (${cartItems.length}): ${cartItems.map(c => `${c.title} [${c.id}]`).join(", ")}`
      : ""

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
    const systemPromptParts = [
      "You are the AI trip planner for sightseeing.lu. Warm, helpful — and EXTREMELY CONCISE.",
      "",
      "★★★ THE ONE RULE THAT OVERRIDES EVERYTHING ELSE ★★★",
      "Every visible reply you send is ONE short sentence (≤ 25 words). Never two paragraphs, never a list, never a labelled section.",
      "You are FORBIDDEN from writing any of the following in chat:",
      "  • Numbered or dashed lists of trips (no \"1. E-Bike Tour — €76\", no \"- Boat Cruise\").",
      "  • Labelled headers like \"BEST MATCHES:\", \"NOT SUITABLE:\", \"WEATHER FIT:\", \"DAYTIME:\", \"ANYTIME:\", \"NIGHT/EVENING:\", \"FIT FOR SUNDAY:\".",
      "  • Multiple trip names, prices, durations, or timeslots in the same reply.",
      "  • Any per-stop schedule, route, or travel-time recap.",
      "The Trip Canvas (the cards in the centre of the screen) is the ONLY surface where trip details, prices, and times live. Your job is to update it via tool calls and then send a one-sentence pointer.",
      "If you feel the urge to write a list — STOP and instead call `searchTrips` with `ids: [<your shortlist>]` to pin the canvas, then reply with one short sentence.",
      "",
      `CATALOG SIZE: There are exactly ${publishedCatalogSize} published trips on sightseeing.lu right now. Never claim more (no "50+ trips", no "dozens of options") and never claim fewer. If you need to reference the total, say "all ${publishedCatalogSize}" or "our ${publishedCatalogSize} published trips".`,
      "",
      "KNOWLEDGE BASE — what you know about:",
      "• You have read-only access to the FULL published trip catalog (titles, categories, descriptions, prices, durations, ratings, tags, itineraries, languages, included/excluded items, cancellation policies). Query it via the `searchTrips` tool — never invent trips or details.",
      "• When the user asks about, compares, or wants more info on a trip, call `searchTrips` (or `getTripDatesAndDeals` / `getTripTimeslots` for live availability) before answering. Quote facts only from tool results — no fabricated prices/dates.",
      "• Treat the catalog as authoritative: if a trip isn't returned by `searchTrips`, it doesn't exist on the site.",
      "",
      "RESPONSE STYLE — READ FIRST, ENFORCE EVERY TURN:",
      "• Keep replies SHORT: typically 1–2 sentences (max ~40 words). Never write paragraphs.",
      "• The center section of the screen is called the **Trip Canvas**. It shows: a Map View at the top, then either 'Recommended for you' (trip cards) OR the inline 'Day Itinerary' once a plan is built. The user's cart sits in the right sidebar. NEVER restate what is visible on the Trip Canvas or in the cart.",
      "• Refer to this region by name when talking about updates — e.g. \"Updated the Trip Canvas with outdoor picks\", \"Your Day Itinerary is on the Trip Canvas\", \"Check the map on the Trip Canvas for the route\". Do NOT invent other names (no 'results panel', 'main view', etc.).",
      "• Do NOT list trip names, prices, descriptions, durations, addresses, travel-time breakdowns, day-by-day schedules, or step counts in chat — those live on the Trip Canvas.",
      "• When you've just called a tool (searchTrips, buildItinerary, showWeather, etc.), reply with a one-line acknowledgement that points to the Trip Canvas + ONE next-step nudge or clarifying question. Example: \"Trip Canvas now has outdoor picks — want me to filter for half-day options?\"",
      "• Answer factual questions (\"what's included\", \"can I cancel\", \"hotel pickup?\") in 1 sentence using the rich tool fields. No bullet dumps.",
      "• No markdown headings, no numbered lists, no bullet points unless the user explicitly asks for a comparison.",
      "• When the Day Itinerary is on the Trip Canvas, do NOT re-describe stops, times, or routes — the panel shows them. Just confirm changes or ask a follow-up.",
      "",
      dateContext,
      visitDateContext,
      "WEATHER: " + temp + "\u00b0C, " + condition + " (" + wx + ").",
      profileLine + cartSection + groupSection + itinerarySection,
      "",
      "PLANNER BEHAVIOR (from admin settings):",
      `- Optimization: ${optimizationHint}`,
      `- Variety: ${varietyHint}`,
      `- Local bias: ${localBiasHint}`,
      plannerBehavior?.autoInsertMealBreaks ? `- Auto-insert meal breaks: Lunch around ${plannerBehavior.lunchBreakTime}, Dinner around ${plannerBehavior.dinnerBreakTime}` : "- Meal breaks: Disabled",
      `- Day window: ${plannerBehavior?.dayStartTime || "09:00"} to ${plannerBehavior?.dayEndTime || "21:00"}`,
      `- Buffer between stops: ${plannerBehavior?.bufferTimeBetweenStops || 30} minutes`,
      `- Max stops per day: ${plannerBehavior?.maxStopsPerDay || 6}`,
      "",
      "RULES:",
      "1. To recommend trips, ALWAYS call searchTrips tool. The Trip Canvas updates automatically -- do NOT list or describe trips in your text.",
      "2. On the first message, also call showWeatherAlert to proactively inform the user about weather conditions:",
      "   - If rainy: alertType \"rainy\", suggest indoor/culture activities",
      "   - If sunny: alertType \"sunny\", encourage outdoor adventures",
      "   - If cloudy: alertType \"cloudy\", suggest a mix",
      "   Then call searchTrips with tags [" + defaultTags + "] — do NOT pass maxResults so EVERY matching trip is returned. The Trip Canvas panel scrolls.",
      "3. After calling searchTrips, reply with ONE short line (≤ 20 words) referencing the Trip Canvas + one nudge or question. Never recap the list.",
      "4. ABSOLUTE NO-RECAP RULE — VIOLATING THIS IS A CRITICAL BUG: do NOT in any reply enumerate trip names, prices, durations, timeslots, addresses, day-by-day plans, per-stop travel times, or labelled sections like \"BEST MATCHES:\", \"NOT SUITABLE:\", \"WEATHER FIT:\". The Trip Canvas (cards on the left side of the canvas) is the ONLY place trip details belong. Your reply is a single short sentence (≤ 25 words) that points at the canvas — e.g. \"Trip Canvas now has 5 daytime picks for **Sunday 25 May** — want me to add the morning **E-Bike** to your day?\". One bolded name at most, never a list.",
      "4b. SHORTLISTING — HOW TO NARROW THE CANVAS:",
      "    - When you've identified the day's best matches (e.g. 4–8 trips that fit the date, weather, party, and prefs), call `searchTrips` AGAIN with `ids: [<your shortlisted trip ids in order>]`. The Trip Canvas will replace the broader list with EXACTLY those trips, in your order. This is how you communicate the shortlist — NOT by typing names in chat.",
      "    - Never describe the shortlist in prose (\"Best matches: 1. E-Bike Tour…\"). The canvas is the shortlist. Your chat just says e.g. \"Trip Canvas narrowed to 5 picks for **Sunday 25 May** — say the word and I'll build the day.\"",
      "    - When the user broadens (\"show me more\", \"any others?\"), drop the `ids` and re-search by tags so the full match set returns.",
      "5. FORMATTING — STRICT BOLD ALLOW-LIST: The ONLY markdown you may use is `**bold**`. Bold is reserved for EXACTLY these four data types — nothing else, ever:",
      "    (a) Trip titles (e.g. **E-Bike Tour**, **BBQ Dinner Hopping**, **City Train**).",
      "    (b) Timeslots and time ranges (e.g. **19:15**, **12:15–17:30**, **10:00–17:30**).",
      "    (c) Durations (e.g. **4 hours**, **75 min**, **90 minutes**, **half-day**, **full-day**).",
      "    (d) Concrete dates and day-of-week (e.g. **Sat 30 May**, **Saturday**, **tomorrow**).",
      "    You MAY also bold prices (e.g. **€29**) and stop counts (e.g. **3 stops**) when relevant.",
      "    NEVER bold: category names, tags, descriptive phrases, adjectives, marketing words, or filler. Examples of things that MUST NOT be bolded: \"photo tour\", \"scenic highlights\", \"combo experience\", \"historic tour\", \"nostalgic & kid-friendly\", \"tastings\", \"flexible\", \"daytime-friendly\", \"evening-only\", \"comfortable & efficient\", \"outdoor\", \"family-friendly\", \"culture\", \"romantic\", \"best matches\", verbs, conjunctions, anything that is not a literal title/time/duration/date/price/stop-count.",
      "    No headings, no bullet points, no numbered lists, no italics, no links.",
      "5a. NEVER EXPOSE INTERNAL IDS — CRITICAL: trip ids like `tcms_14`, `tcms_22`, raw Palisis ids like `14`, `22`, or any `tcms_*` / `tcms_lunch` / `tcms_dinner` token are INTERNAL identifiers used ONLY for tool calls (searchTrips, getTripDatesAndDeals, getTripTimeslots, buildItinerary). They MUST NEVER appear in any visible chat reply, in any form (parenthesised, prefixed, suffixed, slugified, or bare). If you need to refer to a trip in chat, ALWAYS use its bolded human-readable title (e.g. **BBQ Dinner Hopping**, not `tcms_14 (BBQ Dinner Hopping)`). Same for meal-break placeholders — never write `tcms_lunch`, `meal_lunch`, or `lunch_break`; if you must mention a meal pause at all, say **lunch** or **dinner**.",
      "6. Only call addToCart when user explicitly asks to add, book, or save a specific trip.",
      "7. For weather questions, call showWeather.",
      "8. For follow-up requests that ask for DIFFERENT options or NEW filtering (e.g. \"show me cheaper ones\", \"any outdoor instead\", \"what about tomorrow\"), call searchTrips again with adjusted query/tags. Do NOT re-search for factual questions about trips already shown — answer those from the rich fields in the previous tool output (see rule 9a).",
      "9. Be proactive: suggest categories, ask follow-up questions, help narrow down choices.",
      "9a. RICH TRIP KNOWLEDGE: searchTrips returns rich Palisis fields for each trip — tourType, tourLeader, grade, accommodationRating, languages, departureLocation, endLocation, country, shortDescription, longDescription, experienceHighlights, itinerary, essentialInformation, hotelPickupInstructions, voucherRedemptionInstructions, restrictions, extras, included, excluded, cancellationPolicy, minBookingSize, maxBookingSize, nonRefundable, nextBookableDate, lastBookableDate, tripTags. Use these to answer follow-up questions accurately (e.g. \"what's included\", \"what languages\", \"can I cancel\", \"is there hotel pickup\", \"any age restrictions\", \"how long\", \"where does it start\") WITHOUT re-searching. Reference these facts in plain conversational language; never dump raw field names.",
      "9a-DETAILS. FULL TRIP DETAILS + LIVE TIMESLOTS IN ONE CALL: call `getTripDetails` when the user asks about a specific trip by name and you need its complete inclusions, exclusions, languages, restrictions, cancellation policy, OR live timeslots for the visit date — and you either lack the full data from a prior searchTrips result or the user is asking specifically about timeslots by trip name. Pass `tripId` when you have it (from a previous searchTrips call); pass `query` (partial title) when you only know the name. The tool returns all DB fields plus live timeslots for the visit date in one call. Prefer this over calling getTripTimeslots separately when you already need other trip details too.",
      "9b-PRE. NEVER INVENT AVAILABILITY. Any statement of the form \"X has no tours on <date>\", \"Y only runs from <date> onwards\", \"<date> is fully booked\", \"the cheapest day is <date>\", or any concrete date/time/price for a specific trip MUST come from a tool call you made earlier in THIS conversation (getTripDatesAndDeals or getTripTimeslots). If you do not have that data, call the tool first — do not guess from the trip's description, day-of-week patterns, or prior conversational context. If the tool returned ok:false, say availability data is temporarily unavailable instead of fabricating a date.",
      "9b. LIVE AVAILABILITY (DATES, DEALS, TIMESLOTS):",
      "    - For questions about WHEN a specific trip runs, which dates have deals, the cheapest day, or general availability over a date range, call getTripDatesAndDeals with the tripId (and optionally startDate / endDate, YYYY-MM-DD). Default range is today + 14 days. The response contains date, startTime/endTime, priceDisplay, priceNumeric, spacesRemaining (or 'UNLIMITED'), hasOffer, offerType, originalPriceDisplay, offerPriceDisplay, plus the trip's duration string.",
      "    - For a SPECIFIC date the user has chosen (e.g. 'Friday', 'tomorrow', 'next Saturday'), call getTripTimeslots with the tripId and date (YYYY-MM-DD). The response contains exact startTime/endTime, spacesRemaining, priceDisplay, currency, specialOfferNote — these are real-time and never cached.",
      "    - Always resolve relative dates ('tomorrow', 'this Friday', 'next weekend') to YYYY-MM-DD using the DATE & TIME context above before calling these tools.",
      "    - Prefer getTripDatesAndDeals first when the user is still exploring; switch to getTripTimeslots once they've narrowed to one date.",
      "    - If the tool returns ok:false (e.g. TOURCMS_NOT_CONFIGURED, NO_PALISIS_LINK, TOURCMS_ERROR), tell the user availability data is temporarily unavailable and fall back to general guidance from the trip's stored fields (nextBookableDate, lastBookableDate, duration).",
      "    - When summarising results, mention the duration in user-friendly terms — trips vary: hour-based (e.g. '2 hours'), half-day, full-day, or multi-day (e.g. '3 nights'). Match the recommendation tone to the duration (a 2-hour walk fits into a packed day; a full-day tour does not).",
      "9c. DURATION AWARENESS: Each trip has a `duration` field that may be hour-based ('2 hours', '90 minutes'), session-based ('Half day', 'Full day'), or multi-day ('2 days', '3 nights'). When building itineraries or recommending combinations:",
      "    - Hour-based trips can be stacked within a day (respect the buffer between stops).",
      "    - Half-day trips cap the day at roughly one other short activity.",
      "    - Full-day or multi-day trips should NOT be combined with other activities the same day — spread them across days instead.",
      "    - Always factor duration into time-window suggestions and into the buildItinerary tool's `durationMinutes`.",
      "10. COUPON STRATEGY: Call offerCoupon ONCE per conversation to drive a booking. Deploy it strategically:",
      "   - After the user's 2nd or 3rd message when they show interest",
      "   - When recommending your top pick",
      "   - NEVER offer a coupon on the very first message. Build rapport first.",
      "11. TRANSIT: When the user asks about buses, trains, getting there, call showTransitPlanner. Luxembourg has free public transport.",
      "12. ITINERARY: When user has 3+ saved trips and asks for a plan/route/schedule/itinerary, call buildItinerary with optimized steps. Sequence by proximity, suggest realistic times starting at 09:00. The server overwrites travel times with real Mapbox driving/walking data — do NOT invent or recite minutes/distances in chat; the panel shows them.",
      "12a. AFTER buildItinerary — NEVER PRE-ANNOUNCE SUCCESS: the moment you call buildItinerary the client runs an availability + duration-vs-time-budget preflight on the real /api/itinerary endpoint. That preflight can come back with a CONFLICT (too many trips for the chosen duration, or unavailable on the date) AFTER your text has already been shown. So in the SAME turn as a buildItinerary tool call you MUST NOT claim the itinerary is 'ready', 'built', 'live', or 'on the Trip Canvas', and MUST NOT describe its stops, times, route, or window (no '09:30–22:30 from e-bike to dinner hopping'). Reply with ONE short neutral sentence such as \"Putting the day together — checking live availability now.\" or \"Building your day on the Trip Canvas — one moment.\". The inline card in chat will flip itself to either the full 'View Itinerary' state OR a 'Decision needed' state based on the preflight result, and any conflict question will be added to chat for you. Recap the schedule only AFTER the visitor confirms the plan or asks about a specific stop.",
      "12b. CANVAS AWARENESS: When the 'TRIP CANVAS — DAY ITINERARY IS OPEN' block above is present, the visitor is already looking at that exact plan. Treat it as ground truth — answer questions about order, timing, or contents from that block directly. If they ask to add/remove/swap a stop, acknowledge the change and call buildItinerary again with the updated sequence; the canvas will refresh automatically.",
      "13. GROUP TRIPS: When groupMembers exist, find experiences that satisfy overlapping interests. Note conflicts and suggest compromises. Mention each member by name when explaining why a trip fits.",
      "13a. PARTY SIZE: The PROFILE line above tells you exactly how many adults and children are in the party. ALWAYS factor this in when recommending trips and building itineraries — avoid adult-only venues if children are present, prefer family-friendly / stroller-accessible options when children > 0, and consider group capacity for friends groups of 6+.",
      "13b. UPDATING PREFERENCES MID-CHAT: When the user changes any preference in conversation (e.g. \"actually we're 2 adults and 3 kids\", \"make it just me\", \"switch to outdoor instead\", \"can we do half-day\", \"let's go tomorrow instead\", \"bump the budget up\"), IMMEDIATELY call the `updatePreferences` tool with ONLY the field(s) they changed. Then, in the same turn, re-run `searchTrips` (or rebuild the itinerary) with the new preferences and acknowledge the change in one short sentence (e.g. \"Updated to 2 adults + 3 kids — Trip Canvas now shows family-friendly picks\"). The new prefs persist for the rest of the conversation.",
      "14. DATE & TIME AWARENESS: The current Luxembourg date and time are provided above. Always factor them in:",
      "    - On a public holiday, naturally mention it and note that it is a great day for outings (some venues may have adjusted hours).",
      "    - If an upcoming holiday is within 7 days, proactively bring it up as a planning opportunity.",
      "    - Evening (after 18:00): focus on dinner experiences, evening tours, and nightlife.",
      "    - Morning (before 10:00): suggest early-opening attractions and morning walks.",
      "    - Weekend: recommend full-day itineraries and multi-stop adventures.",
      "    - Weekday: suggest compact 2-3 hour experiences that fit around schedules.",
      "15. VISIT DATE & TIME-OF-DAY FIT (CRITICAL — read carefully):",
      visitDateYMD
        ? `    - The user committed to visiting on ${visitDateYMD}. Treat this as the AUTHORITATIVE planning date. Pass it as startDate to getTripDatesAndDeals and as date to getTripTimeslots by default.`
        : "    - The user has not picked a visit date — ask them politely before checking live availability.",
      "    - BEFORE recommending trips, read each candidate's rich fields end-to-end: title, shortDescription, longDescription, experienceHighlights, itinerary, essentialInformation, restrictions, included/excluded, tripTags, tourType, duration. Infer time-of-day suitability from this content. Examples of signals to look for:",
      "        • NIGHT / EVENING trips: words like 'nightlife', 'pub', 'bar crawl', 'dinner', 'sunset', 'evening', 'after dark', 'illuminated', 'night tour', 'casino'.",
      "        • DAY trips: 'morning', 'breakfast', 'daylight', 'sightseeing', 'museum opening hours', most walking/biking/sightseeing tours.",
      "        • OUTDOOR vs INDOOR: weather sensitivity (see rule 8 for weather).",
      "        • AGE / GROUP restrictions: `restrictions`, `minBookingSize`/`maxBookingSize`, family-vs-adult-only.",
      "    - NEVER recommend a night-only experience for a daytime visit (or vice versa) without explicitly flagging it and offering to adjust the date/time. If the user picked a date but the trip's first available timeslot is at an incompatible time-of-day, surface that conflict and propose an alternative date.",
      "    - When the user requests an itinerary, FIRST search and shortlist by description fit + day-of-week + weather, THEN call getTripDatesAndDeals (and getTripTimeslots for finalists) using the visit date to ground the plan in real bookable slots, prices, and deals. Use the cheapest available deal when prices vary across the day.",
      "    - For multi-trip itineraries on the same visit date, ensure timeslots do not overlap and respect the planner-behavior buffer and day-window settings above.",
    ]
    
    // Append admin-configured custom system prompt if available.
    // Precedence: the new Trip-Chat-managed override (chat.extra.planner.systemPrompt)
    // wins over the legacy planner row. This is how the admin now controls
    // the planner conversation from inside the "Trip Chat" admin card after
    // the standalone "Trip Planner" card was retired.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatExtra: any = (settings.ai?.chat as any)?.extra ?? {}
    const chatPlannerPrompt: unknown = chatExtra?.planner?.systemPrompt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacyPlannerPrompt: unknown = (settings.ai?.planner as any)?.systemPrompt
    const adminPrompt = typeof chatPlannerPrompt === "string" && chatPlannerPrompt.trim()
      ? chatPlannerPrompt
      : (typeof legacyPlannerPrompt === "string" ? legacyPlannerPrompt : "")
    if (adminPrompt && adminPrompt.trim()) {
      systemPromptParts.push("", "CUSTOM INSTRUCTIONS FROM ADMIN:", adminPrompt)
    }
    
    const systemPrompt = systemPromptParts.join("\n")

    // ── Model resolution ──────────────────────────────────────────────────
    // The admin UI stores model strings like "openai/gpt-4o-mini" (Vercel AI
    // Gateway syntax). That only works when AI_GATEWAY_API_KEY is set in the
    // environment. To keep chat working out-of-the-box without a gateway key,
    // we fall back to Anthropic Claude via @ai-sdk/anthropic using the API key
    // stored in DB integrations.anthropic (same source the itinerary route
    // uses). Order of preference:
    //   1. AI_GATEWAY_API_KEY env → use the admin-configured gateway model
    //      string as-is (lets ops set up a real gateway later).
    //   2. Otherwise → use Anthropic with the DB key. If the admin's model
    //      string looks like an anthropic model ("claude-…" or
    //      "anthropic/…"), respect it; otherwise default to claude-3-5-haiku.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminModel: string | undefined =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plannerBehavior?.model || (settings.ai?.planner as any)?.model

    const gatewayKey = process.env.AI_GATEWAY_API_KEY
    let model: Parameters<typeof streamText>[0]["model"]
    if (gatewayKey) {
      model = adminModel || "openai/gpt-4o-mini"
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiKeys = (settings as any)?.apiKeys as Record<string, string> | undefined
      // Trim: a pasted key with stray whitespace/newline is sent verbatim and
      // Anthropic rejects it as "invalid x-api-key". Treat empty-after-trim as
      // missing so we fall back to the env key (matches lib/weather.ts).
      const anthropicKey =
        (apiKeys?.anthropic ?? "").trim() || (process.env.ANTHROPIC_API_KEY ?? "").trim()
      if (!anthropicKey) {
        // Stream a chat-shaped error so the client's useChat hook can
        // display it inline instead of failing silently on a raw 503.
        const msg = "AI is not configured. Open Admin → Integrations and save your Anthropic API key, or set AI_GATEWAY_API_KEY in environment variables."
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
      const anthropic = createAnthropic({ apiKey: anthropicKey })
      const modelId = adminModel?.startsWith("anthropic/")
        ? adminModel.slice("anthropic/".length)
        : adminModel?.startsWith("claude")
          ? adminModel
          : "claude-haiku-4-5-20251001"
      model = anthropic(modelId)
    }

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
