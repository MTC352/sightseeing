/**
 * lib/tourcms.ts
 *
 * Custom TourCMS/Palisis API client for sightseeing.lu
 *
 * Auth:      HMAC-SHA256 signed headers — node:crypto (zero deps)
 * Transport: native fetch (Node 18+)
 * Parsing:   fast-xml-parser (lightweight, typed)
 *
 * Credentials (env vars, falling back to DB integrations table):
 *   TOURCMS_CHANNEL_ID      — numeric channel ID (found in TourCMS → API Settings)
 *   TOURCMS_MARKETPLACE_ID  — 0 for Tour Operators (leave blank/0 unless you're a Marketplace Agent)
 *   TOURCMS_API_KEY         — private API key (found in TourCMS → Configuration & Setup → API)
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
// isArray ensures single-item arrays aren't collapsed to objects
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) =>
    ["tour", "date", "departure", "rate", "image", "language", "special_offer"].includes(name),
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

/** Basic tour summary — returned by searchTours (listing pages) */
export interface TourSummary {
  tour_id: string
  channel_id: string
  tour_name: string
  tour_name_long: string
  from_price: string
  from_price_display: string
  url?: string
  image_url?: string
  description?: string
  location_summary?: string
  duration_description?: string
  tagline?: string
  supplier_name?: string
  distance?: string
}

/** Full tour detail — returned by showTour */
export interface TourDetail extends TourSummary {
  short_description?: string
  description_text?: string
  start_time?: string
  end_time?: string
  lat?: string
  long?: string
  tour_code?: string
  booking_type?: string
  sale_currency?: string
  country?: string
  location?: string
}

/** A single date/deal entry — returned by showTourDatesAndDeals */
export interface DepartureDate {
  start_date: string
  end_date: string
  start_time?: string
  end_time?: string
  price_1: string
  price_1_display: string
  spaces_remaining?: string
  status?: string
  special_offer_type?: string
  has_offer?: string
  original_price_1?: string
  original_price_1_display?: string
  offer_price_1?: string
  offer_price_1_display?: string
}

/** Rate line within a departure (adult, child, infant etc.) */
export interface DepartureRate {
  rate_id: string
  rate_name: string
  agecat?: string
  customer_price: string
  customer_price_display: string
  supplier_cost?: string
}

/** A raw departure — returned by searchRawDepartures (operator use) */
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

/** Result shape for showChannel */
export interface ChannelInfo {
  channel_id: string
  channel_name: string
  home_url?: string
  logo_url?: string
  country?: string
}

/** Result shape for pingTourCMS */
export interface RateLimitStatus {
  ok: boolean
  remaining_hits: number
  remaining_hits_post: number
  error?: string
}

// ── Credential Loader ──────────────────────────────────────────────────────────
// Cache config for 5 min so we don't hit DB on every API call
let _cachedConfig: TourCMSConfig | null = null
let _cacheExpiry = 0

/**
 * Load TourCMS credentials from env vars first, then DB integrations table.
 * Returns null if no credentials are configured.
 */
export async function getTourCMSConfig(): Promise<TourCMSConfig | null> {
  if (_cachedConfig && Date.now() < _cacheExpiry) return _cachedConfig

  // 1. Try environment variables (fastest path, no DB round-trip)
  const envKey     = process.env.TOURCMS_API_KEY ?? ""
  const envChannel = process.env.TOURCMS_CHANNEL_ID ? parseInt(process.env.TOURCMS_CHANNEL_ID, 10) : NaN
  const envMarket  = process.env.TOURCMS_MARKETPLACE_ID ? parseInt(process.env.TOURCMS_MARKETPLACE_ID, 10) : 0

  if (envKey && !isNaN(envChannel)) {
    _cachedConfig = { channelId: envChannel, marketplaceId: envMarket || 0, apiKey: envKey }
    _cacheExpiry  = Date.now() + 5 * 60 * 1000
    return _cachedConfig
  }

  // 2. Fall back to DB integrations table (key: 'palisis' for API key,
  //    'palisisChannelId' for channel ID, 'palisisMarketplaceId' for marketplace)
  try {
    const settings = await dbGetSettings()
    const dbKey     = (settings?.apiKeys as Record<string, string>)?.palisis ?? ""
    const dbChannel = (settings?.apiKeys as Record<string, string>)?.palisisChannelId
      ? parseInt((settings.apiKeys as Record<string, string>).palisisChannelId, 10)
      : NaN
    const dbMarket  = (settings?.apiKeys as Record<string, string>)?.palisisMarketplaceId
      ? parseInt((settings.apiKeys as Record<string, string>).palisisMarketplaceId, 10)
      : 0

    if (dbKey && !isNaN(dbChannel)) {
      _cachedConfig = { channelId: dbChannel, marketplaceId: dbMarket || 0, apiKey: dbKey }
      _cacheExpiry  = Date.now() + 5 * 60 * 1000
      return _cachedConfig
    }
  } catch { /* DB unavailable — credentials not configured */ }

  return null
}

/** Force-clear the cached config (call after updating credentials in DB) */
export function clearTourCMSConfigCache(): void {
  _cachedConfig = null
  _cacheExpiry  = 0
}

