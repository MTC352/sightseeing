/**
 * lib/regiondo-mapper.ts
 *
 * Shared mapper: Regiondo product (+ variations + options) → our DB trip row
 * and the dedicated variation/option rows.
 *
 * Used by app/api/admin/regiondo-import/route.ts (bulk catalog import).
 *
 * ⚠️ ONE-WAY: Regiondo → our DB only. Nothing here is ever pushed back.
 * ⚠️ STATIC ONLY: dynamic availability (bookable dates, timeslots, per-option
 *    `qty_left`/live capacity) is NEVER persisted — it is fetched LIVE at view
 *    time. Only static product configuration is mapped here.
 */

import type {
  RegiondoProductSummary,
  RegiondoProductDetail,
  RegiondoVariationDetail,
  RegiondoOption,
} from "@/lib/regiondo"

// ── Helpers ────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  if (v === null || v === undefined) return ""
  return String(v).trim()
}

function asNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

function asIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}

function boolFromFlag(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null
  const s = String(v).trim().toLowerCase()
  if (s === "1" || s === "true" || s === "yes") return true
  if (s === "0" || s === "false" || s === "no") return false
  return null
}

function splitLanguages(v: unknown): string[] {
  const s = asString(v)
  if (!s) return []
  return s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface MappedRegiondoTrip {
  regiondoId: string
  source: "regiondo"
  title: string
  sku: string | null
  description: string | null
  shortDescription: string | null
  price: number
  originalPrice: number | null
  currencyCode: string | null
  duration: string | null
  category: string
  city: string
  country: string | null
  provider: string | null
  image: string | null
  gallery: string[]
  languages: string[]
  departureLocation: string | null
  departureGeocode: string | null
  permalink: string | null
  inStock: boolean | null
  isExpired: boolean | null
  status: string
  regiondoRaw: unknown
  lastSyncedAt: string
}

export interface MappedVariation {
  variationId: string
  name: string | null
  fromDate: string | null
  toDate: string | null
  appointmentType: string | null
  isDefault: boolean
  sortOrder: number
}

export interface MappedOption {
  variationId: string
  optionId: string
  name: string | null
  sortOrder: number
  minQtyToSell: number | null
  maxQtyToSell: number | null
  originalPrice: number | null
  regiondoPrice: number | null
  vatPercentageVal: string | null
  capacity: number | null
  bookingNoticePeriod: number | null
  description: string | null
}

// ── Mappers ────────────────────────────────────────────────────────────────

/**
 * Map a Regiondo product into our trip shape. The list summary is the
 * authoritative id source; the optional detail enriches description/images.
 */
export function mapProductToTrip(
  summary: RegiondoProductSummary,
  detail?: RegiondoProductDetail | null,
): MappedRegiondoTrip {
  const full = { ...summary, ...(detail ?? {}) } as RegiondoProductDetail

  const regiondoId = asString(summary.product_id) || asString(full.product_id)
  const title = asString(full.name) || regiondoId

  const price = asNumberOrNull(full.original_price ?? full.base_price) ?? 0
  const base = asNumberOrNull(full.base_price)
  const originalPrice =
    base != null && base !== price ? base : null

  const durationVal = asString(full.duration_values)
  const durationType = asString(full.duration_type)
  const duration = durationVal
    ? durationType
      ? `${durationVal} ${durationType}`
      : durationVal
    : null

  // Gallery: prefer the detail `images[]`, fall back to the single hero image.
  const gallery: string[] = []
  if (Array.isArray(full.images)) {
    for (const img of full.images) {
      const u = asString(img?.url)
      if (u) gallery.push(u)
    }
  }
  const image = asString(full.thumbnail) || asString(full.image) || (gallery[0] ?? null) || null

  const lat = asString(full.geo_lat)
  const lon = asString(full.geo_lon)
  const departureGeocode = lat && lon ? `${lat},${lon}` : null

  const permalink = asString(full.wl_regiondo_url) || asString(full.regiondo_url) || null

  return {
    regiondoId,
    source: "regiondo",
    title,
    sku: asString(full.sku) || null,
    description: asString(full.description) || asString(full.short_description) || null,
    shortDescription: asString(full.short_description) || null,
    price,
    originalPrice,
    currencyCode: asString(full.currency_code) || null,
    duration,
    category: "Tours",
    city: asString(full.city) || "Luxembourg",
    country: asString(full.country_id) || null,
    provider: asString(full.provider) || null,
    image,
    gallery,
    languages: splitLanguages(full.ticket_languages),
    departureLocation: asString(full.location_address) || asString(full.city) || null,
    departureGeocode,
    permalink,
    inStock: boolFromFlag(full.in_stock),
    isExpired: boolFromFlag(full.is_expired),
    status: "published",
    regiondoRaw: full,
    lastSyncedAt: new Date().toISOString(),
  }
}

/**
 * Map a Regiondo variation into a DB row. STATIC fields only — the embedded
 * `available_dates` (bookable dates / timeslots) is intentionally dropped; live
 * availability is fetched at view time and never persisted.
 */
export function mapVariation(
  v: RegiondoVariationDetail,
  index: number,
): MappedVariation | null {
  const variationId = asString(v.variation_id) || asString(v.id)
  if (!variationId) return null

  return {
    variationId,
    name: asString(v.name) || null,
    fromDate: asString(v.from) || null,
    toDate: asString(v.to) || null,
    appointmentType: asString(v.appointment_type) || null,
    isDefault: index === 0,
    sortOrder: index,
  }
}

/**
 * Map a Regiondo option (ticket type) into a DB row. STATIC fields only —
 * `qty_left` from the availoptions response is intentionally dropped.
 */
export function mapOption(
  variationId: string,
  optionKey: string,
  o: RegiondoOption,
  index: number,
): MappedOption | null {
  const optionId = asString(o.option_id) || asString(optionKey)
  if (!optionId) return null

  return {
    variationId,
    optionId,
    name: asString(o.name) || null,
    sortOrder: asIntOrNull(o.sort_order) ?? index,
    minQtyToSell: asIntOrNull(o.min_qty_to_sell),
    maxQtyToSell: asIntOrNull(o.max_qty_to_sell),
    originalPrice: asNumberOrNull(o.original_price),
    regiondoPrice: asNumberOrNull(o.regiondo_price),
    vatPercentageVal: asString(o.vat_percentage_val) || null,
    capacity: asIntOrNull(o.capacity),
    bookingNoticePeriod: asIntOrNull(o.booking_notice_period),
    description: asString(o.description) || null,
  }
}
