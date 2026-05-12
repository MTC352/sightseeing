/**
 * lib/tourcms.ts
 *
 * Custom TourCMS/Palisis API client for sightseeing.lu
 *
 * Auth:      HMAC-SHA256 signed headers — node:crypto (zero deps)
 * Transport: native fetch (Node 18+)
 * Parsing:   fast-xml-parser (lightweight, typed)
 *
 * Our role: Marketplace Agent (not Tour Operator)
 *   - /p/ endpoints use channelId=0 in both header and signature
 *   - /c/ endpoints use the operator's channel ID
 *   - We NEVER modify tours, departures, bookings or any data on TourCMS
 *     except creating new bookings (startNewBooking + commitNewBooking)
 *
 * Credentials (env vars first, then DB integrations table):
 *   TOURCMS_CHANNEL_ID      — numeric channel ID (TourCMS → API Settings)
 *   TOURCMS_MARKETPLACE_ID  — our Marketplace Agent ID (from TourCMS welcome email)
 *   TOURCMS_API_KEY         — private API key (TourCMS → Configuration → API)
 *
 * Docs: https://www.tourcms.com/support/api/mp/
 */

import { createHmac } from "node:crypto"
import { XMLParser } from "fast-xml-parser"
import { dbGetSettings } from "@/lib/db/queries"

// ── Constants ──────────────────────────────────────────────────────────────────
const BASE_URL = "https://api.tourcms.com"
const REQUEST_TIMEOUT_MS = 12_000

// ── XML Parser ─────────────────────────────────────────────────────────────────
// isArray ensures single-item arrays aren't collapsed to plain objects
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) =>
    [
      "tour", "date", "departure", "rate", "image", "language",
      "special_offer", "component", "pickup", "option", "q",
      "customer", "payment", "booking",
    ].includes(name),
})

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TourCMSConfig {
  channelId: number
  marketplaceId: number
  apiKey: string
}

export interface TourCMSError {
  ok: false
  error: string
  httpStatus?: number
}

/** Lean tour summary — from listTours (/p/tours/list.xml) */
export interface TourSummary {
  tour_id: string
  channel_id: string
  tour_name: string
  tour_name_long: string
  from_price: string
  from_price_display: string
  sale_currency?: string
  has_sale?: string
  descriptions_last_updated?: string
  thumbnail_image?: string
  image?: string
  duration?: string
  duration_desc?: string
  location?: string
  summary?: string
  tour_url?: string
  book_url?: string
  product_type?: string
  /** Also present in search results */
  url?: string
  image_url?: string
  description?: string
  location_summary?: string
  duration_description?: string
  tagline?: string
  supplier_name?: string
  distance?: string
}

/** Full tour detail — from showTour (/c/tour/show.xml) */
export interface TourDetail extends TourSummary {
  shortdesc?: string
  longdesc?: string
  itinerary?: string
  start_time?: string
  end_time?: string
  geocode_start_point?: { geocode?: string; label?: string }
  tour_code?: string
  sale_currency?: string
  country?: string
  /** Images array */
  images?: { image: Array<{ url?: string; url_thumbnail?: string; url_large?: string; url_xlarge?: string; image_desc?: string; "@_thumbnail"?: string }> }
  /** Rate info for building booking form */
  new_booking?: {
    people_selection?: {
      rate?: Array<{
        rate_id: string
        label_1?: string
        label_2?: string
        minimum?: string
        maximum?: string
        agecat?: string
        from_price?: string
        from_price_display?: string
      }>
    }
  }
}

/** A date entry from showTourDatesAndDeals */
export interface DepartureDate {
  start_date: string
  end_date: string
  start_time?: string
  end_time?: string
  price_1: string
  price_1_display: string
  spaces_remaining?: string  // can be "UNLIMITED" — do not parseInt
  status?: string
  special_offer_type?: string
  has_offer?: string
  original_price_1?: string
  original_price_1_display?: string
  offer_price_1?: string
  offer_price_1_display?: string
}

