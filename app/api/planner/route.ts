import {
  convertToModelMessages,
  InferUITools,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
  validateUIMessages,
} from "ai"
import { z } from "zod"
import { trips as staticTrips, weatherData as staticWeatherData, type Trip } from "@/lib/data"
import { dbGetSettings, dbGetTrip, dbListTrips } from "@/lib/db/queries"
import { getTourCMSConfig, showTourDatesAndDeals, checkAvailability } from "@/lib/tourcms"

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

/** Load the unified trip catalog: DB first, fallback to static if DB is empty. */
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
    console.error("[planner] dbListTrips failed, falling back to static:", e)
  }
  // Fallback: static seed trips (no Palisis enrichment)
  return staticTrips.map((t) => ({ ...t }))
}

const searchTripsTool = tool({
  description:
    "Search and filter trips from the catalog. ALWAYS call this tool when the user asks for recommendations, wants to explore, or mentions interests. Returns matching trips with full Palisis-sourced details (itinerary, included/excluded, languages, booking constraints, cancellation policy) — use these fields when answering follow-up questions.",
  inputSchema: z.object({
    query: z.string().describe("Search query or interest keywords"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tags to filter: food, outdoor, indoor, culture, sport, night, family, popular, romantic"),
    maxResults: z.number().optional().describe("Max results, default 6"),
  }),
  execute: async ({ query, tags, maxResults }) => {
    const wx = _liveWeather.wx
    const limit = maxResults ?? 6
    const lower = query.toLowerCase()
    const catalog = await loadTripCatalog()
    let results: RichTrip[] = [...catalog]

    if (tags && tags.length > 0) {
      const tagged = results.filter((t) =>
        tags.some((tag) =>
          t.tags.includes(tag) || (t.tripTags ?? []).includes(tag),
        ),
      )
      if (tagged.length > 0) results = tagged
    }

    if (lower) {
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

    results.sort((a, b) => {
      let aS = 0, bS = 0
      const aTags = [...a.tags, ...(a.tripTags ?? [])]
      const bTags = [...b.tags, ...(b.tripTags ?? [])]
      if (wx === "rainy") { aS += aTags.includes("indoor") ? 5 : -2; bS += bTags.includes("indoor") ? 5 : -2 }
      else if (wx === "sunny") { aS += aTags.includes("outdoor") ? 5 : 0; bS += bTags.includes("outdoor") ? 5 : 0 }
      aS += a.rating >= 4.7 ? 2 : 0; bS += b.rating >= 4.7 ? 2 : 0
      return bS - aS
    })

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
  // 1) Try direct PK lookup (handles "tcms_22" and any other internal id)
  let tripRow = (await dbGetTrip(tripId).catch(() => null)) as Record<string, unknown> | null

  // 2) If not found and the input looks like a raw Palisis tour_id, look up by palisis_id
  if (!tripRow && /^\d+$/.test(tripId)) {
    try {
      const { query } = await import("@/lib/db")
      const rows = (await query(
        // Re-select the same shape as dbGetTrip for consistency.
        // We include palisis_id explicitly so both keys are always present.
        `SELECT id, palisis_id, title, duration FROM trips WHERE palisis_id = $1 LIMIT 1`,
        [tripId],
      )) as Array<Record<string, unknown>>
      if (rows && rows.length > 0) tripRow = rows[0]
    } catch { /* DB miss — fall through to heuristic */ }
  }

  // 3) Resolve the Palisis tour_id from the row (TRIP_SELECT exposes it as
  //    snake_case `palisis_id`; allow camelCase too for safety).
  let palisisId: string | null = null
  const fromRow =
    (tripRow?.palisis_id as string | undefined) ??
    (tripRow?.palisisId as string | undefined) ??
    null
  if (fromRow) palisisId = String(fromRow)
  else if (tripId.startsWith("tcms_")) palisisId = tripId.slice("tcms_".length)
  else if (/^\d+$/.test(tripId)) palisisId = tripId

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
    const start = startDate || todayYMD()
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
    "Fetch REAL-TIME BOOKABLE TIMESLOTS for ONE trip on a SPECIFIC date — exact start/end times, current spaces, and live pricing. Use when the user picks a date and asks 'what times are available on Friday', 'is there a morning slot', 'when does it start tomorrow', or before recommending a precise booking. Never cache the result. For wider date-range planning use getTripDatesAndDeals instead.",
  inputSchema: z.object({
    tripId: z.string().describe("Internal trip id (e.g. 'tcms_22') or Palisis tour_id (e.g. '22')"),
    date: z.string().describe("YYYY-MM-DD specific date to check"),
  }),
  execute: async ({ tripId, date }) => {
    const config = await getTourCMSConfig()
    if (!config) {
      return { ok: false, error: "TOURCMS_NOT_CONFIGURED", tripId, date, timeslots: [] }
    }
    const { palisisId, tripRow } = await resolvePalisisId(tripId)
    if (!palisisId) {
      return { ok: false, error: "NO_PALISIS_LINK", tripId, date, timeslots: [] }
    }
    const res = await checkAvailability(config, palisisId, { date, show_pickups: "0" })
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

const addToCartTool = tool({
  description: "Add a trip to the user's cart. Only call when user explicitly says add, book, or save.",
  inputSchema: z.object({
    tripId: z.string().describe("The trip ID to add"),
    tripTitle: z.string().describe("The trip title for confirmation"),
  }),
  // No execute -- this is a client-side tool
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
  addToCart: addToCartTool,
} as const

/* ── Exported type for client-side typed parts ── */
export type PlannerMessage = UIMessage<never, never, InferUITools<typeof tools>>

interface TravelerPreferences {
  group: string
  interests: string[]
  duration: string
  budget: string
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
  try {
    const body = await req.json()
    const { preferences, cartItems, groupMembers } = body as {
      preferences?: TravelerPreferences
      cartItems?: { id: string; title: string }[]
      groupMembers?: { name: string; interests: string[] }[]
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

    const profileLine = preferences
      ? "PROFILE: " + preferences.group + ", interests: [" + preferences.interests.join(", ") + "], time: " + preferences.duration + ", budget: " + preferences.budget
      : ""

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

    const systemPromptParts = [
      "You are the AI trip planner for sightseeing.lu. Warm, helpful, and conversational.",
      "",
      dateContext,
      "WEATHER: " + temp + "\u00b0C, " + condition + " (" + wx + ").",
      profileLine + cartSection + groupSection,
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
      "1. To recommend trips, ALWAYS call searchTrips tool. The results panel updates automatically -- you do NOT need to list or describe trips in your text.",
      "2. On the first message, also call showWeatherAlert to proactively inform the user about weather conditions:",
      "   - If rainy: alertType \"rainy\", suggest indoor/culture activities",
      "   - If sunny: alertType \"sunny\", encourage outdoor adventures",
      "   - If cloudy: alertType \"cloudy\", suggest a mix",
      "   Then call searchTrips with tags [" + defaultTags + "] and maxResults 8.",
      "3. After calling searchTrips, acknowledge the update briefly and guide the conversation toward booking.",
      "4. NEVER list trip names, prices, or descriptions in your text. The visual results panel handles that.",
      "5. No markdown formatting.",
      "6. Only call addToCart when user explicitly asks to add, book, or save a specific trip.",
      "7. For weather questions, call showWeather.",
      "8. For follow-up requests that ask for DIFFERENT options or NEW filtering (e.g. \"show me cheaper ones\", \"any outdoor instead\", \"what about tomorrow\"), call searchTrips again with adjusted query/tags. Do NOT re-search for factual questions about trips already shown — answer those from the rich fields in the previous tool output (see rule 9a).",
      "9. Be proactive: suggest categories, ask follow-up questions, help narrow down choices.",
      "9a. RICH TRIP KNOWLEDGE: searchTrips returns rich Palisis fields for each trip — tourType, tourLeader, grade, accommodationRating, languages, departureLocation, endLocation, country, shortDescription, longDescription, experienceHighlights, itinerary, essentialInformation, hotelPickupInstructions, voucherRedemptionInstructions, restrictions, extras, included, excluded, cancellationPolicy, minBookingSize, maxBookingSize, nonRefundable, nextBookableDate, lastBookableDate, tripTags. Use these to answer follow-up questions accurately (e.g. \"what's included\", \"what languages\", \"can I cancel\", \"is there hotel pickup\", \"any age restrictions\", \"how long\", \"where does it start\") WITHOUT re-searching. Reference these facts in plain conversational language; never dump raw field names.",
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
      "12. ITINERARY: When user has 3+ saved trips and asks for a plan/route/schedule/itinerary, call buildItinerary with optimized steps. Sequence by proximity, suggest realistic times starting at 09:00, include travel between stops (walking/bus/tram).",
      "13. GROUP TRIPS: When groupMembers exist, find experiences that satisfy overlapping interests. Note conflicts and suggest compromises. Mention each member by name when explaining why a trip fits.",
      "14. DATE & TIME AWARENESS: The current Luxembourg date and time are provided above. Always factor them in:",
      "    - On a public holiday, naturally mention it and note that it is a great day for outings (some venues may have adjusted hours).",
      "    - If an upcoming holiday is within 7 days, proactively bring it up as a planning opportunity.",
      "    - Evening (after 18:00): focus on dinner experiences, evening tours, and nightlife.",
      "    - Morning (before 10:00): suggest early-opening attractions and morning walks.",
      "    - Weekend: recommend full-day itineraries and multi-stop adventures.",
      "    - Weekday: suggest compact 2-3 hour experiences that fit around schedules.",
    ]
    
    // Append admin-configured custom system prompt if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminPrompt = (settings.ai?.planner as any)?.systemPrompt
    if (adminPrompt && adminPrompt.trim()) {
      systemPromptParts.push("", "CUSTOM INSTRUCTIONS FROM ADMIN:", adminPrompt)
    }
    
    const systemPrompt = systemPromptParts.join("\n")

    const result = streamText({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: plannerBehavior?.model || (settings.ai?.planner as any)?.model || "openai/gpt-4o-mini",
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(5),
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("[planner] POST error:", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
