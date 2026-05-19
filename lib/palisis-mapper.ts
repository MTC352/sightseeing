/**
 * lib/palisis-mapper.ts
 *
 * Shared mapper: TourCMS/Palisis `showTour` (TourDetail) → our DB trip row.
 *
 * Used by BOTH:
 *   - lib/palisis-sync.ts            (single-trip sync — manual + webhook)
 *   - app/api/admin/palisis-import/* (bulk catalog import)
 *
 * ⚠️ ONE-WAY: Palisis → our DB only. Nothing in this file is ever pushed back.
 *
 * Lookup tables come from the TourCMS API spec
 * (https://www.tourcms.com/support/api/mp/show_tour.php).
 */

import type { TourDetail, TourSummary } from "@/lib/tourcms"

// ── TourCMS lookup tables ─────────────────────────────────────────────────────

/**
 * product_type code → label. MUST match the verbatim Palisis "Tour type"
 * radio list (mirrored in TOUR_TYPE_OPTIONS in trip-edit-form.tsx) so the
 * edit-form `<select>` can match the stored value.
 */
const PRODUCT_TYPE_LABELS: Record<number, string> = {
  1: "Accommodation (hotel/campsite/villa/ski chalet/lodge)",
  2: "Transport/Transfer",
  3: "Tour/cruise - Including overnight stay",
  4: "Day tour/trip/activity/attraction - No overnight stay",
  5: "Tailor made",
  6: "Event",
  7: "Training/education",
  8: "Restaurant/meal alternative",
  9: "Other",
}

/** tourleader_type code → label */
const TOUR_LEADER_LABELS: Record<number, string> = {
  1: "Guided (tour guide / driver)",
  2: "Independent / Self-drive",
  3: "Not applicable",
}

/** grade code → label */
const GRADE_LABELS: Record<number, string> = {
  1: "All ages / Not applicable",
  2: "Moderate",
  3: "Fit",
  4: "Challenging",
  5: "Extreme",
}

/** accomrating code → label */
const ACCOM_RATING_LABELS: Record<number, string> = {
  1: "No accommodation / Not applicable",
  2: "Various levels",
  3: "Luxury",
  4: "Moderate",
  5: "Comfortable",
  6: "Basic",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Defense-in-depth HTML entity decoder.
 *
 * fast-xml-parser already handles XML+HTML entities in well-formed payloads,
 * but TourCMS occasionally double-encodes user-entered text (e.g. the source
 * value is literally `l&amp;apos;Etat`, which decodes once to `l&apos;Etat`
 * and would then ship straight to our DB). Running a second pass here is
 * cheap and catches that case without breaking already-clean strings.
 *
 * Only handles the entities we've actually seen in production payloads.
 */
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#039;": "'",
  "&nbsp;": " ",
  "&eacute;": "é",
  "&egrave;": "è",
  "&ecirc;": "ê",
  "&euml;": "ë",
  "&agrave;": "à",
  "&acirc;": "â",
  "&ccedil;": "ç",
  "&ocirc;": "ô",
  "&ucirc;": "û",
  "&iuml;": "ï",
}

function decodeHtmlEntities(s: string): string {
  if (!s || s.indexOf("&") === -1) return s
  let out = s.replace(/&[a-zA-Z]+;|&#0?\d{2,4};/g, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m)
  // Numeric character references (decimal + hex) not covered by the map.
  out = out.replace(/&#(\d+);/g, (_, d) => {
    const code = parseInt(d, 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : _
  })
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    const code = parseInt(h, 16)
    return Number.isFinite(code) ? String.fromCodePoint(code) : _
  })
  return out
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return decodeHtmlEntities(v)
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return ""
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}