/** A real-time availability component from checkAvailability */
export interface AvailabilityComponent {
  /** Pass this to startNewBooking — expires after component_key_valid_for seconds */
  component_key: string
  start_date: string
  end_date?: string
  start_time?: string
  end_time?: string
  /** Sort by this for timezone safety, not start_time */
  start_time_utcseconds?: string
  date_code?: string
  date_id?: string
  sale_currency?: string
  /** Can be the string "UNLIMITED" — do not parseInt */
  spaces_remaining?: string
  spaces_remaining_by_rate?: unknown
  total_price?: string
  total_price_display?: string
  net_price?: string
  note?: string
  guide_language?: unknown
  special_offer_note?: string
  questions?: { q?: Array<{ question_key?: string; question?: string; answer_type?: string; answer_mandatory?: string }> }
  pickup_points?: { pickup?: Array<{ pickup_key?: string; time?: string; pickup_name?: string; geocode?: string }> }
}

/** Rate line within a raw departure (operator use only) */
export interface DepartureRate {
  rate_id: string
  rate_name: string
  agecat?: string
  customer_price: string
  customer_price_display: string
  supplier_cost?: string
}

/**
 * A raw departure — Tour Operator Only.
 * Returned by searchRawDepartures.
 * As a Marketplace Agent we may receive FAIL_TOUROPONLY for this endpoint.
 */
export interface RawDeparture {
  departure_id: string
  code?: string
  start_date: string
  end_date?: string
  note?: string
  supplier_note?: string
  spaces_remaining?: string
  min_booking_size?: string
  status?: string
  auto_status?: string
  manually_closed?: string
  rates?: { rate: DepartureRate[] }
}

export interface ChannelInfo {
  channel_id: string
  channel_name: string
  home_url?: string
  logo_url?: string
  country?: string
  sale_currency?: string
  connection_permission?: string
  booking_style?: string
}

export interface RateLimitStatus {
  ok: boolean
  remaining_hits: number
  remaining_hits_post: number
  error?: string
}

export interface StartedBooking {
  booking_id: string
  hold_time_seconds?: string
  sales_revenue_due_now?: string
  sales_revenue_due_now_display?: string
  sales_price_due_ever?: string
  sale_currency?: string
  available_component_count?: string
  unavailable_component_count?: string
  commission?: string
  commission_display?: string
}

export interface CommittedBooking {
  booking_id: string
  booking_uuid?: string
  status?: string
  status_text?: string
  voucher_url?: string
  barcode_data?: string
}

// ── Credential Loader ──────────────────────────────────────────────────────────
let _cachedConfig: TourCMSConfig | null = null
let _cacheExpiry = 0

/**
 * Load TourCMS credentials from env vars first, then DB integrations table.
 * Credentials are cached in-process for 5 minutes.
 * Returns null if no credentials are configured.
 */
export async function getTourCMSConfig(): Promise<TourCMSConfig | null> {
  if (_cachedConfig && Date.now() < _cacheExpiry) return _cachedConfig

  const envKey     = process.env.TOURCMS_API_KEY ?? ""
  const envChannel = process.env.TOURCMS_CHANNEL_ID ? parseInt(process.env.TOURCMS_CHANNEL_ID, 10) : NaN
  const envMarket  = process.env.TOURCMS_MARKETPLACE_ID ? parseInt(process.env.TOURCMS_MARKETPLACE_ID, 10) : 0

  if (envKey && !isNaN(envChannel)) {
    _cachedConfig = { channelId: envChannel, marketplaceId: envMarket || 0, apiKey: envKey }
    _cacheExpiry  = Date.now() + 5 * 60 * 1000
    return _cachedConfig
  }

  try {
    const settings  = await dbGetSettings()
    const keys       = (settings?.apiKeys as Record<string, string>) ?? {}
    const dbKey      = keys.palisis ?? ""
    const dbChannel  = keys.palisisChannelId ? parseInt(keys.palisisChannelId, 10) : NaN
    const dbMarket   = keys.palisisMarketplaceId ? parseInt(keys.palisisMarketplaceId, 10) : 0

    if (dbKey && !isNaN(dbChannel)) {
      _cachedConfig = { channelId: dbChannel, marketplaceId: dbMarket || 0, apiKey: dbKey }
      _cacheExpiry  = Date.now() + 5 * 60 * 1000
      return _cachedConfig
    }
  } catch { /* DB unavailable — credentials not configured */ }

  return null
}