// ── Signature Generation ───────────────────────────────────────────────────────
/**
 * Build and sign the TourCMS HMAC-SHA256 signature.
 *
 * String to sign format:
 *   {channelId}/{marketplaceId}/{VERB}/{unixTimestamp}/{path+querystring}
 *
 * Result is base64 encoded then URL encoded (per TourCMS spec).
 * Ref: https://www.tourcms.com/support/api/mp/connection.php
 */
function generateSignature(
  channelId: number,
  marketplaceId: number,
  apiKey: string,
  verb: "GET" | "POST",
  path: string,
  timestamp: number,
): string {
  // path must be just the path+qs portion, e.g. "/c/tour/show.xml?id=1"
  const stringToSign = `${channelId}/${marketplaceId}/${verb}/${timestamp}/${path}`
  const raw = createHmac("sha256", apiKey).update(stringToSign).digest("base64")
  return encodeURIComponent(raw)
}

// ── Core Request ───────────────────────────────────────────────────────────────
/**
 * Make an authenticated request to the TourCMS API.
 * All responses are XML — parsed to a plain JS object.
 * Returns TourCMSError on any failure (network, HTTP error, API error).
 */
async function apiRequest<T = Record<string, unknown>>(
  config: TourCMSConfig,
  verb: "GET" | "POST",
  path: string,    // e.g. "/c/tour/show.xml?id=123"
  body?: string,   // XML body for POST requests
): Promise<T | TourCMSError> {
  const { channelId, marketplaceId, apiKey } = config
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = generateSignature(channelId, marketplaceId, apiKey, verb, path, timestamp)

  const headers: Record<string, string> = {
    "x-tourcms-date": String(timestamp),
    "Authorization": `TourCMS ${channelId}:${marketplaceId}:${signature}`,
    "Content-type": "application/xml",
  }

  let res: Response
  let xmlText: string

  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: verb,
      headers,
      body: verb === "POST" ? body : undefined,
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

  const root = (parsed.response ?? parsed) as Record<string, unknown>
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

/**
 * Ping / Rate Limit Status
 * Endpoint: GET /api/rate_limit_status.xml
 * Does NOT count against rate limits. Use for connectivity test.
 * Cache: do not cache.
 */
export async function pingTourCMS(config: TourCMSConfig): Promise<RateLimitStatus> {
  const res = await apiRequest<Record<string, unknown>>(config, "GET", "/api/rate_limit_status.xml")
  if (isError(res)) return { ok: false, remaining_hits: 0, remaining_hits_post: 0, error: res.error }
  return {
    ok: true,
    remaining_hits: Number(res.remaining_hits ?? 0),
    remaining_hits_post: Number(res.remaining_hits_post ?? 0),
  }
}

/**
 * Show Channel
 * Endpoint: GET /c/channel/show.xml
 * Returns operator/company information for the configured channel.
 * Cache: 120 minutes.
 */
export async function showChannel(
  config: TourCMSConfig,
): Promise<{ ok: boolean; channel?: ChannelInfo; error?: string }> {
  const res = await apiRequest<Record<string, unknown>>(config, "GET", "/c/channel/show.xml")
  if (isError(res)) return { ok: false, error: res.error }
  return { ok: true, channel: res.channel as ChannelInfo }
}

/**
 * Search Tours
 * Endpoint: GET /c/tours/search.xml  (operator)  or  /p/tours/search.xml  (marketplace agent)
 * Returns a list of tours with basic information — intended for listing pages.
 * Cache: 30 minutes.
 *
 * Common params:
 *   k             — keyword search
 *   start_date    — check availability on date (YYYY-MM-DD)
 *   has_sale      — "all" to include tours without future dates
 *   has_offer     — "1" for special offers only
 *   has_sale_month — "1,2" for Jan OR Feb availability
 *   404_tour_url  — "all" to skip URL validation (recommended for API-driven sites)
 *   per_page      — max 200 (default 75)
 *   page          — page number
 */
export async function searchTours(
  config: TourCMSConfig,
  params: Record<string, string | number> = {},
): Promise<{ ok: boolean; tours: TourSummary[]; total_tour_count: number; error?: string }> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()
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
 * Show Tour
 * Endpoint: GET /c/tour/show.xml?id={tourId}
 * Returns full detail for a single tour — use after the customer selects a tour.
 * Cache: 60 minutes.
 *
 * Optional params:
 *   show_options   — "1" to include bookable options/add-ons
 *   show_offers    — "1" to include special offer summary
 *   show_questions — "1" to include booking questions
 */
export async function showTour(
  config: TourCMSConfig,
  tourId: string | number,
  params: Record<string, string | number> = {},
): Promise<{ ok: boolean; tour?: TourDetail; error?: string }> {
  const qs = new URLSearchParams({
    id: String(tourId),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  }).toString()
  const path = `/c/tour/show.xml?${qs}`

  const res = await apiRequest<Record<string, unknown>>(config, "GET", path)
  if (isError(res)) return { ok: false, error: res.error }
  return { ok: true, tour: res.tour as TourDetail }
}

/**
 * Show Tour Dates & Deals  (customer-facing availability)
 * Endpoint: GET /c/tour/datesprices/datesndeals/search.xml?id={tourId}
 * Returns dates with prices, spaces remaining, and any special offers.
 * Cache: 30 minutes.
 *
 * Key params:
 *   startdate_start / startdate_end  — date range filter (YYYY-MM-DD)
 *   start_time                       — filter to a specific departure time (HH:MM)
 *   has_offer                        — 1/2/3/4 for specific offer types
 *   distinct_start_dates             — "1" for calendar view (one entry per date)
 *   order                            — "start_date" (default) or "offer_date"
 */
export async function showTourDatesAndDeals(
  config: TourCMSConfig,
  tourId: string | number,
  params: Record<string, string | number> = {},
): Promise<{ ok: boolean; dates: DepartureDate[]; total_date_count: number; error?: string }> {
  const qs = new URLSearchParams({
    id: String(tourId),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  }).toString()
  const path = `/c/tour/datesprices/datesndeals/search.xml?${qs}`

  const res = await apiRequest<Record<string, unknown>>(config, "GET", path)
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
 * Search Raw Departures  (operator use — detailed departure data)
 * Endpoint: GET /c/tour/datesprices/dep/manage/search.xml?id={tourId}
 * Returns departure_id (needed for booking), spaces_remaining, rates per pax type.
 * This is the raw data without markup/currency conversion.
 * Cache: do not cache (or max 5 min for rate-limit relief).
 *
 * Key params:
 *   start_date_start / start_date_end — date range (YYYY-MM-DD)
 *   per_page                          — max 10000 (default 10000)
 */
export async function searchRawDepartures(
  config: TourCMSConfig,
  tourId: string | number,
  params: Record<string, string | number> = {},
): Promise<{ ok: boolean; departures: RawDeparture[]; error?: string }> {
  const qs = new URLSearchParams({
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

/**
 * Show Booking
 * Endpoint: GET /c/booking/show.xml?booking_id={id}
 * Cache: do not cache.
 */
export async function showBooking(
  config: TourCMSConfig,
  bookingId: string | number,
): Promise<{ ok: boolean; booking?: Record<string, unknown>; error?: string }> {
  const path = `/c/booking/show.xml?booking_id=${encodeURIComponent(String(bookingId))}`
  const res = await apiRequest<Record<string, unknown>>(config, "GET", path)
  if (isError(res)) return { ok: false, error: res.error }
  return { ok: true, booking: res.booking as Record<string, unknown> }
}

/**
 * Create Booking
 * Endpoint: POST /c/booking/new/v1.xml
 * Do NOT cache. This is the only write endpoint in the integration.
 *
 * @param bookingXml — Full XML booking body per TourCMS spec.
 *   Minimum required fields:
 *     <booking>
 *       <tour_id>123</tour_id>
 *       <departure_id>456</departure_id>   <!-- from searchRawDepartures -->
 *       <components>
 *         <component>
 *           <tour_id>123</tour_id>
 *           <departure_id>456</departure_id>
 *           <rates>
 *             <rate><rate_id>1</rate_id><quantity>2</quantity></rate>
 *           </rates>
 *         </component>
 *       </components>
 *       <customer>
 *         <firstname>Jane</firstname>
 *         <surname>Smith</surname>
 *         <email>jane@example.com</email>
 *       </customer>
 *     </booking>
 *
 * Returns booking_id on success which is the TourCMS booking reference.
 */
export async function createBooking(
  config: TourCMSConfig,
  bookingXml: string,
): Promise<{ ok: boolean; booking_id?: string; error?: string }> {
  const path = "/c/booking/new/v1.xml"
  const res = await apiRequest<Record<string, unknown>>(config, "POST", path, bookingXml)
  if (isError(res)) return { ok: false, error: res.error }

  const booking = res.booking as Record<string, unknown>
  return { ok: true, booking_id: String(booking?.booking_id ?? "") }
}

// ── Convenience Client Factory ─────────────────────────────────────────────────
/**
 * Get a fully configured TourCMS client.
 * Returns null if no credentials are configured.
 *
 * Usage:
 *   const tourcms = await getTourCMSClient()
 *   if (!tourcms) return { error: "TourCMS not configured" }
 *   const { tours } = await tourcms.searchTours({ has_sale: "all" })
 */
export async function getTourCMSClient() {
  const config = await getTourCMSConfig()
  if (!config) return null

  return {
    ping:                 ()                                                     => pingTourCMS(config),
    showChannel:          ()                                                     => showChannel(config),
    searchTours:          (params?: Record<string, string | number>)             => searchTours(config, params),
    showTour:             (id: string | number, params?: Record<string, string | number>) => showTour(config, id, params),
    showDatesAndDeals:    (id: string | number, params?: Record<string, string | number>) => showTourDatesAndDeals(config, id, params),
    searchRawDepartures:  (id: string | number, params?: Record<string, string | number>) => searchRawDepartures(config, id, params),
    showBooking:          (id: string | number)                                  => showBooking(config, id),
    createBooking:        (xml: string)                                          => createBooking(config, xml),
  }
}
