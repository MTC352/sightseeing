/**
 * lib/regiondo.ts
 *
 * Custom Regiondo Platform API client for sightseeing.lu (branded "DMO").
 *
 * Auth:      HMAC-SHA256 signed headers — node:crypto (zero deps)
 * Transport: native fetch (Node 18+)
 * Parsing:   native JSON (Regiondo is a REST/JSON API, unlike TourCMS XML)
 *
 * ⚠️ ONE-WAY: Regiondo API → our DB only. This client only ever READS the
 * Regiondo catalog (products, variations, options). It NEVER pushes trip data,
 * prices, descriptions or edits back to Regiondo. The booking/checkout write
 * endpoints documented in the API guide are intentionally NOT implemented here.
 *
 * Credentials (DB integrations table first — the admin panel is the source of
 * truth — then env vars as a local/dev fallback):
 *   integrations.regiondoPublicKey  / env REGIONDO_PUBLIC_KEY   — X-API-ID
 *   integrations.regiondoSecretKey  / env REGIONDO_SECRET_KEY   — HMAC secret
 *
 * Docs: docs/regiondo-api.md
 */

import { createHmac } from "node:crypto"
import { dbGetSettings } from "@/lib/db/queries"
import { logError } from "@/lib/error-log"

// ── Constants ────────────────────────────────────────────────────────────────
const BASE_URL = "https://api.regiondo.com/v1"
const REQUEST_TIMEOUT_MS = 15_000
const STORE_LOCALE = "en-US"

// ── Resilience ───────────────────────────────────────────────────────────────
// Regiondo can return a transient 429/5xx or time out. We retry IDEMPOTENT GET
// requests with exponential backoff + jitter. This client only issues GETs
// (read-only import), so every request is safe to retry.
const GET_ATTEMPTS = 3
const RETRY_BASE_MS = 400
const RETRY_MAX_DELAY_MS = 2_500
const RETRY_AFTER_CAP_MS = 5_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
function backoffDelay(attempt: number): number {
  const expo = RETRY_BASE_MS * 2 ** attempt
  const jitter = Math.floor(Math.random() * 150)
  return Math.min(expo + jitter, RETRY_MAX_DELAY_MS)
}
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null
  const secs = parseInt(header, 10)
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, RETRY_AFTER_CAP_MS)
  return null
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface RegiondoConfig {
  publicKey: string
  secretKey: string
}

export interface RegiondoError {
  ok: false
  error: string
  httpStatus?: number
}

/** Embedded variation reference from the product list endpoint. */
export interface RegiondoVariationRef {
  variation_id?: string | number
  options?: Array<{ option_id?: string | number }>
}

/** Lean product summary — from GET /products */
export interface RegiondoProductSummary {
  product_id: string | number
  name?: string
  sku?: string
  short_description?: string
  geo_lat?: string
  geo_lon?: string
  location_address?: string
  city?: string
  zipcode?: string
  country_id?: string
  thumbnail?: string
  image?: string
  image_label?: string
  url_key?: string
  url_path?: string
  provider?: string
  rating_summary?: string
  reviews_count?: string
  ticket_languages?: string
  original_price?: string
  base_price?: string
  appointment_types?: string
  duration_type?: string
  duration_values?: string
  in_stock?: string
  is_expired?: string
  regiondo_url?: string
  wl_regiondo_url?: string
  currency_code?: string
  variations?: RegiondoVariationRef[]
  [key: string]: unknown
}

/** Full product detail — from GET /products/{id} (under .data) */
export interface RegiondoProductDetail extends RegiondoProductSummary {
  description?: string
  images?: Array<{ url?: string; label?: string }>
  variations?: RegiondoVariationDetail[]
}

/** Variation — from GET /products/variations/{id} OR embedded in detail. */
export interface RegiondoVariationDetail {
  id?: string | number
  variation_id?: string | number
  name?: string
  from?: string
  to?: string
  appointment_type?: string
  /** date → array of time-slot arrays. Present only on the detail endpoint. */
  available_dates?: Record<string, unknown>
  options?: Array<{ option_id?: string | number }>
}

/** Option (ticket type) — from GET /products/availoptions/{variationId} */
export interface RegiondoOption {
  option_id?: string | number
  name?: string
  sort_order?: number | string
  min_qty_to_sell?: number | string
  max_qty_to_sell?: number | string
  original_price?: string
  regiondo_price?: string
  vat_percentage_val?: string
  capacity?: number | string
  booking_notice_period?: number | string
  description?: string
  /** DYNAMIC — never stored. */
  qty_left?: number | string
}