function asDate(v: unknown): string | null {
  const s = asString(v).trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/**
 * Split a multi-line/comma-separated TourCMS text block into an array of
 * non-empty trimmed lines. Used for `inc` / `ex` / `exp`.
 *   - Splits on newlines first
 *   - Falls back to comma split for inline lists
 *   - Strips bullet markers • – -  *
 */
function splitTourCMSList(raw: unknown): string[] {
  const s = asString(raw).trim()
  if (!s) return []
  // Prefer newline split; if the text has no newlines but multiple commas, split on commas.
  const parts = s.includes("\n") ? s.split(/\r?\n/) : s.split(/,\s*(?=[A-Z])/)
  return parts
    .map(p => p.replace(/^[\s•\-\*–]+/, "").trim())
    .filter(Boolean)
}

/**
 * Extract selected trip tags. TourCMS `tour_tags.tag[]` always returns the
 * full vocabulary — each entry has `value` 0 or 1. We keep only the selected
 * tokens (value=1).
 */
function extractTripTags(detail: TourDetail): string[] {
  const raw = (detail as { tour_tags?: { tag?: unknown } }).tour_tags?.tag
  const tags = Array.isArray(raw) ? raw : raw ? [raw] : []
  return tags
    .filter((t: unknown) => {
      const v = (t as { value?: unknown }).value
      return v === 1 || v === "1" || v === true
    })
    .map((t: unknown) => asString((t as { token?: unknown }).token))
    .filter(Boolean)
}

/** Extract languages_spoken (comma-separated string OR array) → string[] */
function extractLanguages(detail: TourDetail): string[] {
  const raw = (detail as { languages_spoken?: unknown }).languages_spoken
  if (Array.isArray(raw)) {
    return raw.map(asString).map(s => s.trim()).filter(Boolean)
  }
  const s = asString(raw).trim()
  if (!s) return []
  return s.split(/[,;|]/).map(x => x.trim()).filter(Boolean)
}

/** Extract gallery URLs (xlarge > large > url > thumbnail). */
function extractGallery(detail: TourDetail | TourSummary): string[] {
  const raw = (detail as TourDetail).images?.image
  const imgs = Array.isArray(raw) ? raw : raw ? [raw] : []
  return imgs
    .map(i =>
      asString(
        (i as { url_xlarge?: unknown }).url_xlarge ??
          (i as { url_large?: unknown }).url_large ??
          (i as { url?: unknown }).url ??
          (i as { url_thumbnail?: unknown }).url_thumbnail,
      ),
    )
    .filter(Boolean)
}

// ── Mapper output shape ───────────────────────────────────────────────────────

/**
 * The keys here match `fieldMap` in `dbCreateTrip` / `dbUpdateTrip`.
 * Anything new must also be added to the fieldMap + INSERT list.
 */
export interface MappedTrip {
  palisisId: string
  title: string
  description: string
  price: number
  duration: string
  category: string
  tags: string[]
  city: string
  provider: string
  image: string
  gallery: string[]
  highlights: string[]
  badge: string | null
  rating: number
  reviewCount: number
  featured: boolean
  featuredDeparture: boolean
  status: "published" | "draft"
  permalink: string | null
  originalPrice: number | null

  // ── New rich fields ────────────────────────────────────────────────────────
  tourType: string | null
  tourTypeCode: number | null
  tourLeader: string | null
  grade: string | null
  accommodationRating: string | null
  tripTags: string[]
  languages: string[]
  departureLocation: string | null
  departureGeocode: string | null
  endLocation: string | null
  endGeocode: string | null
  country: string | null
  commercialPriority: string | null
  shortDescription: string | null
  longDescription: string | null
  experienceHighlights: string | null
  included: string[]
  excluded: string[]
  essentialInformation: string | null
  hotelPickupInstructions: string | null
  voucherRedemptionInstructions: string | null
  restrictions: string | null
  extras: string | null
  itinerary: string | null
  receiptInformation: string | null
  pdfUrl: string | null
  videoUrl: string | null
  cancellationPolicy: string | null
  minBookingSize: number | null
  maxBookingSize: number | null
  nonRefundable: boolean
  nextBookableDate: string | null
  lastBookableDate: string | null

  // ── Provenance ─────────────────────────────────────────────────────────────
  /** Full raw showTour response (JSONB). Stored so nothing is ever lost. */
  palisisRaw: unknown
  syncSource: "palisis"
  lastSyncedAt: string
}

// ── Main mapper ───────────────────────────────────────────────────────────────

/**
 * Map a TourCMS tour (lean OR detailed) to our DB shape.
 * Lean tours (from listTours) lack rich fields — those come out null/empty.
 */
export function mapTourDetailToTrip(t: TourDetail | TourSummary): MappedTrip {
  const full = t as TourDetail
  const lean = t as TourSummary

  const tourId = asString(t.tour_id)
  const title = asString(t.tour_name_long || t.tour_name)

  // Description: prefer shortdesc → summary → lean description/tagline
  const description = asString(
    full.shortdesc || full.summary || lean.description || lean.tagline,
  )

  const price = parseFloat(asString(t.from_price)) || 0
  const duration = asString(full.duration_desc || t.duration || lean.duration_description)
  const city = asString(t.location || lean.location_summary) || "Luxembourg"
  const supplier = asString(lean.supplier_name) || "Sightseeing.lu"

  const galleryUrls = extractGallery(full)
  const image = galleryUrls[0] || asString(lean.image_url || full.thumbnail_image)
  const gallery = galleryUrls.length > 0
    ? galleryUrls
    : (full.thumbnail_image ? [asString(full.thumbnail_image)] : [])

  // Highlights derive from `exp` (Experience / Highlights field in Palisis admin)
  const highlights = splitTourCMSList((full as { exp?: unknown }).exp)

  // Trip Tags (formerly "tour_tags" — friendly label)
  const tripTags = extractTripTags(full)

  // Tour Type
  const tourTypeCode = asNumber((full as { product_type?: unknown }).product_type)
  const tourType = tourTypeCode != null ? PRODUCT_TYPE_LABELS[tourTypeCode] ?? null : null

  // Tour Leader / Grade / Accommodation Rating
  const leaderCode = asNumber((full as { tourleader_type?: unknown }).tourleader_type)
  const gradeCode = asNumber((full as { grade?: unknown }).grade)
  const accomCode = asNumber((full as { accomrating?: unknown }).accomrating)

  // Departure / End locations (friendly labels)
  const startPoint = (full as { geocode_start_point?: { label?: unknown; geocode?: unknown } })
    .geocode_start_point
  const endPoint = (full as { geocode_end_point?: { label?: unknown; geocode?: unknown } })
    .geocode_end_point

  const departureLocation = asString(startPoint?.label) || city || null
  const departureGeocode = asString(startPoint?.geocode) || null
  const endLocation = asString(endPoint?.label) || null
  const endGeocode = asString(endPoint?.geocode) || null

  // Included / Excluded — splitTourCMSList handles newline OR comma separated
  const included = splitTourCMSList((full as { inc?: unknown }).inc)
  const excluded = splitTourCMSList((full as { ex?: unknown }).ex)

  // Booking URL (TourCMS reservation widget)
  const permalink = asString(full.book_url || t.tour_url) || null

  // Long form text fields — Palisis admin shows these
  const essentialInformation = asString((full as { essential?: unknown }).essential) || null
  const hotelPickupInstructions = asString((full as { delivery_methods?: unknown }).delivery_methods) || null
  const voucherRedemptionInstructions = asString((full as { redemption_method?: unknown }).redemption_method) || null
  const restrictions = asString((full as { restrictions?: unknown }).restrictions) || null
  const extras = asString((full as { extras?: unknown }).extras) || null
  const itinerary = asString((full as { itinerary?: unknown }).itinerary) || null
  const receiptInformation = asString((full as { receipt?: unknown }).receipt) || null

  // Media: pdf + video (TourCMS exposes `documents` and `video_url` sometimes)
  const pdfUrl = asString((full as { documents?: unknown }).documents) || null
  const videoUrl = asString((full as { video_url?: unknown }).video_url) || null

  return {
    palisisId: tourId,
    title,
    description,
    price,
    duration,
    category: "Tours",
    tags: [], // Legacy local-only tags — not overwritten from Palisis
    city,
    provider: supplier,
    image,
    gallery,
    highlights,
    badge: null,
    rating: 0,
    reviewCount: 0,
    featured: false,
    featuredDeparture: false,
    status: "published",
    permalink,
    originalPrice: null,

    tourType,
    tourTypeCode,
    tourLeader: leaderCode != null ? TOUR_LEADER_LABELS[leaderCode] ?? null : null,
    grade: gradeCode != null ? GRADE_LABELS[gradeCode] ?? null : null,
    accommodationRating: accomCode != null ? ACCOM_RATING_LABELS[accomCode] ?? null : null,
    tripTags,
    languages: extractLanguages(full),
    departureLocation,
    departureGeocode,
    endLocation,
    endGeocode,
    country: asString((full as { country?: unknown }).country) || null,
    commercialPriority: asString((full as { priority?: unknown }).priority) || null,
    shortDescription: asString(full.shortdesc) || null,
    longDescription: asString(full.longdesc) || null,
    experienceHighlights: asString((full as { exp?: unknown }).exp) || null,
    included,
    excluded,
    essentialInformation,
    hotelPickupInstructions,
    voucherRedemptionInstructions,
    restrictions,
    extras,
    itinerary,
    receiptInformation,
    pdfUrl,
    videoUrl,
    cancellationPolicy: asString((full as { cancellation_policy?: unknown }).cancellation_policy) || null,
    minBookingSize: asNumber((full as { min_booking_size?: unknown }).min_booking_size),
    maxBookingSize: asNumber((full as { max_booking_size?: unknown }).max_booking_size),
    nonRefundable: asNumber((full as { non_refundable?: unknown }).non_refundable) === 1,
    nextBookableDate: asDate((full as { next_bookable_date?: unknown }).next_bookable_date),
    lastBookableDate: asDate((full as { last_bookable_date?: unknown }).last_bookable_date),

    palisisRaw: full,
    syncSource: "palisis",
    lastSyncedAt: new Date().toISOString(),
  }
}

/** Build a partial update payload — only the fields safe to override on every sync. */
export function mappedToUpdatePayload(m: MappedTrip, opts: { preservePermalink?: boolean } = {}) {
  const payload: Record<string, unknown> = {
    title: m.title,
    description: m.description,
    price: m.price,
    duration: m.duration,
    image: m.image,
    gallery: m.gallery,
    city: m.city,
    provider: m.provider,
    highlights: m.highlights,

    tourType: m.tourType,
    tourTypeCode: m.tourTypeCode,
    tourLeader: m.tourLeader,
    grade: m.grade,
    accommodationRating: m.accommodationRating,
    tripTags: m.tripTags,
    languages: m.languages,
    departureLocation: m.departureLocation,
    departureGeocode: m.departureGeocode,
    endLocation: m.endLocation,
    endGeocode: m.endGeocode,
    country: m.country,
    commercialPriority: m.commercialPriority,
    shortDescription: m.shortDescription,
    longDescription: m.longDescription,
    experienceHighlights: m.experienceHighlights,
    included: m.included,
    excluded: m.excluded,
    essentialInformation: m.essentialInformation,
    hotelPickupInstructions: m.hotelPickupInstructions,
    voucherRedemptionInstructions: m.voucherRedemptionInstructions,
    restrictions: m.restrictions,
    extras: m.extras,
    itinerary: m.itinerary,
    receiptInformation: m.receiptInformation,
    pdfUrl: m.pdfUrl,
    videoUrl: m.videoUrl,
    cancellationPolicy: m.cancellationPolicy,
    minBookingSize: m.minBookingSize,
    maxBookingSize: m.maxBookingSize,
    nonRefundable: m.nonRefundable,
    nextBookableDate: m.nextBookableDate,
    lastBookableDate: m.lastBookableDate,

    palisisRaw: m.palisisRaw,
    syncSource: m.syncSource,
    lastSyncedAt: m.lastSyncedAt,
  }
  if (!opts.preservePermalink) payload.permalink = m.permalink
  return payload
}