/** Force-clear the in-process credential cache (call after saving credentials in DB) */
export function clearTourCMSConfigCache(): void {
  _cachedConfig = null
  _cacheExpiry  = 0
}

// ── Signature Generation ───────────────────────────────────────────────────────
/**
 * Build the HMAC-SHA256 signature for the TourCMS Authorization header.
 *
 * String-to-sign format (TourCMS spec):
 *   {channelId}/{marketplaceId}/{VERB}/{unixTimestamp}/{path+qs}
 *
 * IMPORTANT: path must have NO leading slash in the string to sign.
 *   Correct:   "3930/0/GET/1769160491/c/tour/show.xml?id=1"
 *   Wrong:     "3930/0/GET/1769160491//c/tour/show.xml?id=1"  ← double slash!
 *
 * The resulting base64 must be URL-encoded before placing in the header.
 */
function generateSignature(
  channelId: number,
  marketplaceId: number,
  apiKey: string,
  verb: "GET" | "POST",
  path: string,
  timestamp: number,
): string {
  // Strip leading slash — the string-to-sign format has no leading slash on path
  const pathForSign  = path.startsWith("/") ? path.slice(1) : path
  const stringToSign = `${channelId}/${marketplaceId}/${verb}/${timestamp}/${pathForSign}`
  const raw          = createHmac("sha256", apiKey).update(stringToSign).digest("base64")
  return encodeURIComponent(raw)
}

// ── Core Request ───────────────────────────────────────────────────────────────
/**
 * Make an authenticated request to the TourCMS API.
 *
 * @param overrideChannelId — Use a different channel ID for the Auth header+signature
 *   without changing config.channelId. Required for /p/ endpoints (pass 0) and
 *   for booking calls against a specific operator channel (pass that channel's ID).
 */