type ApiResult<T> = { ok: true; data: T } | RegiondoError

// ── Credentials ──────────────────────────────────────────────────────────────
let _cachedConfig: RegiondoConfig | null = null
let _cacheExpiry = 0

/**
 * Load Regiondo credentials from the DB integrations table first (the admin
 * panel is the source of truth), then fall back to env vars for local/dev.
 * Cached in-process for 5 minutes. Returns null if no credentials are set.
 */
export async function getRegiondoConfig(): Promise<RegiondoConfig | null> {
  if (_cachedConfig && Date.now() < _cacheExpiry) return _cachedConfig

  try {
    const settings = await dbGetSettings()
    const keys = (settings?.apiKeys as Record<string, string>) ?? {}
    const pub = (keys.regiondoPublicKey ?? "").trim()
    const sec = (keys.regiondoSecretKey ?? "").trim()
    if (pub && sec) {
      _cachedConfig = { publicKey: pub, secretKey: sec }
      _cacheExpiry = Date.now() + 5 * 60 * 1000
      return _cachedConfig
    }
  } catch {
    /* DB unavailable — fall through to env */
  }

  const envPub = (process.env.REGIONDO_PUBLIC_KEY ?? "").trim()
  const envSec = (process.env.REGIONDO_SECRET_KEY ?? "").trim()
  if (envPub && envSec) {
    _cachedConfig = { publicKey: envPub, secretKey: envSec }
    _cacheExpiry = Date.now() + 5 * 60 * 1000
    return _cachedConfig
  }

  return null
}

/** Force-clear the in-process credential cache (call after saving creds in DB). */
export function clearRegiondoConfigCache(): void {
  _cachedConfig = null
  _cacheExpiry = 0
}

// ── Signing ──────────────────────────────────────────────────────────────────
/**
 * Build the 3 required auth headers for a request.
 *
 *   stringToSign = `${timestamp_ms}${publicKey}${queryString}`
 *   X-API-HASH   = HMAC-SHA256(stringToSign, secretKey) → lowercase hex
 *
 * `queryString` is the raw query WITHOUT the leading `?` (empty string if none)
 * and MUST exactly match what is sent on the URL.
 */
function buildHeaders(config: RegiondoConfig, queryString: string): Record<string, string> {
  const timestamp = Date.now()
  const stringToSign = `${timestamp}${config.publicKey}${queryString}`
  const hash = createHmac("sha256", config.secretKey).update(stringToSign).digest("hex")
  return {
    "X-API-ID": config.publicKey,
    "X-API-TIME": String(timestamp),
    "X-API-HASH": hash,
    "Accept-Language": STORE_LOCALE,
    Accept: "application/json",
  }
}

/** Build a query string (no leading ?) from an ordered params object. */
function toQueryString(params?: Record<string, string | number | undefined>): string {
  if (!params) return ""
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue
    parts.push(`${k}=${encodeURIComponent(String(v))}`)
  }
  return parts.join("&")
}

// ── Core request ─────────────────────────────────────────────────────────────
/**
 * Signed GET request with retries. Re-signs on every attempt (timestamp must be
 * fresh). Returns parsed JSON or a typed error. All outbound calls are logged to
 * the error log under source 'regiondo' on failure.
 */
async function regiondoGet<T = unknown>(
  config: RegiondoConfig,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<ApiResult<T>> {
  const queryString = toQueryString(params)
  const url = queryString ? `${BASE_URL}${path}?${queryString}` : `${BASE_URL}${path}`

  let lastError = "request failed"
  let lastStatus: number | undefined

  for (let attempt = 0; attempt < GET_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      // Re-sign each attempt — the timestamp must stay within the server window.
      const headers = buildHeaders(config, queryString)
      const res = await fetch(url, { method: "GET", headers, signal: controller.signal })
      clearTimeout(timer)

      if (res.ok) {
        const json = (await res.json()) as T
        return { ok: true, data: json }
      }

      lastStatus = res.status
      const bodyText = await res.text().catch(() => "")
      lastError = `HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`

      // Retry only transient failures.
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = parseRetryAfterMs(res.headers.get("retry-after"))
        if (attempt < GET_ATTEMPTS - 1) {
          await sleep(retryAfter ?? backoffDelay(attempt))
          continue
        }
      }
      break
    } catch (err) {
      clearTimeout(timer)
      lastError = err instanceof Error ? err.message : String(err)
      if (attempt < GET_ATTEMPTS - 1) {
        await sleep(backoffDelay(attempt))
        continue
      }
    }
  }

  void logError({
    source: "regiondo",
    message: `GET ${path} failed: ${lastError}`,
    statusCode: lastStatus ?? null,
    context: { path, queryString },
  })
  return { ok: false, error: lastError, httpStatus: lastStatus }
}

/**
 * Unwrap a Regiondo `{ status, data }` envelope. Some endpoints (list products,
 * availoptions) return the payload directly; others wrap it. This handles both.
 */
function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === "object" && "data" in (raw as Record<string, unknown>)) {
    return (raw as { data: T }).data
  }
  return raw as T
}

// ── Public helpers (import endpoints only) ────────────────────────────────────

/** GET /products — full catalog list. Each item embeds variation refs. */
async function listProducts(
  config: RegiondoConfig,
  params?: { limit?: number },
): Promise<ApiResult<RegiondoProductSummary[]>> {
  const res = await regiondoGet(config, "/products", {
    limit: params?.limit ?? 250,
    store_locale: STORE_LOCALE,
  })
  if (!res.ok) return res
  const data = unwrap<RegiondoProductSummary[]>(res.data)
  return { ok: true, data: Array.isArray(data) ? data : [] }
}

/** GET /products/{id} — full product detail (description, images, variations). */
async function getProduct(
  config: RegiondoConfig,
  productId: string | number,
): Promise<ApiResult<RegiondoProductDetail>> {
  const res = await regiondoGet(config, `/products/${encodeURIComponent(String(productId))}`, {
    store_locale: STORE_LOCALE,
  })
  if (!res.ok) return res
  return { ok: true, data: unwrap<RegiondoProductDetail>(res.data) }
}

/** GET /products/variations/{id} — full variation metadata. No query params. */
async function getVariations(
  config: RegiondoConfig,
  productId: string | number,
): Promise<ApiResult<RegiondoVariationDetail[]>> {
  const res = await regiondoGet(config, `/products/variations/${encodeURIComponent(String(productId))}`)
  if (!res.ok) return res
  const data = unwrap<RegiondoVariationDetail[]>(res.data)
  return { ok: true, data: Array.isArray(data) ? data : [] }
}

/**
 * GET /products/availoptions/{variationId}?date=today — ticket types (options).
 *
 * We only read the STATIC option metadata (name, prices, capacity, etc.) here.
 * The `qty_left` field in this response is DYNAMIC and is intentionally dropped
 * by the mapper — it must be fetched LIVE at booking time, never stored.
 */
async function getAvailOptions(
  config: RegiondoConfig,
  variationId: string | number,
  date: string,
): Promise<ApiResult<Record<string, RegiondoOption>>> {
  const res = await regiondoGet(config, `/products/availoptions/${encodeURIComponent(String(variationId))}`, {
    date,
  })
  if (!res.ok) return res
  const data = unwrap<Record<string, RegiondoOption>>(res.data)
  return { ok: true, data: data && typeof data === "object" ? data : {} }
}

/** Credential test — a cheap signed call that proves the keys are accepted. */
async function ping(config: RegiondoConfig): Promise<{ ok: boolean; error?: string; count?: number }> {
  const res = await regiondoGet(config, "/products", { limit: 1, store_locale: STORE_LOCALE })
  if (!res.ok) return { ok: false, error: res.error }
  const data = unwrap<RegiondoProductSummary[]>(res.data)
  return { ok: true, count: Array.isArray(data) ? data.length : 0 }
}

// ── Client factory ────────────────────────────────────────────────────────────
/**
 * Returns a bound Regiondo client, or null when no credentials are configured.
 * Mirrors getTourCMSClient(). All methods are READ-ONLY (one-way import).
 */
export async function getRegiondoClient() {
  const config = await getRegiondoConfig()
  if (!config) return null

  return {
    ping: () => ping(config),
    listProducts: (params?: { limit?: number }) => listProducts(config, params),
    getProduct: (productId: string | number) => getProduct(config, productId),
    getVariations: (productId: string | number) => getVariations(config, productId),
    getAvailOptions: (variationId: string | number, date: string) =>
      getAvailOptions(config, variationId, date),
  }
}

/** Test arbitrary credentials (used by the Integrations "Test connection" check). */
export async function pingRegiondo(config: RegiondoConfig) {
  return ping(config)
}