async function apiRequest<T = Record<string, unknown>>(
  config: TourCMSConfig,
  verb: "GET" | "POST",
  path: string,
  body?: string,
  overrideChannelId?: number,
): Promise<T | TourCMSError> {
  const { marketplaceId, apiKey } = config
  const channelId = overrideChannelId ?? config.channelId
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = generateSignature(channelId, marketplaceId, apiKey, verb, path, timestamp)

  const headers: Record<string, string> = {
    "x-tourcms-date": String(timestamp),
    "Authorization":  `TourCMS ${channelId}:${marketplaceId}:${signature}`,
    "Content-type":   "application/xml",
  }

  let res: Response
  let xmlText: string

  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: verb,
      headers,
      body:   verb === "POST" ? body : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    xmlText = await res.text()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" }
  }

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}`, httpStatus: res.status }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = xmlParser.parse(xmlText) as Record<string, unknown>
  } catch {
    return { ok: false, error: "XML parse error" }
  }

  const root     = (parsed.response ?? parsed) as Record<string, unknown>
  const apiError = String(root.error ?? "").trim()
  if (apiError && apiError !== "OK") {
    return { ok: false, error: apiError }
  }

  return root as T
}

function isError(v: unknown): v is TourCMSError {
  return typeof v === "object" && v !== null && (v as TourCMSError).ok === false
}

// ── API Methods ────────────────────────────────────────────────────────────────

// ── Housekeeping ───────────────────────────────────────────────────────────────

/**
 * Rate Limit Status / Connectivity Test
 * Endpoint: GET /api/rate_limit_status.xml
 * Does NOT count against rate limits. Use for credential verification.
 */
export async function pingTourCMS(config: TourCMSConfig): Promise<RateLimitStatus> {
  // Rate limit endpoint uses channelId=0 per TourCMS docs
  const res = await apiRequest<Record<string, unknown>>(config, "GET", "/api/rate_limit_status.xml", undefined, 0)
  if (isError(res)) return { ok: false, remaining_hits: 0, remaining_hits_post: 0, error: res.error }
  return {
    ok: true,
    remaining_hits:      Number(res.remaining_hits ?? 0),
    remaining_hits_post: Number(res.remaining_hits_post ?? 0),
  }
}

// ── Channels ───────────────────────────────────────────────────────────────────

/**
 * Show Channel
 * Endpoint: GET /c/channel/show.xml
 * Verify credentials and read channel branding.
 * Cache: 120 minutes.
 */
export async function showChannel(
  config: TourCMSConfig,
): Promise<{ ok: boolean; channel?: ChannelInfo; error?: string }> {
  const res = await apiRequest<Record<string, unknown>>(config, "GET", "/c/channel/show.xml")
  if (isError(res)) return { ok: false, error: res.error }
  return { ok: true, channel: res.channel as ChannelInfo }
}

// ── Tours ──────────────────────────────────────────────────────────────────────

/**
 * List Tours — THE CORRECT IMPORT ENDPOINT
 * Endpoint: GET /p/tours/list.xml  (channelId=0 — cross-channel Marketplace Agent)
 *
 * Returns a lean list of ALL tours available to us across all connected channels.
 * Use this for import, NOT searchTours.
 *
 * Key differences from searchTours:
 *   - Returns ALL tours including has_sale=0 (no future dates)
 *   - Includes descriptions_last_updated for incremental sync
 *   - Includes channel_id per tour (needed for Show Tour calls)
 *   - Not filtered by customer-facing availability
 *
 * Cache: 30 minutes (but use descriptions_last_updated per tour for incremental sync)
 *
 * Key params:
 *   booking_style — "booking" to only include tours that accept confirmed bookings
 *   per_page      — max 200 (default 75)
 */
export async function listTours(
  config: TourCMSConfig,
  params: Record<string, string | number> = {},
): Promise<{ ok: boolean; tours: TourSummary[]; total_tour_count: number; error?: string }> {
  const qs   = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
  const path = `/p/tours/list.xml${qs ? "?" + qs : ""}`

  // /p/ endpoint — must use channelId=0 in both header and signature
  const res = await apiRequest<Record<string, unknown>>(config, "GET", path, undefined, 0)
  if (isError(res)) return { ok: false, tours: [], total_tour_count: 0, error: res.error }

  const rawTours = (res.tours as Record<string, unknown>)?.tour
  const tours: TourSummary[] = Array.isArray(rawTours)
    ? rawTours as TourSummary[]
    : rawTours ? [rawTours as TourSummary] : []

  return {
    ok: true,
    tours,
    total_tour_count: Number(res.total_tour_count ?? tours.length),
  }
}

/**
 * Search Tours  (customer-facing search — NOT for catalog import)
 * Endpoint: GET /c/tours/search.xml
 *
 * Only returns currently-saleable tours (has_sale=1 by default).
 * Use for keyword search on the public site.
 * Use listTours() for catalog import instead.
 *
 * Cache: 30 minutes.
 */
export async function searchTours(
  config: TourCMSConfig,
  params: Record<string, string | number> = {},
): Promise<{ ok: boolean; tours: TourSummary[]; total_tour_count: number; error?: string }> {
  const qs   = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
  const path = `/c/tours/search.xml${qs ? "?" + qs : ""}`

  const res = await apiRequest<Record<string, unknown>>(config, "GET", path)
  if (isError(res)) return { ok: false, tours: [], total_tour_count: 0, error: res.error }

  const rawTours = (res.tours as Record<string, unknown>)?.tour
  const tours: TourSummary[] = Array.isArray(rawTours)
    ? rawTours as TourSummary[]
    : rawTours ? [rawTours as TourSummary] : []

  return {
    ok: true,
    tours,
    total_tour_count: Number(res.total_tour_count ?? tours.length),
  }
}

/**
 * Show Tour — Full Detail
 * Endpoint: GET /c/tour/show.xml?id={tourId}
 *
 * Returns full tour data including images, rates, geocode, descriptions.
 * Call this per-tour after listTours to get data for DB storage.
 * Also call before building booking forms (to get rate_id values).
 *
 * Cache: 60 minutes.
 * Use descriptions_last_updated from listTours to skip unchanged tours.
 *
 * Key params:
 *   show_options   — "1" to include bookable add-ons
 *   show_questions — "1" to include booking questions (needed for booking form)
 *   show_offers    — "1" to include special offer summary
 *
 * @param channelIdOverride — pass the tour's channel_id if different from config.channelId
 */
export async function showTour(
  config: TourCMSConfig,
  tourId: string | number,
  params: Record<string, string | number> = {},
  channelIdOverride?: number,
): Promise<{ ok: boolean; tour?: TourDetail; error?: string }> {
  const qs   = new URLSearchParams({
    id: String(tourId),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  }).toString()
  const path = `/c/tour/show.xml?${qs}`

  const res = await apiRequest<Record<string, unknown>>(config, "GET", path, undefined, channelIdOverride)
  if (isError(res)) return { ok: false, error: res.error }
  return { ok: true, tour: res.tour as TourDetail }
}

// ── Availability ───────────────────────────────────────────────────────────────

/**
 * Show Tour Dates & Deals  (calendar — which dates are bookable)
 * Endpoint: GET /c/tour/datesprices/datesndeals/search.xml?id={tourId}
 *
 * Use to populate a date-picker calendar BEFORE the customer selects a date.
 * One call per month view is sufficient.
 * Cache: 30 minutes.
 *
 * Key params:
 *   startdate_start / startdate_end  — YYYY-MM-DD date range (supply both or neither)
 *   distinct_start_dates             — "1" for calendar (one entry per date)
 *   has_offer                        — "1"/"2"/"3"/"4" for specific offer types
 *
 * Note: spaces_remaining can be "UNLIMITED" — string-check, do not parseInt blindly.
 *
 * @param channelIdOverride — pass the tour's channel_id if different from config.channelId
 */
export async function showTourDatesAndDeals(
  config: TourCMSConfig,
  tourId: string | number,
  params: Record<string, string | number> = {},
  channelIdOverride?: number,
): Promise<{ ok: boolean; dates: DepartureDate[]; total_date_count: number; error?: string }> {
  const qs   = new URLSearchParams({
    id: String(tourId),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  }).toString()
  const path = `/c/tour/datesprices/datesndeals/search.xml?${qs}`

  const res = await apiRequest<Record<string, unknown>>(config, "GET", path, undefined, channelIdOverride)
  if (isError(res)) return { ok: false, dates: [], total_date_count: 0, error: res.error }

  const raw = (res.dates_and_prices as Record<string, unknown>)?.date
  const dates: DepartureDate[] = Array.isArray(raw)
    ? raw as DepartureDate[]
    : raw ? [raw as DepartureDate] : []

  return {
    ok: true,
    dates,
    total_date_count: Number(res.total_date_count ?? dates.length),
  }
}

/**
 * Check Tour Availability — Real-Time Timeslots
 * Endpoint: GET /c/tour/datesprices/checkavail.xml?id={tourId}&date={YYYY-MM-DD}
 *
 * Returns available timeslots for a specific date + quantity selection.
 * Each component has a component_key needed for startNewBooking.
 * component_key expires after component_key_valid_for seconds (default 1800 = 30 min).
 *
 * NEVER CACHE — must be called in real-time for each customer request.
 *
 * Key params:
 *   date          — YYYY-MM-DD the customer selected (default: today)
 *   r{rate_id}    — e.g. r1=2 means 2 adults (rate IDs from showTour new_booking.people_selection)
 *   show_pickups  — "0" to suppress pickup list
 *   start_time    — HH:MM to filter to a specific timeslot
 *
 * Rendering rules:
 *   - One <component> = one timeslot button in the UI
 *   - Sort by start_time_utcseconds, not start_time (timezone-safe)
 *   - spaces_remaining can be "UNLIMITED" — do not parseInt blindly
 *   - If start_time on the tour is "MULTI", this is the only place to get actual times
 *
 * @param channelIdOverride — pass the tour's channel_id if different from config.channelId
 */
export async function checkAvailability(
  config: TourCMSConfig,
  tourId: string | number,
  params: Record<string, string | number> = {},
  channelIdOverride?: number,
): Promise<{
  ok: boolean
  components: AvailabilityComponent[]
  component_key_valid_for?: number
  error?: string
}> {
  const qs   = new URLSearchParams({
    id: String(tourId),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  }).toString()
  const path = `/c/tour/datesprices/checkavail.xml?${qs}`

  const res = await apiRequest<Record<string, unknown>>(config, "GET", path, undefined, channelIdOverride)
  if (isError(res)) return { ok: false, components: [], error: res.error }

  const raw = (res.available_components as Record<string, unknown>)?.component
  const components: AvailabilityComponent[] = Array.isArray(raw)
    ? raw as AvailabilityComponent[]
    : raw ? [raw as AvailabilityComponent] : []

  return {
    ok: true,
    components,
    component_key_valid_for: res.component_key_valid_for ? Number(res.component_key_valid_for) : undefined,
  }
}

/**
 * Search Raw Departures — TOUR OPERATOR ONLY
 * Endpoint: GET /c/tour/datesprices/dep/manage/search.xml?id={tourId}
 *
 * WARNING: As a Marketplace Agent this may return FAIL_TOUROPONLY.
 * Do NOT use this for customer-facing availability. Use checkAvailability instead.
 * Kept here for reference only.
 */
export async function searchRawDepartures(
  config: TourCMSConfig,
  tourId: string | number,
  params: Record<string, string | number> = {},
): Promise<{ ok: boolean; departures: RawDeparture[]; error?: string }> {
  const qs   = new URLSearchParams({
    id: String(tourId),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  }).toString()
  const path = `/c/tour/datesprices/dep/manage/search.xml?${qs}`

  const res = await apiRequest<Record<string, unknown>>(config, "GET", path)
  if (isError(res)) return { ok: false, departures: [], error: res.error }

  const raw = ((res.tour as Record<string, unknown>)?.dates_and_prices as Record<string, unknown>)?.departure
  const departures: RawDeparture[] = Array.isArray(raw)
    ? raw as RawDeparture[]
    : raw ? [raw as RawDeparture] : []

  return { ok: true, departures }
}

// ── Bookings ───────────────────────────────────────────────────────────────────

/**
 * Start New Booking — Step 1 of 2
 * Endpoint: POST /c/booking/new/start.xml
 *
 * Creates a temporary booking that holds stock for hold_time_seconds (default 2700s / 45 min).
 * Check available_component_count and unavailable_component_count on the response.
 * Returns booking_id needed for commitNewBooking.
 *
 * NEVER CACHE. This is the only write endpoint in the integration.
 *
 * @param channelId — the operator's channel_id for this tour (from showTour / listTours)
 * @param bookingXml — full XML booking body per TourCMS spec. Minimum:
 *   <booking>
 *     <total_customers>2</total_customers>
 *     <components>
 *       <component>
 *         <component_key>FROM_CHECK_AVAIL</component_key>
 *       </component>
 *     </components>
 *     <customers>
 *       <customer>
 *         <firstname>Jane</firstname>
 *         <surname>Smith</surname>
 *         <email>jane@example.com</email>
 *       </customer>
 *     </customers>
 *   </booking>
 */
export async function startNewBooking(
  config: TourCMSConfig,
  channelId: number,
  bookingXml: string,
): Promise<{ ok: boolean; booking?: StartedBooking; error?: string }> {
  const path = "/c/booking/new/start.xml"
  const res  = await apiRequest<Record<string, unknown>>(config, "POST", path, bookingXml, channelId)
  if (isError(res)) return { ok: false, error: res.error }

  const booking = res.booking as StartedBooking
  if (!booking?.booking_id) return { ok: false, error: "No booking_id in response" }
  return { ok: true, booking }
}

/**
 * Commit New Booking — Step 2 of 2
 * Endpoint: POST /c/booking/new/commit.xml
 *
 * Converts the temporary booking to a live confirmed booking.
 * Call after payment is confirmed (or immediately if agent-payable).
 * Returns voucher_url and final booking status.
 *
 * NEVER CACHE.
 *
 * @param channelId — must match the channel used in startNewBooking
 * @param bookingId — from startNewBooking response
 * @param agentRef  — optional internal reference (e.g. our order ID)
 */
export async function commitNewBooking(
  config: TourCMSConfig,
  channelId: number,
  bookingId: string | number,
  agentRef?: string,
): Promise<{ ok: boolean; booking?: CommittedBooking; error?: string }> {
  const agentRefXml = agentRef ? `<agent_ref>${agentRef}</agent_ref>` : ""
  const body        = `<?xml version="1.0"?><booking><booking_id>${bookingId}</booking_id>${agentRefXml}</booking>`
  const path        = "/c/booking/new/commit.xml"

  const res = await apiRequest<Record<string, unknown>>(config, "POST", path, body, channelId)
  if (isError(res)) return { ok: false, error: res.error }

  const booking = res.booking as CommittedBooking
  return { ok: true, booking }
}

/**
 * Show Booking
 * Endpoint: GET /c/booking/show.xml?booking_id={id}
 * Use on confirmation pages and for booking status checks.
 * NEVER CACHE.
 *
 * @param channelId — the operator's channel_id for this booking
 */
export async function showBooking(
  config: TourCMSConfig,
  channelId: number,
  bookingId: string | number,
): Promise<{ ok: boolean; booking?: Record<string, unknown>; error?: string }> {
  const path = `/c/booking/show.xml?booking_id=${encodeURIComponent(String(bookingId))}`
  const res  = await apiRequest<Record<string, unknown>>(config, "GET", path, undefined, channelId)
  if (isError(res)) return { ok: false, error: res.error }
  return { ok: true, booking: res.booking as Record<string, unknown> }
}

// ── Convenience Client Factory ─────────────────────────────────────────────────

/**
 * Get a fully-configured TourCMS client bound to the loaded credentials.
 * Returns null if no credentials are configured (check and return 503).
 *
 * Usage:
 *   const tourcms = await getTourCMSClient()
 *   if (!tourcms) return { error: "TourCMS not configured" }
 *   const { tours } = await tourcms.listTours()
 */
export async function getTourCMSClient() {
  const config = await getTourCMSConfig()
  if (!config) return null

  return {
    /** Credential test — does not count against rate limit */
    ping: () => pingTourCMS(config),

    /** Channel branding + verification */
    showChannel: () => showChannel(config),

    /**
     * Catalog import — correct endpoint for importing all tours into DB.
     * Uses /p/tours/list.xml (channelId=0).
     */
    listTours: (params?: Record<string, string | number>) =>
      listTours(config, params),

    /**
     * Customer-facing search — NOT for catalog import.
     * Uses /c/tours/search.xml.
     */
    searchTours: (params?: Record<string, string | number>) =>
      searchTours(config, params),

    /** Full tour detail — call per-tour during import and before booking form */
    showTour: (id: string | number, params?: Record<string, string | number>, channelId?: number) =>
      showTour(config, id, params, channelId),

    /** Date-picker calendar — which dates have availability (cache 30 min) */
    showDatesAndDeals: (id: string | number, params?: Record<string, string | number>, channelId?: number) =>
      showTourDatesAndDeals(config, id, params, channelId),

    /**
     * Real-time timeslots for a selected date — NEVER CACHE.
     * Returns component_key needed for startNewBooking.
     */
    checkAvailability: (id: string | number, params?: Record<string, string | number>, channelId?: number) =>
      checkAvailability(config, id, params, channelId),

    /**
     * Tour Operator Only — may return FAIL_TOUROPONLY for Marketplace Agents.
     * Use checkAvailability for real-time slots instead.
     */
    searchRawDepartures: (id: string | number, params?: Record<string, string | number>) =>
      searchRawDepartures(config, id, params),

    /** Step 1 of booking — creates temporary booking, returns booking_id */
    startNewBooking: (channelId: number, xml: string) =>
      startNewBooking(config, channelId, xml),

    /** Step 2 of booking — commits temporary booking to live booking */
    commitNewBooking: (channelId: number, bookingId: string | number, agentRef?: string) =>
      commitNewBooking(config, channelId, bookingId, agentRef),

    /** Booking detail — use on confirmation page */
    showBooking: (channelId: number, id: string | number) =>
      showBooking(config, channelId, id),

    /** The raw config — use when you need to call top-level functions directly */
    config,
  }
}
