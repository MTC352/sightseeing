/**
 * lib/db/queries.ts
 * All database query helpers — replaces the in-memory Map operations
 * from lib/admin-store.ts. Shape of returned objects matches AdminTrip,
 * AdminPost, etc. so existing API handlers need minimal changes.
 */
import { query, queryOne, pool } from "@/lib/db"
import {
  type AiProvider,
  effectiveProvider,
  selectedProvider,
  equivalentModel,
  providerOf,
} from "@/lib/ai/models"
import {
  DEFAULT_SEO_OPTIMIZE_PROMPT,
  DEFAULT_SEO_FIX_PROMPT,
  DEFAULT_SEO_ANALYZE_PROMPT,
  type SeoPrompts,
} from "@/lib/ai/seo-prompts"
import { sanitizeRichText, sanitizeCssColor } from "@/lib/sanitize-html"
import { sanitizeExcludedFields, parseExcludedFields } from "@/lib/palisis-import-fields"

// ── Announcement banner ─────────────────────────────────────────────────────
// Structured banner stored in a single `integrations` row (key='announcement'):
//   value = sanitized rich-text HTML (the message), meta = { enabled, size }.
export type AnnouncementSize = "sm" | "md" | "lg"
export type AnnouncementAlign = "left" | "center" | "right"
export interface Announcement {
  enabled: boolean
  content: string
  size: AnnouncementSize
  align: AnnouncementAlign
  bgColor: string
  textColor: string
}

function readAnnouncementRow(value: unknown, meta: unknown): Announcement {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>
  const size: AnnouncementSize = m.size === "sm" || m.size === "lg" ? m.size : "md"
  const align: AnnouncementAlign = m.align === "left" || m.align === "right" ? m.align : "center"
  return {
    enabled: m.enabled === true,
    content: sanitizeRichText(typeof value === "string" ? value : ""),
    size,
    align,
    bgColor: sanitizeCssColor(typeof m.bgColor === "string" ? m.bgColor : ""),
    textColor: sanitizeCssColor(typeof m.textColor === "string" ? m.textColor : ""),
  }
}

// ── Trips ──────────────────────────────────────────────────────────────────

/**
 * List trips.
 * @param opts.publicOnly  When true, returns only status='published' rows
 *                          (use for all public/frontend reads + TourCMS integrations).
 *                          When false/omitted, returns drafts + published (admin use).
 */
// Full SELECT list for trips — kept centralized so all read paths stay in sync.
const TRIP_SELECT = `
  id, palisis_id, title, title_override, description, description_override,
  price::float, original_price::float as "originalPrice", duration, category, tags, city,
  provider, image, gallery, highlights, badge, rating::float, review_count as "reviewCount",
  permalink, google_business_url as "googleBusinessUrl",
  featured, featured_departure as "featuredDeparture", status,
  tour_type as "tourType", tour_type_code as "tourTypeCode",
  tour_leader as "tourLeader", grade, accommodation_rating as "accommodationRating",
  trip_tags as "tripTags", languages,
  departure_location as "departureLocation", departure_geocode as "departureGeocode",
  end_location as "endLocation", end_geocode as "endGeocode",
  country, commercial_priority as "commercialPriority",
  short_description as "shortDescription", long_description as "longDescription",
  experience_highlights as "experienceHighlights",
  included, excluded,
  essential_information as "essentialInformation",
  hotel_pickup_instructions as "hotelPickupInstructions",
  voucher_redemption_instructions as "voucherRedemptionInstructions",
  restrictions, extras, itinerary, receipt_information as "receiptInformation",
  pdf_url as "pdfUrl", video_url as "videoUrl",
  cancellation_policy as "cancellationPolicy",
  min_booking_size as "minBookingSize", max_booking_size as "maxBookingSize",
  non_refundable as "nonRefundable",
  next_bookable_date as "nextBookableDate", last_bookable_date as "lastBookableDate",
  last_synced_at as "lastSyncedAt", sync_source as "syncSource",
  seo_keyword as "seoKeyword", seo_title as "seoTitle",
  seo_meta_description as "seoMetaDescription", seo_body as "seoBody",
  seo_highlights as "seoHighlights", seo_slug as "seoSlug",
  seo_score as "seoScore", seo_optimized_at as "seoOptimizedAt",
  seo_optimized_by as "seoOptimizedBy", seo_source_hashes as "seoSourceHashes",
  itinerary_steps as "itinerarySteps",
  palisis_product_id as "palisisProductId",
  slug,
  created_at, updated_at
`

export async function dbListTrips(opts: { publicOnly?: boolean } = {}) {
  const where = opts.publicOnly ? "status = 'published'" : "status != 'archived'"
  return query(`SELECT ${TRIP_SELECT} FROM trips WHERE ${where} ORDER BY created_at DESC`)
}

export async function dbListArchivedTrips() {
  return query(`SELECT ${TRIP_SELECT} FROM trips WHERE status = 'archived' ORDER BY created_at DESC`)
}

/**
 * Get one trip by id.
 * @param opts.publicOnly  When true, returns null unless status='published'.
 */
export async function dbGetTrip(id: string, opts: { publicOnly?: boolean } = {}) {
  const extra = opts.publicOnly ? "AND status = 'published'" : ""
  // Alias-aware lookup: imported trips have id=`tcms_<palisisId>` but may be
  // referenced publicly by their raw palisis_id (e.g. `/trip/31898`). Match
  // on either column so archived/draft status cannot be bypassed by alias.
  return queryOne(
    `SELECT ${TRIP_SELECT} FROM trips
       WHERE (id = $1 OR palisis_id = $1 OR slug = $1)
       ${extra}
       LIMIT 1`,
    [id]
  )
}

/**
 * Alias-aware existence probe — returns the row's status if a trip exists
 * under either `id` or `palisis_id`, or null if no such trip exists.
 * Throws on DB error so callers can fail-CLOSED rather than treat errors as
 * "not found". Used by public/AI surfaces to gate static-seed fallback.
 */
export async function dbTripStatus(id: string): Promise<string | null> {
  const row = await queryOne<{ status: string }>(
    `SELECT status FROM trips WHERE id = $1 OR palisis_id = $1 OR slug = $1 LIMIT 1`,
    [id]
  )
  return row ? String(row.status ?? "") : null
}

export async function dbCreateTrip(data: Record<string, unknown>) {
  // palisisId = TourCMS tour_id (external identity). id = our internal PK.
  // For seed data from lib/data.ts, callers pass `id` only and we use it for both
  // (preserves the legacy id==palisis_id contract for static seed trips).
  // For TourCMS imports, callers pass `palisisId` separately and we generate a
  // fresh id so two tours imported in the same millisecond cannot collide.
  const palisisId = (data.palisisId ?? data.id) as string | undefined
  const tripId    = (data.id as string | undefined)
                 ?? (palisisId ? `tcms_${palisisId}` : `t_${Date.now()}_${Math.random().toString(36).slice(2,8)}`)
  // WordPress-style slug for the public `/trip/{slug}` URL. Generated once at
  // create time from the (caller-supplied) slug or the title, then made unique.
  // Palisis re-sync never overrides it (slug is absent from the update payload).
  const slugBase = generateSlug(String(data.slug ?? data.title ?? '')) || generateSlug(tripId) || `trip-${Date.now()}`
  const slug = await uniqueTripSlug(slugBase)
  const rows = await query(`
    INSERT INTO trips (
      id, palisis_id, title, description, price, original_price, duration, category,
      tags, city, provider, image, gallery, highlights, badge, rating, review_count,
      permalink, google_business_url, featured, featured_departure, status,
      tour_type, tour_type_code, tour_leader, grade, accommodation_rating,
      trip_tags, languages,
      departure_location, departure_geocode, end_location, end_geocode,
      country, commercial_priority,
      short_description, long_description, experience_highlights,
      included, excluded,
      essential_information, hotel_pickup_instructions, voucher_redemption_instructions,
      restrictions, extras, itinerary, receipt_information,
      pdf_url, video_url, cancellation_policy,
      min_booking_size, max_booking_size, non_refundable,
      next_bookable_date, last_bookable_date,
      palisis_raw, sync_source, last_synced_at,
      palisis_product_id,
      slug
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
      $18,$19,$20,$21,$22,
      $23,$24,$25,$26,$27,
      $28,$29,
      $30,$31,$32,$33,
      $34,$35,
      $36,$37,$38,
      $39,$40,
      $41,$42,$43,
      $44,$45,$46,$47,
      $48,$49,$50,
      $51,$52,$53,
      $54,$55,
      $56,$57,$58,
      $59,$60
    )
    RETURNING *
  `, [
    tripId, palisisId ?? tripId,
    data.title, data.description, data.price, data.originalPrice ?? null,
    data.duration, data.category, data.tags ?? [], data.city ?? 'Luxembourg',
    data.provider ?? null, data.image ?? null, data.gallery ?? null,
    data.highlights ?? [], data.badge ?? null, data.rating ?? 0,
    data.reviewCount ?? 0, data.permalink ?? null, data.googleBusinessUrl ?? null,
    data.featured ?? false, data.featuredDeparture ?? false, data.status ?? 'draft',
    data.tourType ?? null, data.tourTypeCode ?? null, data.tourLeader ?? null,
    data.grade ?? null, data.accommodationRating ?? null,
    data.tripTags ?? [], data.languages ?? [],
    data.departureLocation ?? null, data.departureGeocode ?? null,
    data.endLocation ?? null, data.endGeocode ?? null,
    data.country ?? null, data.commercialPriority ?? null,
    data.shortDescription ?? null, data.longDescription ?? null,
    data.experienceHighlights ?? null,
    data.included ?? [], data.excluded ?? [],
    data.essentialInformation ?? null, data.hotelPickupInstructions ?? null,
    data.voucherRedemptionInstructions ?? null,
    data.restrictions ?? null, data.extras ?? null,
    data.itinerary ?? null, data.receiptInformation ?? null,
    data.pdfUrl ?? null, data.videoUrl ?? null, data.cancellationPolicy ?? null,
    data.minBookingSize ?? null, data.maxBookingSize ?? null,
    data.nonRefundable ?? false,
    data.nextBookableDate ?? null, data.lastBookableDate ?? null,
    data.palisisRaw ?? null, data.syncSource ?? null,
    data.lastSyncedAt ? new Date(data.lastSyncedAt as string) : null,
    data.palisisProductId ?? null,
    slug,
  ])
  return rows[0]
}

export async function dbUpdateTrip(id: string, data: Record<string, unknown>) {
  // Sanitize + uniquify an admin-edited slug before it hits the column. An
  // empty value falls back to the row id so the public URL never breaks.
  // (Palisis re-sync never passes `slug`, so manual edits are preserved.)
  if ('slug' in data) {
    const base = generateSlug(String(data.slug ?? ''))
    data = { ...data, slug: await uniqueTripSlug(base || generateSlug(id) || `trip-${Date.now()}`, id) }
  }
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    slug: 'slug',
    title: 'title', titleOverride: 'title_override', description: 'description',
    descriptionOverride: 'description_override', price: 'price', originalPrice: 'original_price',
    duration: 'duration', category: 'category', tags: 'tags', city: 'city',
    provider: 'provider', image: 'image', gallery: 'gallery', highlights: 'highlights',
    badge: 'badge', rating: 'rating', reviewCount: 'review_count', permalink: 'permalink',
    googleBusinessUrl: 'google_business_url', featured: 'featured',
    featuredDeparture: 'featured_departure', status: 'status',
    // ── Palisis-rich fields ────────────────────────────────────────────────
    tourType: 'tour_type', tourTypeCode: 'tour_type_code',
    tourLeader: 'tour_leader', grade: 'grade', accommodationRating: 'accommodation_rating',
    tripTags: 'trip_tags', languages: 'languages',
    departureLocation: 'departure_location', departureGeocode: 'departure_geocode',
    endLocation: 'end_location', endGeocode: 'end_geocode',
    country: 'country', commercialPriority: 'commercial_priority',
    shortDescription: 'short_description', longDescription: 'long_description',
    experienceHighlights: 'experience_highlights',
    included: 'included', excluded: 'excluded',
    essentialInformation: 'essential_information',
    hotelPickupInstructions: 'hotel_pickup_instructions',
    voucherRedemptionInstructions: 'voucher_redemption_instructions',
    restrictions: 'restrictions', extras: 'extras',
    itinerary: 'itinerary', receiptInformation: 'receipt_information',
    pdfUrl: 'pdf_url', videoUrl: 'video_url',
    cancellationPolicy: 'cancellation_policy',
    minBookingSize: 'min_booking_size', maxBookingSize: 'max_booking_size',
    nonRefundable: 'non_refundable',
    nextBookableDate: 'next_bookable_date', lastBookableDate: 'last_bookable_date',
    palisisRaw: 'palisis_raw', syncSource: 'sync_source',
    lastSyncedAt: 'last_synced_at',
    // ── SEO (import-safe; never written by the Palisis importer) ───────────
    seoKeyword: 'seo_keyword', seoTitle: 'seo_title',
    seoMetaDescription: 'seo_meta_description', seoBody: 'seo_body',
    seoHighlights: 'seo_highlights', seoSlug: 'seo_slug',
    seoScore: 'seo_score', seoOptimizedAt: 'seo_optimized_at',
    seoOptimizedBy: 'seo_optimized_by', seoSourceHashes: 'seo_source_hashes',
    // ── Itinerary steps (import-safe; admin/AI-authored, never written by Palisis) ──
    itinerarySteps: 'itinerary_steps',
    // ── Admin-only booking override (never written by Palisis importer) ────────
    palisisProductId: 'palisis_product_id',
  }
  // jsonb columns must be serialized to a JSON string before binding (node-pg
  // would otherwise coerce a JS array of objects into a Postgres array literal).
  const JSONB_COLS = new Set(['itinerary_steps'])
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) {
      sets.push(`${col} = $${i++}`)
      const v = data[key]
      vals.push(JSONB_COLS.has(col) && v != null && typeof v !== 'string' ? JSON.stringify(v) : v)
    }
  }
  if (sets.length === 0) return dbGetTrip(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(
    `UPDATE trips SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals
  )
  return rows[0] ?? null
}

export async function dbDeleteTrip(id: string) {
  await query(`DELETE FROM trips WHERE id = $1`, [id])
}

// ── Blog posts ─────────────────────────────────────────────────────────────

// A blog post is publicly live only when it is published AND its scheduled
// publish time has been reached. A NULL published_at means "publish immediately".
// Scheduled posts (status='published' with a future published_at) and drafts
// stay hidden from the public site, sitemap, and direct URLs.
const POST_PUBLIC_GATE = `status = 'published' AND (published_at IS NULL OR published_at <= NOW())`

export async function dbListPosts() {
  return query(`
    SELECT id, slug, title, excerpt, body, image, author, category, tags,
           status, published_at as "publishedAt", read_time as "readTime",
           seo_title as "seoTitle", seo_description as "seoDescription",
           created_at, updated_at
    FROM blog_posts ORDER BY created_at DESC
  `)
}

/** Public-facing list — only posts whose scheduled publish time has passed. */
export async function dbListPublicPosts() {
  return query(`
    SELECT id, slug, title, excerpt, body, image, author, category, tags,
           status, published_at as "publishedAt", read_time as "readTime",
           seo_title as "seoTitle", seo_description as "seoDescription",
           created_at, updated_at
    FROM blog_posts
    WHERE ${POST_PUBLIC_GATE}
    ORDER BY published_at DESC NULLS LAST, created_at DESC
  `)
}

export async function dbGetPost(id: string) {
  return queryOne(
    `SELECT id, slug, title, excerpt, body, image, author, category, tags,
            status, published_at as "publishedAt", read_time as "readTime",
            seo_title as "seoTitle", seo_description as "seoDescription",
            created_at, updated_at
     FROM blog_posts WHERE id = $1`, [id]
  )
}

export async function dbGetPostBySlug(slug: string) {
  return queryOne(
    `SELECT id, slug, title, excerpt, body, image, author, category, tags,
            status, published_at as "publishedAt", read_time as "readTime",
            seo_title as "seoTitle", seo_description as "seoDescription",
            created_at, updated_at
     FROM blog_posts WHERE slug = $1 AND ${POST_PUBLIC_GATE}`, [slug]
  )
}

/**
 * Fetch a post by slug regardless of status or schedule. Used ONLY for the
 * admin preview path on the public blog route — callers MUST verify an admin
 * session before showing a non-live post to the requester.
 */
export async function dbGetPostBySlugAny(slug: string) {
  return queryOne(
    `SELECT id, slug, title, excerpt, body, image, author, category, tags,
            status, published_at as "publishedAt", read_time as "readTime",
            seo_title as "seoTitle", seo_description as "seoDescription",
            created_at, updated_at
     FROM blog_posts WHERE slug = $1`, [slug]
  )
}

function generateSlug(title: string): string {
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  // Never emit a slug that looks like a legacy trip id (pure digits or
  // `tcms_NN`). proxy.ts treats those segments as old id/palisis_id URLs and
  // 308-redirects them, so an all-numeric slug would be hijacked/mis-resolved.
  if (slug === '' || /^(?:tcms_?\d+|\d+)$/.test(slug)) {
    return slug ? `trip-${slug}` : ''
  }
  return slug
}

/**
 * WordPress-style unique slug for trips. Same algorithm as blog `uniqueSlug`
 * but scoped to the `trips` table. Appends `-2`, `-3`, … on collision.
 */
async function uniqueTripSlug(base: string, excludeId?: string): Promise<string> {
  const slug = base || `trip-${Date.now()}`
  let suffix = 0
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix + 1}`
    const rows = await query(
      `SELECT id FROM trips WHERE slug = $1${excludeId ? ' AND id != $2' : ''}`,
      excludeId ? [candidate, excludeId] : [candidate]
    )
    if (rows.length === 0) return candidate
    suffix++
  }
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base || `post-${Date.now()}`
  let suffix = 0
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`
    const rows = await query(
      `SELECT id FROM blog_posts WHERE slug = $1${excludeId ? ' AND id != $2' : ''}`,
      excludeId ? [candidate, excludeId] : [candidate]
    )
    if (rows.length === 0) return candidate
    suffix++
  }
}

export async function dbCreatePost(data: Record<string, unknown>) {
  const baseSlug = data.slug ? generateSlug(String(data.slug)) : generateSlug(String(data.title ?? ''))
  const slug = await uniqueSlug(baseSlug)
  const rows = await query(`
    INSERT INTO blog_posts (slug, title, excerpt, body, image, author, category, tags,
      status, published_at, read_time, seo_title, seo_description)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
  `, [
    slug, data.title, data.excerpt ?? null, data.body ?? null,
    data.image ?? null, data.author ?? null, data.category ?? null,
    data.tags ?? [], data.status ?? 'draft',
    data.publishedAt ?? null, data.readTime ?? null,
    data.seoTitle ?? null, data.seoDescription ?? null,
  ])
  return rows[0]
}

export async function dbUpdatePost(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    slug: 'slug', title: 'title', excerpt: 'excerpt', body: 'body', image: 'image',
    author: 'author', category: 'category', tags: 'tags', status: 'status',
    publishedAt: 'published_at', readTime: 'read_time',
    seoTitle: 'seo_title', seoDescription: 'seo_description',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) { sets.push(`${col} = $${i++}`); vals.push(data[key]) }
  }
  if (sets.length === 0) return dbGetPost(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE blog_posts SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeletePost(id: string) {
  await query(`DELETE FROM blog_posts WHERE id = $1`, [id])
}

// ── Jobs ───────────────────────────────────────────────────────────────────

export async function dbListJobs() {
  return query(`
    SELECT id, title, department, location, type, description, requirements,
           status, created_at as "createdAt", updated_at
    FROM jobs ORDER BY created_at DESC
  `)
}

export async function dbGetJob(id: string) {
  return queryOne(
    `SELECT id, title, department, location, type, description, requirements,
            status, created_at as "createdAt", updated_at
     FROM jobs WHERE id = $1`, [id]
  )
}

export async function dbCreateJob(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO jobs (title, department, location, type, description, requirements, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [
    data.title, data.department ?? null, data.location ?? null, data.type ?? 'Full-time',
    data.description ?? null, data.requirements ?? [], data.status ?? 'open',
  ])
  return rows[0]
}

export async function dbUpdateJob(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    title: 'title', department: 'department', location: 'location', type: 'type',
    description: 'description', requirements: 'requirements', status: 'status',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) { sets.push(`${col} = $${i++}`); vals.push(data[key]) }
  }
  if (sets.length === 0) return dbGetJob(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE jobs SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeleteJob(id: string) {
  await query(`DELETE FROM jobs WHERE id = $1`, [id])
}

// ── Job Applications ───────────────────────────────────────────────────────

export async function dbListApplications(filters?: { jobId?: string; status?: string }) {
  let sql = `
    SELECT a.id, a.job_id as "jobId", j.title as "jobTitle",
           a.full_name as "fullName", a.email, a.phone,
           a.cover_letter as "coverLetter", a.resume_url as "resumeUrl",
           a.portfolio_url as "portfolioUrl", a.linkedin_url as "linkedinUrl",
           a.attachments, a.status, a.notes, a.created_at as "createdAt", a.updated_at
    FROM job_applications a JOIN jobs j ON j.id = a.job_id`
  const params: unknown[] = []
  const wheres: string[] = []
  if (filters?.jobId) { params.push(filters.jobId); wheres.push(`a.job_id = $${params.length}`) }
  if (filters?.status) { params.push(filters.status); wheres.push(`a.status = $${params.length}`) }
  if (wheres.length) sql += ` WHERE ${wheres.join(' AND ')}`
  sql += ` ORDER BY a.created_at DESC`
  return query(sql, params)
}

export async function dbUpdateApplication(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  if ('status' in data) { sets.push(`status = $${i++}`); vals.push(data.status) }
  if ('notes' in data) { sets.push(`notes = $${i++}`); vals.push(data.notes) }
  if (sets.length === 0) return null
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE job_applications SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeleteApplication(id: string) {
  await query(`DELETE FROM job_applications WHERE id = $1`, [id])
}

export async function dbCreateApplication(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO job_applications (job_id, full_name, email, phone, cover_letter,
      resume_url, portfolio_url, linkedin_url, attachments)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [
    data.jobId, data.fullName, data.email, data.phone ?? null,
    data.coverLetter, data.resumeUrl ?? null, data.portfolioUrl ?? null,
    data.linkedinUrl ?? null, JSON.stringify(data.attachments ?? []),
  ])
  return rows[0]
}

// ── Help Articles ──────────────────────────────────────────────────────────

export async function dbListHelpArticles(audience?: 'public' | 'admin' | 'all') {
  if (audience === 'admin') {
    return query(`
      SELECT id, question, answer, category, status, audience, attachments,
             sort_order as "order", created_at as "createdAt", updated_at
      FROM help_articles WHERE audience = 'admin' ORDER BY category, sort_order
    `)
  }
  if (audience === 'all') {
    return query(`
      SELECT id, question, answer, category, status, audience, attachments,
             sort_order as "order", created_at as "createdAt", updated_at
      FROM help_articles ORDER BY audience, category, sort_order
    `)
  }
  // Default: public only
  return query(`
    SELECT id, question, answer, category, status, audience, attachments,
           sort_order as "order", created_at as "createdAt", updated_at
    FROM help_articles WHERE audience = 'public' OR audience IS NULL ORDER BY category, sort_order
  `)
}

export async function dbGetHelpArticle(id: string) {
  return queryOne(`
    SELECT id, question, answer, category, status, audience, attachments,
           sort_order as "order", created_at as "createdAt", updated_at
    FROM help_articles WHERE id = $1
  `, [id])
}

export async function dbCreateHelpArticle(data: Record<string, unknown>) {
  const attachments = Array.isArray(data.attachments) ? data.attachments : []
  const rows = await query(`
    INSERT INTO help_articles (question, answer, category, status, sort_order, audience, attachments)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *
  `, [data.question, data.answer, data.category, data.status ?? 'published', data.order ?? 0, data.audience ?? 'public', JSON.stringify(attachments)])
  return rows[0]
}

export async function dbUpdateHelpArticle(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    question: 'question', answer: 'answer', category: 'category',
    status: 'status', order: 'sort_order', audience: 'audience',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) { sets.push(`${col} = $${i++}`); vals.push(data[key]) }
  }
  if ('attachments' in data) {
    const attachments = Array.isArray(data.attachments) ? data.attachments : []
    sets.push(`attachments = $${i++}::jsonb`); vals.push(JSON.stringify(attachments))
  }
  if (sets.length === 0) return dbGetHelpArticle(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE help_articles SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeleteHelpArticle(id: string) {
  await query(`DELETE FROM help_articles WHERE id = $1`, [id])
}

// Removes duplicate help articles, keeping the OLDEST row in each
// (category, question, audience) group. Returns the number of rows removed.
export async function dbDedupeHelpArticles(): Promise<number> {
  const rows = await query<{ id: string }>(`
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY category, question, COALESCE(audience, 'public')
               ORDER BY created_at ASC, id ASC
             ) AS rn
      FROM help_articles
    )
    DELETE FROM help_articles
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    RETURNING id
  `)
  return rows.length
}

// Counts how many help articles are duplicates (i.e. how many rows
// dbDedupeHelpArticles would remove) using the same (category, question,
// audience) grouping. Returns 0 when there are no duplicates.
export async function dbCountDuplicateHelpArticles(): Promise<number> {
  const row = await queryOne<{ count: string }>(`
    WITH ranked AS (
      SELECT ROW_NUMBER() OVER (
               PARTITION BY category, question, COALESCE(audience, 'public')
               ORDER BY created_at ASC, id ASC
             ) AS rn
      FROM help_articles
    )
    SELECT COUNT(*)::text AS count FROM ranked WHERE rn > 1
  `)
  return row ? Number(row.count) : 0
}

// ── Support Tickets ────────────────────────────────────────────────────────

export async function dbListTickets(filters?: { status?: string }) {
  let sql = `
    SELECT t.id, t.subject, t.description, t.category, t.priority, t.status,
           t.author_name as "authorName", t.author_email as "authorEmail",
           t.author_role as "authorRole", t.assigned_to as "assignedTo",
           t.created_at as "createdAt", t.updated_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', r.id, 'ticketId', r.ticket_id,
                 'authorName', r.author_name, 'authorRole', r.author_role,
                 'message', r.message, 'createdAt', r.created_at
               ) ORDER BY r.created_at
             ) FILTER (WHERE r.id IS NOT NULL), '[]'
           ) as replies
    FROM support_tickets t
    LEFT JOIN ticket_replies r ON r.ticket_id = t.id`
  const params: unknown[] = []
  if (filters?.status) { params.push(filters.status); sql += ` WHERE t.status = $1` }
  sql += ` GROUP BY t.id ORDER BY t.created_at DESC`
  return query(sql, params)
}

export async function dbGetTicket(id: string) {
  const rows = await query(`
    SELECT t.id, t.subject, t.description, t.category, t.priority, t.status,
           t.author_name as "authorName", t.author_email as "authorEmail",
           t.author_role as "authorRole", t.assigned_to as "assignedTo",
           t.created_at as "createdAt", t.updated_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', r.id, 'ticketId', r.ticket_id,
                 'authorName', r.author_name, 'authorRole', r.author_role,
                 'message', r.message, 'createdAt', r.created_at
               ) ORDER BY r.created_at
             ) FILTER (WHERE r.id IS NOT NULL), '[]'
           ) as replies
    FROM support_tickets t
    LEFT JOIN ticket_replies r ON r.ticket_id = t.id
    WHERE t.id = $1
    GROUP BY t.id
  `, [id])
  return rows[0] ?? null
}

export async function dbCreateTicket(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO support_tickets (subject, description, category, priority, status,
      author_name, author_email, author_role)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [
    data.subject, data.description ?? null, data.category ?? 'other',
    data.priority ?? 'medium', data.status ?? 'open',
    data.authorName ?? 'Admin', data.authorEmail ?? 'admin@sightseeing.lu',
    data.authorRole ?? 'admin',
  ])
  return rows[0]
}

export async function dbUpdateTicket(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    status: 'status', priority: 'priority', assignedTo: 'assigned_to',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) { sets.push(`${col} = $${i++}`); vals.push(data[key]) }
  }
  if (sets.length === 0) return dbGetTicket(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE support_tickets SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeleteTicket(id: string) {
  await query(`DELETE FROM support_tickets WHERE id = $1`, [id])
}

export async function dbAddTicketReply(ticketId: string, data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO ticket_replies (ticket_id, author_name, author_role, message)
    VALUES ($1,$2,$3,$4) RETURNING *
  `, [ticketId, data.authorName ?? 'Admin', data.authorRole ?? 'admin', data.message])
  return rows[0]
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function dbGetSettings() {
  const [intRows, aiRows, hfRows] = await Promise.all([
    query(`SELECT key, value, meta FROM integrations`),
    query(`SELECT system_key, system_prompt, model, temperature::float, max_tokens, extra_config FROM ai_system_configs`),
    query(`SELECT name, label, placement, html, enabled FROM header_footer_blocks`),
  ])

  const apiKeys: Record<string, string> = {}
  let weglot: Record<string, unknown> = { originalLang: 'en', destinationLangs: [], showFlags: true }

  let announcement: Announcement = { enabled: false, content: '', size: 'md', align: 'center', bgColor: '', textColor: '' }
  let importExcludedFields: string[] = []

  for (const row of intRows as Record<string, unknown>[]) {
    const key = row.key as string
    if (key === 'weglot' && row.meta && typeof row.meta === 'object' && Object.keys(row.meta as object).length > 0) {
      weglot = { ...(row.meta as Record<string, unknown>), apiKey: row.value ?? '' }
    } else if (key === 'announcement') {
      // Structured announcement banner — kept out of `apiKeys` (it is not a
      // credential) and surfaced as its own settings section.
      announcement = readAnnouncementRow(row.value, row.meta)
    } else if (key === 'palisis_import_excluded_fields') {
      // Palisis importer override-exclusion defaults — kept out of `apiKeys`
      // (not a credential) and surfaced as its own settings field.
      importExcludedFields = parseExcludedFields(row.value)
    } else {
      apiKeys[key] = (row.value as string) ?? ''
    }
  }

  const ai: Record<string, unknown> = {}
  let plannerBehavior: Record<string, unknown> = {
    model: 'openai/gpt-4o-mini', optimizationPriority: 'balanced',
    preferenceWeighting: 70, suggestionRandomness: 30, localFavoritesBias: 50,
    bufferTimeBetweenStops: 30, maxStopsPerDay: 5, defaultActivityDuration: 90,
    dayStartTime: '09:00', dayEndTime: '21:00', autoInsertMealBreaks: true,
    lunchBreakTime: '12:30', dinnerBreakTime: '19:00', mealBreakDuration: 60,
    travelTimeMethod: 'public_transport',
    // Pace preset feeds lib/itinerary/scheduler.ts (buffer scale + target stops,
    // clamped to maxStopsPerDay). Map provider selects the routing backend for
    // travel legs ('mapbox' live today; 'google' requires a Directions key).
    pace: 'balanced', mapProvider: 'mapbox',
  }
  // Itinerary builder: defaults are the *current* live defaults so the admin
  // page renders with the values that are actually in effect right now.
  let itineraryBehavior: Record<string, unknown> = {
    systemPrompt: '',
    model: 'anthropic/claude-haiku-4-5-20251001',
    temperature: 0.5,
    maxTokens: 2048,
    tipsPrompt: '',
    showCarWidget: true,
    showHotelWidget: true,
    // Max-days cap for the planner onboarding "Multi-day trip" option.
    // 2..14 (clamped). Surfaced publicly via /api/planner/form-config.
    maxMultiDayDays: 2,
  }
  // SEO Optimizer: the three editable creative prompts (Optimize / Fix /
  // Analyze). Defaults are the live hardcoded defaults so the admin page renders
  // the prompts actually in effect right now when no override exists.
  let seoBehavior: SeoPrompts = {
    optimize: DEFAULT_SEO_OPTIMIZE_PROMPT,
    fix: DEFAULT_SEO_FIX_PROMPT,
    analyze: DEFAULT_SEO_ANALYZE_PROMPT,
  }
  for (const r of aiRows as Record<string, unknown>[]) {
    // Expose extra_config alongside the basic fields so consumers (e.g.
    // /api/planner reading the Trip-Chat-managed planner prompt override
    // out of chat.extra_config.planner.systemPrompt) don't need a second
    // query. Always an object (defaults to {}).
    const extra = (r.extra_config && typeof r.extra_config === 'object')
      ? r.extra_config as Record<string, unknown>
      : {}
    ai[r.system_key as string] = {
      systemPrompt: r.system_prompt ?? '',
      model: r.model,
      temperature: r.temperature,
      maxTokens: r.max_tokens,
      extra,
    }
    if (r.system_key === 'planner' && r.extra_config && typeof r.extra_config === 'object') {
      plannerBehavior = { ...plannerBehavior, ...(r.extra_config as Record<string, unknown>) }
    }
    if (r.system_key === 'itinerary') {
      const extra = (r.extra_config && typeof r.extra_config === 'object'
        ? r.extra_config as Record<string, unknown>
        : {})
      itineraryBehavior = {
        ...itineraryBehavior,
        systemPrompt: r.system_prompt ?? itineraryBehavior.systemPrompt,
        model: r.model ?? itineraryBehavior.model,
        temperature: r.temperature ?? itineraryBehavior.temperature,
        maxTokens: r.max_tokens ?? itineraryBehavior.maxTokens,
        ...extra,
      }
    }
    if (r.system_key === 'seo') {
      const optimize = typeof r.system_prompt === 'string' && r.system_prompt.trim()
        ? r.system_prompt : seoBehavior.optimize
      const fix = typeof extra.fixPrompt === 'string' && (extra.fixPrompt as string).trim()
        ? extra.fixPrompt as string : seoBehavior.fix
      const analyze = typeof extra.analyzePrompt === 'string' && (extra.analyzePrompt as string).trim()
        ? extra.analyzePrompt as string : seoBehavior.analyze
      seoBehavior = { optimize, fix, analyze }
    }
  }

  // Exclude the legacy `announcement_banner` row from the header code merge —
  // the structured banner (integrations.key='announcement') now owns that job, so
  // legacy raw banner HTML must never re-enter the admin header code state or get
  // re-saved into `head_scripts` on the next save.
  const headerBlocks = (hfRows as Record<string, unknown>[]).filter(b => b.placement !== 'body_end' && b.name !== 'announcement_banner')
  const footerBlocks = (hfRows as Record<string, unknown>[]).filter(b => b.placement === 'body_end')
  const mergeHtml = (blocks: Record<string, unknown>[]) =>
    blocks.filter(b => b.enabled && b.html).map(b => `<!-- ${b.label} -->\n${b.html}`).join('\n\n')

  // Task #15 — AI provider selection. `aiProviderSelected` is the admin's raw
  // choice; `aiProvider` is the provider actually used at runtime (falls back to
  // the other provider when the selected one has no usable key).
  const aiEnv = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gateway: process.env.AI_GATEWAY_API_KEY,
  }
  const aiProviderSelected = selectedProvider(apiKeys)
  const aiProvider = effectiveProvider(apiKeys, aiEnv)

  return { apiKeys, ai, plannerBehavior, itineraryBehavior, seoBehavior, weglot, announcement, importExcludedFields, aiProvider, aiProviderSelected, header: { customHtml: mergeHtml(headerBlocks) }, footer: { customHtml: mergeHtml(footerBlocks) } }
}

export async function dbUpdateItineraryConfig(data: Record<string, unknown>) {
  // Snapshot the pre-edit values so first-edit rollback is possible.
  const beforeRow = await queryOne<{ system_prompt: string; extra_config: unknown }>(
    `SELECT system_prompt, extra_config FROM ai_system_configs WHERE system_key = 'itinerary'`,
  )
  const beforeSystemPrompt = beforeRow?.system_prompt ?? ''
  const beforeExtra = (beforeRow?.extra_config && typeof beforeRow.extra_config === 'object')
    ? beforeRow.extra_config as Record<string, unknown>
    : {}
  const beforeTipsPrompt = typeof beforeExtra.tipsPrompt === 'string' ? beforeExtra.tipsPrompt : ''

  const { systemPrompt, model, temperature, maxTokens, tipsPrompt, showCarWidget, showHotelWidget, maxMultiDayDays } = data as {
    systemPrompt?: string
    model?: string
    temperature?: number
    maxTokens?: number
    tipsPrompt?: string
    showCarWidget?: boolean
    showHotelWidget?: boolean
    maxMultiDayDays?: number
  }
  // Non-destructive extra_config merge — read existing row first so unknown
  // / future keys, and any field omitted from this PUT, are preserved
  // instead of being reset to defaults on every partial update.
  const existingRow = await queryOne<{ extra_config: unknown }>(
    `SELECT extra_config FROM ai_system_configs WHERE system_key = 'itinerary'`
  )
  const existing: Record<string, unknown> = (existingRow?.extra_config && typeof existingRow.extra_config === 'object')
    ? existingRow.extra_config as Record<string, unknown>
    : {}

  const extra: Record<string, unknown> = { ...existing }
  if (typeof tipsPrompt === 'string') extra.tipsPrompt = tipsPrompt
  if (typeof showCarWidget === 'boolean') extra.showCarWidget = showCarWidget
  if (typeof showHotelWidget === 'boolean') extra.showHotelWidget = showHotelWidget
  if (typeof maxMultiDayDays === 'number' && Number.isFinite(maxMultiDayDays)) {
    extra.maxMultiDayDays = Math.max(2, Math.min(14, Math.floor(maxMultiDayDays)))
  }
  // Backfill defaults only for fields completely absent from both the
  // incoming PUT and the existing row.
  if (typeof extra.tipsPrompt !== 'string') extra.tipsPrompt = ''
  if (typeof extra.showCarWidget !== 'boolean') extra.showCarWidget = true
  if (typeof extra.showHotelWidget !== 'boolean') extra.showHotelWidget = true
  if (typeof extra.maxMultiDayDays !== 'number') extra.maxMultiDayDays = 2

  await query(`
    INSERT INTO ai_system_configs (system_key, label, description, system_prompt, model, temperature, max_tokens, extra_config)
    VALUES ('itinerary', 'Manage Itinerary',
      'Controls the prompt, AI model, tips text, and cross-sell widgets for the Smart Itinerary builder on /planner.',
      $1, $2, $3, $4, $5)
    ON CONFLICT (system_key) DO UPDATE SET
      system_prompt = COALESCE($1, ai_system_configs.system_prompt),
      model = COALESCE($2, ai_system_configs.model),
      temperature = COALESCE($3, ai_system_configs.temperature),
      max_tokens = COALESCE($4, ai_system_configs.max_tokens),
      extra_config = $5,
      updated_at = NOW()
  `, [
    systemPrompt ?? null,
    model ?? null,
    temperature ?? null,
    maxTokens ?? null,
    JSON.stringify(extra),
  ])
  // Snapshot both prompts for revision history (with baseline so the
  // first edit is reversible).
  if (typeof systemPrompt === 'string') {
    await dbRecordPromptRevision('itinerary', 'systemPrompt', systemPrompt, beforeSystemPrompt)
  }
  if (typeof tipsPrompt === 'string') {
    await dbRecordPromptRevision('itinerary', 'tipsPrompt', tipsPrompt, beforeTipsPrompt)
  }
}

/**
 * Update the "SEO Optimizer" AI System — the three creative prompts that drive
 * /api/admin/seo-generate (optimize), /api/admin/seo-fix (fix) and
 * /api/admin/seo-analyze (analyze). Stored on the single ai_system_configs row
 * with system_key = 'seo' (optimize → system_prompt, fix/analyze → extra_config).
 *
 * Partial-safe: any prompt omitted from `data` is preserved (so activating one
 * revision never wipes the other two). Each provided prompt is snapshotted to
 * ai_prompt_revisions with a baseline so the first edit is reversible.
 */
export async function dbUpdateSeoConfig(data: {
  optimizePrompt?: string
  fixPrompt?: string
  analyzePrompt?: string
}) {
  // Snapshot pre-edit values so first-edit rollback is possible + so we can
  // merge extra_config non-destructively.
  const beforeRow = await queryOne<{ system_prompt: string; extra_config: unknown }>(
    `SELECT system_prompt, extra_config FROM ai_system_configs WHERE system_key = 'seo'`,
  )
  const beforeOptimize = beforeRow?.system_prompt ?? ''
  const beforeExtra = (beforeRow?.extra_config && typeof beforeRow.extra_config === 'object')
    ? beforeRow.extra_config as Record<string, unknown>
    : {}
  const beforeFix = typeof beforeExtra.fixPrompt === 'string' ? beforeExtra.fixPrompt : ''
  const beforeAnalyze = typeof beforeExtra.analyzePrompt === 'string' ? beforeExtra.analyzePrompt : ''

  const { optimizePrompt, fixPrompt, analyzePrompt } = data

  // Non-destructive extra_config merge — preserve any field omitted from this
  // update (and any future keys) instead of resetting them.
  const extra: Record<string, unknown> = { ...beforeExtra }
  if (typeof fixPrompt === 'string') extra.fixPrompt = fixPrompt
  if (typeof analyzePrompt === 'string') extra.analyzePrompt = analyzePrompt

  await query(`
    INSERT INTO ai_system_configs (system_key, label, description, system_prompt, model, extra_config)
    VALUES ('seo', 'SEO Optimizer',
      'Editable creative prompts for the AI SEO tools on the trip edit page — Optimize, Fix and Analyze. Deterministic scoring stays in code.',
      $1, 'anthropic/claude-haiku-4-5-20251001', $2)
    ON CONFLICT (system_key) DO UPDATE SET
      system_prompt = COALESCE($1, ai_system_configs.system_prompt),
      extra_config = $2,
      updated_at = NOW()
  `, [
    optimizePrompt ?? null,
    JSON.stringify(extra),
  ])

  if (typeof optimizePrompt === 'string') {
    await dbRecordPromptRevision('seo', 'optimizePrompt', optimizePrompt, beforeOptimize)
  }
  if (typeof fixPrompt === 'string') {
    await dbRecordPromptRevision('seo', 'fixPrompt', fixPrompt, beforeFix)
  }
  if (typeof analyzePrompt === 'string') {
    await dbRecordPromptRevision('seo', 'analyzePrompt', analyzePrompt, beforeAnalyze)
  }
}

/**
 * Lean fetch of the effective SEO prompts for the runtime routes. One query,
 * falls back to the hardcoded defaults for any prompt with no stored override.
 */
export async function dbGetSeoPrompts(): Promise<SeoPrompts> {
  const row = await queryOne<{ system_prompt: string; extra_config: unknown }>(
    `SELECT system_prompt, extra_config FROM ai_system_configs WHERE system_key = 'seo'`,
  )
  const extra = (row?.extra_config && typeof row.extra_config === 'object')
    ? row.extra_config as Record<string, unknown>
    : {}
  const optimize = typeof row?.system_prompt === 'string' && row.system_prompt.trim()
    ? row.system_prompt : DEFAULT_SEO_OPTIMIZE_PROMPT
  const fix = typeof extra.fixPrompt === 'string' && (extra.fixPrompt as string).trim()
    ? extra.fixPrompt as string : DEFAULT_SEO_FIX_PROMPT
  const analyze = typeof extra.analyzePrompt === 'string' && (extra.analyzePrompt as string).trim()
    ? extra.analyzePrompt as string : DEFAULT_SEO_ANALYZE_PROMPT
  return { optimize, fix, analyze }
}

/**
 * Default options that drive the /planner onboarding form when admin
 * has not customised them. Mirrored on the client as fallback so the
 * form keeps working even if the public form-config endpoint fails.
 */
export const DEFAULT_PLANNER_FORM = {
  groups: [
    { value: 'solo', label: 'Solo' },
    { value: 'couple', label: 'Couple' },
    { value: 'family', label: 'Family with kids' },
    { value: 'friends', label: 'Friends group' },
  ],
  interests: [
    { value: 'food', label: 'Food & Drinks' },
    { value: 'culture', label: 'History & Culture' },
    { value: 'outdoor', label: 'Outdoor & Nature' },
    { value: 'night', label: 'Nightlife' },
    { value: 'sport', label: 'Active & Sports' },
    { value: 'indoor', label: 'Hidden Gems' },
  ],
  durations: [
    { value: '1-2h', label: '1-2 hours' },
    { value: 'half-day', label: 'Half day' },
    { value: 'full-day', label: 'Full day' },
    { value: 'multi-day', label: 'Multi-day trip' },
  ],
  budgets: [
    { value: 'casual', label: 'Keep it casual' },
    { value: 'mid-range', label: 'Mid-range' },
    { value: 'premium', label: 'Treat ourselves' },
  ],
  maxMultiDayDays: 2,
  // Maximum number of interest tiles a visitor may select during the
  // /planner onboarding. Admin-configurable from "Trip Planner Chat".
  maxInterests: 3,
  // Per-step enable/disable toggles for the /planner onboarding wizard.
  // When a step is disabled the planner skips it and uses a sensible
  // default ("solo" group / empty interests / "any" duration / "any"
  // budget / today's date) so the AI still has a complete Preferences
  // object to work with.
  enabledSteps: {
    groups: true,
    interests: true,
    durations: true,
    budgets: true,
    dates: true,
  },
}

/**
 * Distinct `trip_tags` across published trips, returned as planner-form
 * { value, label } options (label is humanised from the slug). Used both
 * by the admin "Load trip tags as defaults" button on the Trip Planner
 * Chat page and by dbGetChatPlannerConfig when no admin-set interests
 * exist — so the onboarding list always reflects the live catalog
 * instead of the legacy hardcoded food/culture/outdoor placeholders
 * which never matched any real trip.
 */
export interface TripTagRow {
  slug: string
  label: string
  show_on_homepage: boolean
  sort_order: number
}

export interface TripTagWithCount extends TripTagRow {
  trip_count: number
}

/** Canonical Trip Tag catalog from the `trip_tags` table (ordered).  Source
 *  of truth for the admin Trip Tags page, trip edit picker, planner-chat
 *  interest defaults and the homepage Categories grid. */
export async function dbListTripTags(): Promise<TripTagRow[]> {
  return await query<TripTagRow>(
    `SELECT slug, label, show_on_homepage, sort_order
       FROM trip_tags
      ORDER BY sort_order ASC, label ASC`
  )
}

/** Same as `dbListTripTags` but joins a per-tag published-trip count.
 *  Used by the admin Trip Tags listing page so editors can see how many
 *  trips are tagged with each entry at a glance, and by the public/admin
 *  trip-tags endpoints so the search filter / planner onboarding can
 *  decide whether a tag is worth showing at all.
 *
 *  Ordered by `trip_count DESC` so the most-used tags surface at the top
 *  of the admin listing — `sort_order` and `label` are the tie-breakers
 *  for stability inside a same-count bucket. */
export async function dbListTripTagsWithCounts(): Promise<TripTagWithCount[]> {
  return await query<TripTagWithCount>(
    `SELECT tt.slug, tt.label, tt.show_on_homepage, tt.sort_order,
            COALESCE(c.trip_count, 0)::int AS trip_count
       FROM trip_tags tt
  LEFT JOIN (
              SELECT tag, COUNT(*) AS trip_count
                FROM (SELECT unnest(trip_tags) AS tag FROM trips WHERE status='published') s
               GROUP BY tag
            ) c ON c.tag = tt.slug
      ORDER BY COALESCE(c.trip_count, 0) DESC, tt.sort_order ASC, tt.label ASC`
  )
}

/** Homepage-flagged tags with a published trip count for "N experiences". */
export async function dbListHomepageTripTagsWithCounts(): Promise<TripTagWithCount[]> {
  return await query<TripTagWithCount>(
    `SELECT tt.slug, tt.label, tt.show_on_homepage, tt.sort_order,
            COALESCE(c.trip_count, 0)::int AS trip_count
       FROM trip_tags tt
  LEFT JOIN (
              SELECT tag, COUNT(*) AS trip_count
                FROM (SELECT unnest(trip_tags) AS tag FROM trips WHERE status='published') s
               GROUP BY tag
            ) c ON c.tag = tt.slug
      WHERE tt.show_on_homepage = TRUE
      ORDER BY tt.sort_order ASC, tt.label ASC`
  )
}

export async function dbCreateTripTag(input: {
  slug: string
  label: string
  show_on_homepage: boolean
  sort_order: number
}): Promise<TripTagRow | null> {
  const rows = await query<TripTagRow>(
    `INSERT INTO trip_tags (slug, label, show_on_homepage, sort_order)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO NOTHING
     RETURNING slug, label, show_on_homepage, sort_order`,
    [input.slug, input.label, input.show_on_homepage, input.sort_order],
  )
  return rows[0] ?? null
}

export async function dbUpdateTripTag(
  slug: string,
  patch: { label?: string; show_on_homepage?: boolean; sort_order?: number },
): Promise<TripTagRow | null> {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (patch.label !== undefined)            { sets.push(`label = $${i++}`);            vals.push(patch.label) }
  if (patch.show_on_homepage !== undefined) { sets.push(`show_on_homepage = $${i++}`); vals.push(patch.show_on_homepage) }
  if (patch.sort_order !== undefined)       { sets.push(`sort_order = $${i++}`);       vals.push(patch.sort_order) }
  if (sets.length === 0) {
    const rows = await query<TripTagRow>(
      `SELECT slug, label, show_on_homepage, sort_order FROM trip_tags WHERE slug = $1`,
      [slug],
    )
    return rows[0] ?? null
  }
  sets.push(`updated_at = NOW()`)
  vals.push(slug)
  const rows = await query<TripTagRow>(
    `UPDATE trip_tags SET ${sets.join(', ')} WHERE slug = $${i}
     RETURNING slug, label, show_on_homepage, sort_order`,
    vals,
  )
  return rows[0] ?? null
}

export async function dbDeleteTripTag(slug: string): Promise<void> {
  await query(`DELETE FROM trip_tags WHERE slug = $1`, [slug])
}

/** Planner-form { value, label } projection.  Reads the canonical
 *  `trip_tags` table so the Trip Planner Chat onboarding tiles stay in
 *  sync with the admin Trip Tags page automatically.  Filters out any
 *  tag that isn't currently attached to at least one published trip so
 *  the onboarding never shows an interest tile with zero matching
 *  experiences (which would always yield empty AI results). */
export async function dbListTripTagOptions(): Promise<{ value: string; label: string }[]> {
  const rows = await query<{ slug: string; label: string; trip_count: number }>(
    `SELECT tt.slug, tt.label,
            COALESCE(c.trip_count, 0)::int AS trip_count
       FROM trip_tags tt
  LEFT JOIN (
              SELECT tag, COUNT(*) AS trip_count
                FROM (SELECT unnest(trip_tags) AS tag FROM trips WHERE status='published') s
               GROUP BY tag
            ) c ON c.tag = tt.slug
      ORDER BY tt.sort_order ASC, tt.label ASC`
  )
  return rows
    .filter((r) => r.slug && /^[a-z0-9-]+$/.test(r.slug) && r.trip_count > 0)
    .map((r) => ({ value: r.slug, label: r.label }))
}

/**
 * Reads the planner overrides that the admin manages from inside the
 * "Trip Chat" admin card — i.e. the planner system-prompt override and
 * the editable onboarding form. Always returns a fully-populated shape;
 * any missing field is backfilled from DEFAULT_PLANNER_FORM so callers
 * never need to defend against undefined keys.
 */
export async function dbGetChatPlannerConfig(): Promise<{
  plannerSystemPrompt: string
  plannerForm: typeof DEFAULT_PLANNER_FORM
}> {
  const [row, plannerRow] = await Promise.all([
    queryOne<{ extra_config: unknown }>(
      `SELECT extra_config FROM ai_system_configs WHERE system_key = 'chat'`
    ),
    queryOne<{ system_prompt: string | null }>(
      `SELECT system_prompt FROM ai_system_configs WHERE system_key = 'planner'`
    ),
  ])
  const extra = (row?.extra_config && typeof row.extra_config === 'object')
    ? row.extra_config as Record<string, unknown>
    : {}
  const plannerExtra = (extra.planner && typeof extra.planner === 'object')
    ? extra.planner as Record<string, unknown>
    : {}
  const formRaw = (plannerExtra.form && typeof plannerExtra.form === 'object')
    ? plannerExtra.form as Record<string, unknown>
    : {}
  const sanitiseList = (v: unknown, fallback: { value: string; label: string }[]) => {
    if (!Array.isArray(v)) return fallback
    const cleaned = v
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({
        value: typeof x.value === 'string' ? x.value.trim() : '',
        label: typeof x.label === 'string' ? x.label.trim() : '',
      }))
      .filter((x) => x.value && x.label)
    return cleaned.length > 0 ? cleaned : fallback
  }
  const maxDaysRaw = Number(formRaw.maxMultiDayDays)
  const maxInterestsRaw = Number(formRaw.maxInterests)
  // If admin has never saved a custom interests list, fall back to the
  // live trip_tags catalog (not the legacy food/culture/outdoor stubs)
  // so the onboarding form always shows tags that actually match real
  // trips. Best-effort: if the lookup fails we still fall back to the
  // bundled defaults so the form keeps working.
  let interestsFallback = DEFAULT_PLANNER_FORM.interests
  const interestsSaved = Array.isArray(formRaw.interests) && formRaw.interests.length > 0
  if (!interestsSaved) {
    try {
      const tagOptions = await dbListTripTagOptions()
      if (tagOptions.length > 0) interestsFallback = tagOptions
    } catch (err) {
      console.error('[dbGetChatPlannerConfig] trip-tag fallback failed:', err)
    }
  }
  // The planner system-prompt OVERRIDE now lives on the planner row's own
  // `system_prompt` column (consolidated with every other AI System). Fall
  // back to the legacy chat.extra_config.planner.systemPrompt location for
  // any value saved before migration 006 relocated it.
  const plannerRowPrompt = typeof plannerRow?.system_prompt === 'string' ? plannerRow.system_prompt : ''
  const legacyPlannerPrompt = typeof plannerExtra.systemPrompt === 'string' ? plannerExtra.systemPrompt : ''
  return {
    plannerSystemPrompt: plannerRowPrompt.trim() ? plannerRowPrompt : legacyPlannerPrompt,
    plannerForm: {
      groups: sanitiseList(formRaw.groups, DEFAULT_PLANNER_FORM.groups),
      interests: sanitiseList(formRaw.interests, interestsFallback),
      durations: sanitiseList(formRaw.durations, DEFAULT_PLANNER_FORM.durations),
      budgets: sanitiseList(formRaw.budgets, DEFAULT_PLANNER_FORM.budgets),
      maxMultiDayDays: Number.isFinite(maxDaysRaw) && maxDaysRaw >= 2 && maxDaysRaw <= 14
        ? Math.floor(maxDaysRaw)
        : DEFAULT_PLANNER_FORM.maxMultiDayDays,
      // No fixed upper bound — the cap is naturally the number of
      // interest tiles configured (the planner UI can't render more
      // than that). Just ensure a positive integer.
      maxInterests: Number.isFinite(maxInterestsRaw) && maxInterestsRaw >= 1
        ? Math.floor(maxInterestsRaw)
        : DEFAULT_PLANNER_FORM.maxInterests,
      enabledSteps: (() => {
        const raw = (formRaw.enabledSteps && typeof formRaw.enabledSteps === 'object')
          ? formRaw.enabledSteps as Record<string, unknown>
          : {}
        const pick = (k: keyof typeof DEFAULT_PLANNER_FORM.enabledSteps) =>
          typeof raw[k] === 'boolean' ? (raw[k] as boolean) : DEFAULT_PLANNER_FORM.enabledSteps[k]
        return {
          groups: pick('groups'),
          interests: pick('interests'),
          durations: pick('durations'),
          budgets: pick('budgets'),
          dates: pick('dates'),
        }
      })(),
    },
  }
}

/**
 * Persist the planner overrides. The system-prompt override is written to the
 * planner row's own `system_prompt` column; the onboarding form is merged
 * non-destructively into chat.extra_config.planner.form. Only the fields
 * supplied in `patch` are touched; everything else is preserved.
 */
export async function dbUpdateChatPlannerConfig(patch: {
  plannerSystemPrompt?: string
  plannerForm?: Partial<typeof DEFAULT_PLANNER_FORM>
}) {
  // The planner system-prompt OVERRIDE now lives on the planner row's own
  // `system_prompt` column (consolidated with every other AI System), NOT in
  // chat.extra_config.planner.systemPrompt. Route it through dbUpdateAiSystem
  // so it also records a revision under ('planner', 'systemPrompt') and leaves
  // the planner row's behavior settings (extra_config) untouched.
  if (typeof patch.plannerSystemPrompt === 'string') {
    await dbUpdateAiSystem('planner', { systemPrompt: patch.plannerSystemPrompt })
  }
  // The onboarding FORM stays where it has always lived —
  // chat.extra_config.planner.form — so this is a non-destructive merge.
  if (patch.plannerForm && typeof patch.plannerForm === 'object') {
    const row = await queryOne<{ extra_config: unknown }>(
      `SELECT extra_config FROM ai_system_configs WHERE system_key = 'chat'`
    )
    const extra = (row?.extra_config && typeof row.extra_config === 'object')
      ? { ...(row.extra_config as Record<string, unknown>) }
      : {}
    const planner = (extra.planner && typeof extra.planner === 'object')
      ? { ...(extra.planner as Record<string, unknown>) }
      : {}
    const currentForm = (planner.form && typeof planner.form === 'object')
      ? { ...(planner.form as Record<string, unknown>) }
      : {}
    planner.form = { ...currentForm, ...patch.plannerForm }
    extra.planner = planner
    // Upsert so the row exists even if admin has never visited /admin/ai-systems/chat before.
    await query(`
      INSERT INTO ai_system_configs (system_key, label, description, extra_config)
      VALUES ('chat', 'Trip Chat',
        'Per-trip AI assistant plus planner conversation prompt and onboarding form.',
        $1)
      ON CONFLICT (system_key) DO UPDATE SET
        extra_config = $1,
        updated_at = NOW()
    `, [JSON.stringify(extra)])
  }
}

// ─── AI prompt revisions ──────────────────────────────────────────────
// Every time any AI system prompt is updated from the admin panel we
// snapshot the new text into `ai_prompt_revisions` so admins can preview
// past versions and roll back. Keyed by (system_key, prompt_kind) where
// prompt_kind is one of:
//   - 'systemPrompt'         (any ai_system_configs.system_prompt, incl. the
//                             planner override now on the planner row)
//   - 'plannerSystemPrompt'  (LEGACY — chat.extra_config.planner.systemPrompt;
//                             planner overrides now record under planner/systemPrompt)
//   - 'tipsPrompt'           (itinerary.extra_config.tipsPrompt)
// The table is created lazily on first use so we don't need a separate
// migration step.

let revisionsTableReady: Promise<void> | null = null
async function ensureRevisionsTable(): Promise<void> {
  if (!revisionsTableReady) {
    revisionsTableReady = query(`
      CREATE TABLE IF NOT EXISTS ai_prompt_revisions (
        id SERIAL PRIMARY KEY,
        system_key TEXT NOT NULL,
        prompt_kind TEXT NOT NULL,
        prompt_text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_apr_lookup
        ON ai_prompt_revisions (system_key, prompt_kind, created_at DESC);
    `).then(() => undefined).catch((err) => {
      // Reset on failure so a later call can retry.
      revisionsTableReady = null
      throw err
    })
  }
  return revisionsTableReady
}

/**
 * Snapshot a prompt change into the revisions table.
 *
 * Behaviour:
 *  - No-op when the incoming text matches the most recent stored
 *    revision for the same (system_key, prompt_kind).
 *  - When `previousText` is supplied and the table has no history yet
 *    for this key, the previous (pre-edit) value is snapshotted first
 *    so the very first edit remains reversible.
 *  - The check-and-insert sequence is serialized per-key using a
 *    Postgres transaction-scoped advisory lock keyed on a stable hash
 *    of `(system_key, prompt_kind)`. Concurrent saves for the same
 *    prompt block each other for the duration of the dedupe; concurrent
 *    saves for different prompts run in parallel.
 */
export async function dbRecordPromptRevision(
  systemKey: string,
  promptKind: string,
  newText: string,
  previousText?: string | null,
): Promise<void> {
  if (typeof newText !== 'string') return
  try {
    await ensureRevisionsTable()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Per-key serialization. Released automatically at COMMIT/ROLLBACK.
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`apr:${systemKey}:${promptKind}`],
      )

      const lastRes = await client.query<{ prompt_text: string }>(
        `SELECT prompt_text FROM ai_prompt_revisions
         WHERE system_key = $1 AND prompt_kind = $2
         ORDER BY created_at DESC LIMIT 1`,
        [systemKey, promptKind],
      )
      const hasHistory = (lastRes.rowCount ?? 0) > 0
      const latestText = hasHistory ? lastRes.rows[0].prompt_text : null

      // Backfill baseline on very first edit so rollback is possible.
      if (!hasHistory && typeof previousText === 'string' && previousText !== newText) {
        await client.query(
          `INSERT INTO ai_prompt_revisions (system_key, prompt_kind, prompt_text)
           VALUES ($1, $2, $3)`,
          [systemKey, promptKind, previousText],
        )
      }

      const effectiveLatest = hasHistory
        ? latestText
        : (typeof previousText === 'string' ? previousText : null)
      if (effectiveLatest !== newText) {
        await client.query(
          `INSERT INTO ai_prompt_revisions (system_key, prompt_kind, prompt_text)
           VALUES ($1, $2, $3)`,
          [systemKey, promptKind, newText],
        )
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw e
    } finally {
      client.release()
    }
  } catch (err) {
    // Never let revision logging break the underlying save — just log it.
    console.error('[prompt-revisions] failed to record:', err)
  }
}

export interface PromptRevision {
  id: number
  systemKey: string
  promptKind: string
  promptText: string
  createdAt: string
}

export async function dbListPromptRevisions(
  systemKey: string,
  promptKind: string,
  limit = 50,
): Promise<PromptRevision[]> {
  await ensureRevisionsTable()
  const rows = await query<{
    id: number; system_key: string; prompt_kind: string; prompt_text: string; created_at: Date
  }>(
    `SELECT id, system_key, prompt_kind, prompt_text, created_at
     FROM ai_prompt_revisions
     WHERE system_key = $1 AND prompt_kind = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [systemKey, promptKind, Math.max(1, Math.min(200, limit))],
  )
  return rows.map((r) => ({
    id: r.id,
    systemKey: r.system_key,
    promptKind: r.prompt_kind,
    promptText: r.prompt_text,
    createdAt: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
  }))
}

export async function dbGetPromptRevision(id: number): Promise<PromptRevision | null> {
  await ensureRevisionsTable()
  const row = await queryOne<{
    id: number; system_key: string; prompt_kind: string; prompt_text: string; created_at: Date
  }>(
    `SELECT id, system_key, prompt_kind, prompt_text, created_at
     FROM ai_prompt_revisions WHERE id = $1`,
    [id],
  )
  if (!row) return null
  return {
    id: row.id,
    systemKey: row.system_key,
    promptKind: row.prompt_kind,
    promptText: row.prompt_text,
    createdAt: (row.created_at instanceof Date ? row.created_at : new Date(row.created_at)).toISOString(),
  }
}

export async function dbUpdateApiKeys(data: Record<string, string>) {
  // Task #15 — detect an active-provider switch BEFORE upserting so we can
  // remap every AI System's stored model to the equivalent tier afterwards.
  let providerSwitch: AiProvider | null = null
  if (typeof data.ai_provider === 'string') {
    const incoming: AiProvider = data.ai_provider === 'openai' ? 'openai' : 'anthropic'
    const cur = await queryOne<{ value: string }>(
      `SELECT value FROM integrations WHERE key = 'ai_provider'`,
    )
    const current: AiProvider = cur?.value === 'openai' ? 'openai' : 'anthropic'
    if (incoming !== current) providerSwitch = incoming
  }

  for (const [key, value] of Object.entries(data)) {
    if (key === 'weglot') continue
    await query(
      `INSERT INTO integrations (key, label, value, updated_at)
       VALUES ($2, $2, $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [value, key]
    )
  }

  if (providerSwitch) await dbRemapAiModelsForProvider(providerSwitch)
}

/**
 * Task #15/#16 — re-point every AI System's stored model id to `provider` when
 * the admin switches the active provider, so saved configs never reference a
 * model id from the wrong provider.
 *
 * Task #16: per-provider model choices are remembered. Before switching a row we
 * stash its current (pre-switch) model under its own provider in
 * `extra_config.providerModels`. When switching to a provider the admin has
 * previously hand-picked a model for, we RESTORE that exact choice instead of
 * re-deriving it from tier. Tier-based equivalence (Haiku⇄gpt-4o-mini,
 * Sonnet⇄gpt-4o, Opus⇄gpt-4.1) remains the default for first-time switches.
 */
export async function dbRemapAiModelsForProvider(provider: AiProvider) {
  const rows = await query<{ system_key: string; model: string | null; extra_config: unknown }>(
    `SELECT system_key, model, extra_config FROM ai_system_configs`,
  )
  for (const row of rows) {
    const extra: Record<string, unknown> =
      row.extra_config && typeof row.extra_config === 'object'
        ? { ...(row.extra_config as Record<string, unknown>) }
        : {}
    const providerModels: Record<string, string> =
      extra.providerModels && typeof extra.providerModels === 'object'
        ? { ...(extra.providerModels as Record<string, string>) }
        : {}

    // Remember the current model under its own provider so a later switch back
    // restores the admin's hand-picked choice rather than re-deriving from tier.
    const current = row.model ?? ''
    const currentProvider = current ? providerOf(current) : null
    if (currentProvider && current) providerModels[currentProvider] = current

    // Restore a previously saved choice for the target provider when present
    // (and still valid for it); otherwise fall back to the tier equivalent.
    const saved = providerModels[provider]
    const next =
      saved && providerOf(saved) === provider ? saved : equivalentModel(current, provider)

    const nextExtra = JSON.stringify({ ...extra, providerModels })
    if (next === row.model && nextExtra === JSON.stringify(extra)) continue
    await query(
      `UPDATE ai_system_configs SET model = $1, extra_config = $2::jsonb, updated_at = NOW() WHERE system_key = $3`,
      [next, nextExtra, row.system_key],
    )
  }
}

export async function dbUpdateWeglot(data: Record<string, unknown>) {
  const apiKey = (data.apiKey as string) ?? ''
  const meta = { ...data }
  delete meta.apiKey
  await query(`UPDATE integrations SET value = $1, meta = $2, updated_at = NOW() WHERE key = 'weglot'`, [apiKey, JSON.stringify(meta)])
}

export async function dbUpdateAiSystem(systemKey: string, config: Record<string, unknown>) {
  // Capture the pre-edit value so the very first revision can preserve
  // the baseline (allows rollback of the first save).
  const beforeRow = typeof config.systemPrompt === 'string'
    ? await queryOne<{ system_prompt: string }>(
        `SELECT system_prompt FROM ai_system_configs WHERE system_key = $1`,
        [systemKey],
      )
    : null
  // Upsert (was UPDATE-only). Guarantees that a fresh DB or a missing
  // row doesn't silently swallow the save — important because the
  // Trip Chat admin page now writes per-trip fields AND planner
  // extra_config in parallel; if `chat` didn't exist, the other call
  // would create the row with empty system_prompt/model and this UPDATE
  // would no-op, leaving the per-trip fields blank.
  await query(`
    INSERT INTO ai_system_configs (system_key, label, system_prompt, model, temperature, max_tokens)
    VALUES ($5, $5, COALESCE($1, ''), COALESCE($2, 'anthropic/claude-opus-4.6'), COALESCE($3, 0.7), COALESCE($4, 1024))
    ON CONFLICT (system_key) DO UPDATE SET
      system_prompt = COALESCE($1, ai_system_configs.system_prompt),
      model = COALESCE($2, ai_system_configs.model),
      temperature = COALESCE($3, ai_system_configs.temperature),
      max_tokens = COALESCE($4, ai_system_configs.max_tokens),
      updated_at = NOW()
  `, [config.systemPrompt ?? null, config.model ?? null, config.temperature ?? null, config.maxTokens ?? null, systemKey])
  // Snapshot the new prompt for revision history (no-op if unchanged).
  if (typeof config.systemPrompt === 'string') {
    await dbRecordPromptRevision(
      systemKey,
      'systemPrompt',
      config.systemPrompt,
      beforeRow?.system_prompt ?? null,
    )
  }
}

export async function dbUpdateAiSystemExtra(systemKey: string, extra: Record<string, unknown>) {
  await query(
    `UPDATE ai_system_configs
     SET extra_config = COALESCE(extra_config, '{}')::jsonb || $1::jsonb, updated_at = NOW()
     WHERE system_key = $2`,
    [JSON.stringify(extra), systemKey],
  )
}

export async function dbUpdatePlannerBehavior(data: Record<string, unknown>) {
  // Preserve the per-provider model memory (Task #16) — it lives in
  // extra_config.providerModels and must survive this wholesale rewrite of the
  // planner's behavior config.
  const existing = await queryOne<{ extra_config: unknown }>(
    `SELECT extra_config FROM ai_system_configs WHERE system_key = 'planner'`,
  )
  const existingExtra =
    existing?.extra_config && typeof existing.extra_config === 'object'
      ? (existing.extra_config as Record<string, unknown>)
      : {}
  const next: Record<string, unknown> = { ...data }
  if (existingExtra.providerModels && next.providerModels === undefined) {
    next.providerModels = existingExtra.providerModels
  }
  await query(`
    UPDATE ai_system_configs 
    SET extra_config = $1, updated_at = NOW()
    WHERE system_key = 'planner'
  `, [JSON.stringify(next)])
}

// Returns the merged, enabled custom HTML for public-site injection.
// `header` = everything not placed at body_end (head + body_start blocks),
// `footer` = body_end blocks. Mirrors the merge semantics in dbGetSettings.
export async function dbGetInjectionBlocks(): Promise<{ header: string; footer: string }> {
  const rows = await query<{ name: string; label: string; placement: string; html: string | null }>(`
    SELECT name, label, placement, html FROM header_footer_blocks
    WHERE enabled = true AND html IS NOT NULL AND html != ''
      AND name != 'announcement_banner'
    ORDER BY placement, name
  `)
  const merge = (pred: (placement: string) => boolean) =>
    rows
      .filter((r) => pred(r.placement))
      .map((r) => `<!-- ${r.label} -->\n${r.html}`)
      .join('\n\n')
  return {
    header: merge((p) => p !== 'body_end'),
    footer: merge((p) => p === 'body_end'),
  }
}

export async function dbUpdateHeaderFooter(section: 'header' | 'footer', customHtml: string) {
  // NOTE: the structured announcement banner now owns the `announcement_banner`
  // row's job (see dbGetAnnouncement), so the header tab's raw code-injection
  // target is `head_scripts` — keeping the two systems fully separate.
  const blockName = section === 'header' ? 'head_scripts' : 'chat_widget'
  await query(`
    UPDATE header_footer_blocks 
    SET html = $1, enabled = ($1 != '' AND $1 IS NOT NULL), updated_at = NOW()
    WHERE name = $2
  `, [customHtml, blockName])
}

// ── Announcement banner storage ─────────────────────────────────────────────

export async function dbGetAnnouncement(): Promise<Announcement> {
  const row = await queryOne<{ value: string | null; meta: unknown }>(
    `SELECT value, meta FROM integrations WHERE key = 'announcement'`,
  )
  if (!row) return { enabled: false, content: '', size: 'md', align: 'center', bgColor: '', textColor: '' }
  return readAnnouncementRow(row.value, row.meta)
}

export async function dbUpdateAnnouncement(data: {
  enabled?: boolean
  content?: string
  size?: string
  align?: string
  bgColor?: string
  textColor?: string
}): Promise<Announcement> {
  const content = sanitizeRichText(typeof data.content === 'string' ? data.content : '')
  const size: AnnouncementSize = data.size === 'sm' || data.size === 'lg' ? data.size : 'md'
  const align: AnnouncementAlign = data.align === 'left' || data.align === 'right' ? data.align : 'center'
  const bgColor = sanitizeCssColor(typeof data.bgColor === 'string' ? data.bgColor : '')
  const textColor = sanitizeCssColor(typeof data.textColor === 'string' ? data.textColor : '')
  const meta = { enabled: data.enabled === true, size, align, bgColor, textColor }
  await query(
    `INSERT INTO integrations (key, label, value, meta)
     VALUES ('announcement', 'Announcement Banner', $1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $1, meta = $2::jsonb, updated_at = NOW()`,
    [content, JSON.stringify(meta)],
  )
  return { enabled: meta.enabled, content, size, align, bgColor, textColor }
}

// ── Taxonomies ─────────────────────────────────────────────────────────────

export async function dbListTaxonomies() {
  return query(`
    SELECT id, key, label, value, group_key as "groupKey", created_at, updated_at
    FROM taxonomies ORDER BY group_key, key
  `)
}

export async function dbGetTaxonomy(key: string) {
  return queryOne(`SELECT id, key, label, value, group_key as "groupKey" FROM taxonomies WHERE key = $1`, [key])
}

export async function dbCreateTaxonomy(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO taxonomies (key, label, value, group_key)
    VALUES ($1,$2,$3,$4) RETURNING *
  `, [data.key, data.label ?? data.key, data.value ?? '', data.groupKey ?? (String(data.key).split('_')[0])])
  return rows[0]
}

export async function dbUpsertTaxonomies(items: { key: string; value: string }[]) {
  let count = 0
  for (const item of items) {
    await query(`
      INSERT INTO taxonomies (key, label, value, group_key)
      VALUES ($1,$1,$2,$3)
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, [item.key, item.value, item.key.split('_')[0]])
    count++
  }
  return count
}

export async function dbDeleteTaxonomy(key: string) {
  await query(`DELETE FROM taxonomies WHERE key = $1`, [key])
}

// ── Pages ──────────────────────────────────────────────────────────────────

export async function dbListPages() {
  return query(`
    SELECT id, slug, title, description, url, status, is_system_page as "isSystemPage",
           seo_title as "seoTitle", seo_description as "seoDescription",
           created_at, updated_at
    FROM pages ORDER BY is_system_page DESC, title
  `)
}

export async function dbGetPage(id: string) {
  return queryOne(`
    SELECT id, slug, title, description, url, content, status, is_system_page as "isSystemPage",
           seo_title as "seoTitle", seo_description as "seoDescription", og_image as "ogImage",
           template, created_at, updated_at
    FROM pages WHERE id = $1
  `, [id])
}

export async function dbGetPageBySlug(slug: string) {
  return queryOne(`
    SELECT id, slug, title, description, url, content, status, is_system_page as "isSystemPage",
           seo_title as "seoTitle", seo_description as "seoDescription"
    FROM pages WHERE slug = $1
  `, [slug])
}

export async function dbCreatePage(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO pages (slug, title, description, url, content, status, is_system_page, seo_title, seo_description)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [
    data.slug, data.title, data.description ?? null, data.url ?? ('/' + data.slug),
    JSON.stringify(data.content ?? {}), data.status ?? 'draft',
    data.isSystemPage ?? false, data.seoTitle ?? null, data.seoDescription ?? null,
  ])
  return rows[0]
}

export async function dbUpdatePage(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    title: 'title', description: 'description', url: 'url', status: 'status',
    content: 'content', seoTitle: 'seo_title', seoDescription: 'seo_description', ogImage: 'og_image',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) {
      sets.push(`${col} = $${i++}`)
      vals.push(key === 'content' ? JSON.stringify(data[key]) : data[key])
    }
  }
  if (sets.length === 0) return dbGetPage(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE pages SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeletePage(id: string) {
  await query(`DELETE FROM pages WHERE id = $1`, [id])
}

export async function dbGetPageRevisions(pageId: string) {
  return query(`
    SELECT id, page_id as "pageId", revision_number as "revisionNumber",
           title, label, status, created_at, created_by as "createdBy"
    FROM page_revisions WHERE page_id = $1 ORDER BY revision_number DESC
  `, [pageId])
}

export async function dbCreatePageRevision(pageId: string, data: Record<string, unknown>, label?: string) {
  const maxRows = await query(`SELECT COALESCE(MAX(revision_number), 0) as max FROM page_revisions WHERE page_id = $1`, [pageId])
  const nextNum = (parseInt((maxRows[0] as Record<string, string>).max, 10) || 0) + 1
  const rows = await query(`
    INSERT INTO page_revisions (page_id, revision_number, title, content, status, seo_title, seo_description, label)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [
    pageId, nextNum, data.title ?? null,
    JSON.stringify(data.content ?? {}), data.status ?? 'published',
    data.seoTitle ?? null, data.seoDescription ?? null, label ?? 'Auto-save',
  ])
  return rows[0]
}

export async function dbRestorePageRevision(pageId: string, revisionId: string) {
  const rev = await queryOne(`SELECT * FROM page_revisions WHERE id = $1 AND page_id = $2`, [revisionId, pageId])
  if (!rev) return null
  const r = rev as Record<string, unknown>
  await dbUpdatePage(pageId, { title: r.title, content: r.content, status: r.status, seoTitle: r.seo_title, seoDescription: r.seo_description })
  const newRev = await dbCreatePageRevision(pageId, r, `Restored from revision #${r.revision_number}`)
  return newRev
}

// ── Page content ───────────────────────────────────────────────────────────

export async function dbGetPageContent(slug: string) {
  const rows = await query(`
    SELECT element_id, content FROM page_content WHERE page_slug = $1
  `, [slug])
  const result: Record<string, string> = {}
  for (const row of rows as { element_id: string; content: string }[]) {
    result[row.element_id] = row.content
  }
  return result
}

export async function dbSavePageContent(pageSlug: string, changes: Record<string, string>) {
  let saved = 0
  for (const [elementId, content] of Object.entries(changes)) {
    await query(`
      INSERT INTO page_content (page_slug, element_id, content)
      VALUES ($1,$2,$3)
      ON CONFLICT (page_slug, element_id) DO UPDATE SET content = $3, updated_at = NOW()
    `, [pageSlug, elementId, content])
    saved++
  }
  return saved
}

// ── Dashboard stats ────────────────────────────────────────────────────────

export async function dbGetDashboardStats() {
  const rows = await query(`
    SELECT
      (SELECT COUNT(*) FROM trips) as "totalTrips",
      (SELECT COUNT(*) FROM trips WHERE status = 'published') as "publishedTrips",
      (SELECT COUNT(*) FROM trips WHERE status = 'draft') as "draftTrips",
      (SELECT COUNT(*) FROM trips WHERE featured = true) as "featuredTrips",
      (SELECT COUNT(*) FROM blog_posts) as "totalPosts",
      (SELECT COUNT(*) FROM blog_posts WHERE status = 'published') as "publishedPosts",
      (SELECT COUNT(*) FROM jobs) as "totalJobs",
      (SELECT COUNT(*) FROM jobs WHERE status = 'open') as "openJobs",
      (SELECT COUNT(*) FROM job_applications) as "totalApplications",
      (SELECT COUNT(*) FROM job_applications WHERE status = 'new') as "newApplications",
      (SELECT COUNT(*) FROM support_tickets) as "totalTickets",
      (SELECT COUNT(*) FROM support_tickets WHERE status = 'open') as "openTickets",
      (SELECT COUNT(*) FROM help_articles) as "totalHelpArticles"
  `)
  const r = rows[0] as Record<string, string>
  return {
    trips: { total: +r.totalTrips, published: +r.publishedTrips, draft: +r.draftTrips, featured: +r.featuredTrips },
    posts: { total: +r.totalPosts, published: +r.publishedPosts, draft: +r.totalPosts - +r.publishedPosts },
    jobs: { total: +r.totalJobs, open: +r.openJobs, closed: +r.totalJobs - +r.openJobs },
    applications: { total: +r.totalApplications, new: +r.newApplications },
    tickets: { total: +r.totalTickets, open: +r.openTickets },
    helpArticles: { total: +r.totalHelpArticles },
  }
}

// ── Departures ─────────────────────────────────────────────────────────────

export async function dbListDepartures() {
  return query(`
    SELECT id, trip_id as "tripId", trip_title as "tripTitle", trip_image as "tripImage",
           category, city, to_char(date, 'YYYY-MM-DD') as date,
           to_char(time, 'HH24:MI') as time,
           spots_total as "spotsTotal", spots_booked as "spotsBooked",
           guide_id as "guideId", guide_name as "guideName",
           status, price::float, created_at as "createdAt"
    FROM departures ORDER BY date ASC, time ASC
  `)
}

export async function dbGetDeparture(id: string) {
  return queryOne<Record<string, unknown>>(`
    SELECT id, trip_id as "tripId", trip_title as "tripTitle", trip_image as "tripImage",
           category, city, to_char(date, 'YYYY-MM-DD') as date,
           to_char(time, 'HH24:MI') as time,
           spots_total as "spotsTotal", spots_booked as "spotsBooked",
           guide_id as "guideId", guide_name as "guideName",
           status, price::float
    FROM departures WHERE id = $1
  `, [id])
}

export async function dbCreateDeparture(data: Record<string, unknown>) {
  return queryOne<Record<string, unknown>>(`
    INSERT INTO departures (trip_id, trip_title, trip_image, category, city, date, time,
                            spots_total, spots_booked, guide_id, guide_name, status, price)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id, trip_id as "tripId", trip_title as "tripTitle", trip_image as "tripImage",
              category, city, to_char(date, 'YYYY-MM-DD') as date,
              to_char(time, 'HH24:MI') as time,
              spots_total as "spotsTotal", spots_booked as "spotsBooked",
              guide_id as "guideId", guide_name as "guideName",
              status, price::float
  `, [
    data.tripId ?? "", data.tripTitle ?? "", data.tripImage ?? "",
    data.category ?? "Tours", data.city ?? "Luxembourg",
    data.date ?? new Date().toISOString().slice(0,10),
    data.time ?? "09:00",
    data.spotsTotal ?? 20, data.spotsBooked ?? 0,
    data.guideId ?? "", data.guideName ?? "",
    data.status ?? "scheduled",
    data.price ?? 0,
  ])
}

export async function dbUpdateDeparture(id: string, data: Record<string, unknown>) {
  const fields: string[] = []
  const values: unknown[] = []
  let i = 1
  const map: Record<string, string> = {
    tripId: "trip_id", tripTitle: "trip_title", tripImage: "trip_image",
    category: "category", city: "city", date: "date", time: "time",
    spotsTotal: "spots_total", spotsBooked: "spots_booked",
    guideId: "guide_id", guideName: "guide_name", status: "status", price: "price",
  }
  for (const [k, col] of Object.entries(map)) {
    if (k in data) { fields.push(`${col} = $${i++}`); values.push(data[k]) }
  }
  if (!fields.length) return dbGetDeparture(id)
  fields.push(`updated_at = NOW()`)
  values.push(id)
  return queryOne<Record<string, unknown>>(
    `UPDATE departures SET ${fields.join(", ")} WHERE id = $${i} RETURNING id`,
    values
  )
}

export async function dbDeleteDeparture(id: string) {
  return query(`DELETE FROM departures WHERE id = $1`, [id])
}

// ── Integrations (dedicated table) ────────────────────────────────────────

export async function dbListIntegrations() {
  return query(`SELECT key, label, value, updated_at FROM integrations ORDER BY label`)
}

export async function dbGetIntegration(key: string) {
  return queryOne<{ key: string; label: string; value: string }>(
    `SELECT key, label, value FROM integrations WHERE key = $1`, [key]
  )
}

/** Resolve the public Weglot API key. Admin-panel DB key (integrations.weglot)
 *  is the source of truth; env NEXT_PUBLIC_WEGLOT_API_KEY is a dev fallback.
 *  Returns "" when neither is set so the loader simply stays off. */
export async function dbGetWeglotApiKey(): Promise<string> {
  let key = ""
  try {
    const row = await dbGetIntegration("weglot")
    key = (row?.value ?? "").trim()
  } catch {
    /* DB unavailable — fall through to env */
  }
  if (!key) key = (process.env.NEXT_PUBLIC_WEGLOT_API_KEY ?? "").trim()
  return key
}

export async function dbUpsertIntegration(key: string, label: string, value: string) {
  return queryOne<{ key: string }>(
    `INSERT INTO integrations (key, label, value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label, updated_at = NOW()
     RETURNING key`,
    [key, label, value]
  )
}

// ── Palisis Sync Log ─────────────────────────────────────────────────────────

export async function dbInsertPalisisSyncLog(data: {
  trigger_type: string
  action: string
  note?: string
  changes?: Record<string, unknown>
  palisis_id?: string
  triggered_by?: string
}) {
  return queryOne(
    `INSERT INTO palisis_sync_log (id, trigger_type, palisis_id, action, changes, triggered_by, note, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5::uuid, $6, NOW())
     RETURNING id`,
    [
      data.trigger_type,
      data.palisis_id ?? null,
      data.action,
      data.changes ? JSON.stringify(data.changes) : null,
      data.triggered_by ?? null,
      data.note ?? null,
    ]
  )
}

export async function dbListPalisisSyncLogs(limit = 20, offset = 0) {
  return query<{
    id: string
    trigger_type: string
    palisis_id: string | null
    action: string
    changes: Record<string, unknown> | null
    note: string | null
    created_at: string
  }>(
    `SELECT id, trigger_type, palisis_id, action, changes, note, created_at
     FROM palisis_sync_log
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
}

export async function dbCountPalisisSyncLogs() {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM palisis_sync_log`,
    []
  )
  return parseInt(rows[0]?.count ?? "0", 10)
}

// ── Admin / employee user management ────────────────────────────────────────

import { hash as bcryptHash } from "bcryptjs"
import { sanitizePermissions } from "@/lib/admin-permissions"

export interface AdminUserRow {
  id: string
  email: string | null
  username: string | null
  name: string
  role: string
  permissions: string[]
  is_active: boolean
  last_login: string | null
  created_at: string
  file_rules: { maxSizeMb?: number; allowedExtensions?: string[] } | null
}

const ADMIN_USER_SELECT = `
  id, email, username, name, role, permissions, is_active,
  last_login, created_at, file_rules`

export async function dbListAdminUsers(): Promise<AdminUserRow[]> {
  return query<AdminUserRow>(
    `SELECT ${ADMIN_USER_SELECT} FROM admin_users ORDER BY
       CASE WHEN role = 'superadmin' THEN 0 ELSE 1 END, created_at ASC`,
    [],
  )
}

export async function dbGetAdminUser(id: string): Promise<AdminUserRow | null> {
  return queryOne<AdminUserRow>(
    `SELECT ${ADMIN_USER_SELECT} FROM admin_users WHERE id = $1`,
    [id],
  )
}

/**
 * Create an "employee" account. Employees authenticate with a username (email is
 * optional). Permissions are validated against the known section list.
 */
export async function dbCreateEmployee(input: {
  username: string
  name: string
  password: string
  permissions: unknown
  email?: string | null
}): Promise<AdminUserRow> {
  const username = input.username.trim()
  const passwordHash = await bcryptHash(input.password, 12)
  const permissions = sanitizePermissions(input.permissions)
  const email = input.email?.trim() ? input.email.trim() : null

  const row = await queryOne<AdminUserRow>(
    `INSERT INTO admin_users (username, email, name, password_hash, role, permissions, is_active)
     VALUES ($1, $2, $3, $4, 'employee', $5::jsonb, true)
     RETURNING ${ADMIN_USER_SELECT}`,
    [username, email, input.name.trim(), passwordHash, JSON.stringify(permissions)],
  )
  if (!row) throw new Error("Failed to create employee account")
  return row
}

/**
 * Update an employee account. Only mutable fields are touched; the password is
 * only changed when a non-empty value is supplied. The superadmin account's role
 * is never demoted here.
 */
export async function dbUpdateAdminUser(
  id: string,
  patch: {
    name?: string
    username?: string
    email?: string | null
    permissions?: unknown
    is_active?: boolean
    password?: string
  },
): Promise<AdminUserRow | null> {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1

  if (patch.name !== undefined) { sets.push(`name = $${i++}`); vals.push(patch.name.trim()) }
  if (patch.username !== undefined) { sets.push(`username = $${i++}`); vals.push(patch.username.trim()) }
  if (patch.email !== undefined) {
    sets.push(`email = $${i++}`)
    vals.push(patch.email && patch.email.trim() ? patch.email.trim() : null)
  }
  if (patch.permissions !== undefined) {
    sets.push(`permissions = $${i++}::jsonb`)
    vals.push(JSON.stringify(sanitizePermissions(patch.permissions)))
  }
  if (patch.is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(patch.is_active) }
  if (patch.password && patch.password.trim()) {
    sets.push(`password_hash = $${i++}`)
    vals.push(await bcryptHash(patch.password, 12))
  }

  if (sets.length === 0) return dbGetAdminUser(id)

  sets.push(`updated_at = NOW()`)
  vals.push(id)

  return queryOne<AdminUserRow>(
    `UPDATE admin_users SET ${sets.join(", ")}
      WHERE id = $${i} AND role <> 'superadmin'
      RETURNING ${ADMIN_USER_SELECT}`,
    vals,
  )
}

/** Delete an employee account. The superadmin account cannot be deleted. */
export async function dbDeleteAdminUser(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM admin_users WHERE id = $1 AND role <> 'superadmin' RETURNING id`,
    [id],
  )
  return !!row
}

// ── File-upload rules (global default + per-role) ────────────────────────────
// All file-rule config lives in a single integrations row (key
// `file_upload_rules`). The global default sits at meta.{maxSizeMb,
// allowedExtensions}; per-role overrides sit at meta.roles[role]. Keeping it in
// one row avoids polluting the integrations listing with extra keys.

type RuleObj = { maxSizeMb: number; allowedExtensions: string[] }
type RulesMeta = {
  maxSizeMb?: number
  allowedExtensions?: string[]
  roles?: Record<string, RuleObj>
}

// ── Palisis importer settings ───────────────────────────────────────────────
// Admin-default list of trip fields that an OVERRIDE import must NOT overwrite
// (kept as-is from our DB even when "Override existing trips" is checked). Stored
// as a JSON array string in a single integrations row to avoid extra key clutter.

/** Read the admin-default excluded override fields for the Palisis importer. */
export async function dbGetImportExcludedFields(): Promise<string[]> {
  const row = await queryOne<{ value: string | null }>(
    `SELECT value FROM integrations WHERE key = 'palisis_import_excluded_fields'`,
    [],
  )
  return parseExcludedFields(row?.value)
}

/** Upsert the admin-default excluded override fields for the Palisis importer. */
export async function dbSetImportExcludedFields(fields: unknown): Promise<void> {
  const clean = sanitizeExcludedFields(fields)
  await query(
    `INSERT INTO integrations (key, label, value, updated_at)
     VALUES ('palisis_import_excluded_fields', 'Palisis Import — excluded override fields', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(clean)],
  )
}

/** Read the raw file-rules meta object (global + roles) from the one row. */
async function dbReadFileRulesMeta(): Promise<RulesMeta> {
  const row = await queryOne<{ meta: unknown }>(
    `SELECT meta FROM integrations WHERE key = 'file_upload_rules'`,
    [],
  )
  return (row?.meta as RulesMeta) ?? {}
}

/** Upsert the full file-rules meta object back into the one row. */
async function dbWriteFileRulesMeta(meta: RulesMeta): Promise<void> {
  await query(
    `INSERT INTO integrations (key, label, value, meta)
     VALUES ('file_upload_rules', 'File Upload Rules', '', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET meta = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify(meta)],
  )
}

/** Read the global default file-upload rules from the integrations table. */
export async function dbGetGlobalFileRules(): Promise<{
  maxSizeMb?: number
  allowedExtensions?: string[]
} | null> {
  const meta = await dbReadFileRulesMeta()
  if (meta.maxSizeMb == null && meta.allowedExtensions == null) return null
  return { maxSizeMb: meta.maxSizeMb, allowedExtensions: meta.allowedExtensions }
}

/** Upsert the global default file-upload rules (preserving per-role overrides). */
export async function dbSetGlobalFileRules(rules: {
  maxSizeMb: number
  allowedExtensions: string[]
}): Promise<void> {
  const meta = await dbReadFileRulesMeta()
  await dbWriteFileRulesMeta({
    ...meta,
    maxSizeMb: rules.maxSizeMb,
    allowedExtensions: rules.allowedExtensions,
  })
}

/** Read the per-role file-upload override (null = role inherits global). */
export async function dbGetRoleFileRules(role: string): Promise<RuleObj | null> {
  const meta = await dbReadFileRulesMeta()
  return meta.roles?.[role] ?? null
}

/** Read all per-role file-upload overrides as a { role: rules } map. */
export async function dbGetAllRoleFileRules(): Promise<Record<string, RuleObj>> {
  const meta = await dbReadFileRulesMeta()
  return meta.roles ?? {}
}

/** Set (or clear, when rules is null) the per-role file-upload override. */
export async function dbSetRoleFileRules(
  role: string,
  rules: RuleObj | null,
): Promise<void> {
  const meta = await dbReadFileRulesMeta()
  const roles = { ...(meta.roles ?? {}) }
  if (rules == null) delete roles[role]
  else roles[role] = rules
  await dbWriteFileRulesMeta({ ...meta, roles })
}

/**
 * Return the raw (unresolved) global + role-override rule objects for a given
 * user, resolved by the user's role. The caller resolves them with
 * lib/file-rules resolveEffectiveRules().
 */
export async function dbGetFileRuleSources(userId: string): Promise<{
  global: unknown
  override: unknown
}> {
  const user = await queryOne<{ role: string }>(
    `SELECT role FROM admin_users WHERE id = $1`,
    [userId],
  )
  const meta = await dbReadFileRulesMeta()
  const global =
    meta.maxSizeMb == null && meta.allowedExtensions == null
      ? null
      : { maxSizeMb: meta.maxSizeMb, allowedExtensions: meta.allowedExtensions }
  const override = user?.role ? meta.roles?.[user.role] ?? null : null
  return { global, override }
}

// ── Media library (Files) ───────────────────────────────────────────────────

export interface MediaFileRow {
  id: string
  filename: string
  title: string | null
  url: string
  mime_type: string
  size_bytes: number
  storage: string
  content_hash: string | null
  source_url: string | null
  uploaded_by: string | null
  uploader_name: string | null
  created_at: string
}

const MEDIA_SELECT = `
  id, filename, title, url, mime_type, size_bytes::int AS size_bytes,
  storage, content_hash, source_url, uploaded_by,
  (SELECT name FROM admin_users WHERE id = media_files.uploaded_by) AS uploader_name,
  created_at`

export async function dbListMedia(): Promise<MediaFileRow[]> {
  return query<MediaFileRow>(
    `SELECT ${MEDIA_SELECT} FROM media_files ORDER BY created_at DESC`,
    [],
  )
}

export async function dbGetMedia(id: string): Promise<MediaFileRow | null> {
  return queryOne<MediaFileRow>(
    `SELECT ${MEDIA_SELECT} FROM media_files WHERE id = $1`,
    [id],
  )
}

// Deduplication lookup: find an existing media row by its content hash so the
// same bytes are never stored (or recorded) twice.
export async function dbFindMediaByHash(hash: string): Promise<MediaFileRow | null> {
  if (!hash) return null
  return queryOne<MediaFileRow>(
    `SELECT ${MEDIA_SELECT} FROM media_files WHERE content_hash = $1 ORDER BY created_at ASC LIMIT 1`,
    [hash],
  )
}

// Inserts a media row, deduplicating atomically on content_hash via the unique
// partial index (race-safe — two concurrent identical uploads can't both win).
// Returns `created: false` when an identical row already existed so the caller
// can clean up the just-stored orphan file.
export async function dbCreateMedia(input: {
  filename: string
  title?: string | null
  url: string
  mimeType: string
  sizeBytes: number
  storage: string
  contentHash?: string | null
  sourceUrl?: string | null
  uploadedBy?: string | null
}): Promise<{ row: MediaFileRow; created: boolean }> {
  const params = [
    input.filename,
    input.title ?? null,
    input.url,
    input.mimeType,
    Math.round(input.sizeBytes),
    input.storage,
    input.contentHash ?? null,
    input.sourceUrl ?? null,
    input.uploadedBy ?? null,
  ]
  // ON CONFLICT targets the partial unique index; a NULL hash never conflicts
  // (NULLs are distinct) so hashless inserts always succeed.
  const inserted = await queryOne<MediaFileRow>(
    `INSERT INTO media_files (filename, title, url, mime_type, size_bytes, storage, content_hash, source_url, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (content_hash) WHERE content_hash IS NOT NULL DO NOTHING
     RETURNING ${MEDIA_SELECT}`,
    params,
  )
  if (inserted) return { row: inserted, created: true }

  // Conflict (lost a race) — return the winning existing row.
  const existing = input.contentHash ? await dbFindMediaByHash(input.contentHash) : null
  if (existing) return { row: existing, created: false }
  throw new Error("Failed to record uploaded file")
}

// Lookup used by the URL-import pipeline to skip re-downloading a remote asset
// we've already imported (e.g. a Palisis CDN image fetched on a prior sync).
export async function dbFindMediaBySourceUrl(sourceUrl: string): Promise<MediaFileRow | null> {
  if (!sourceUrl) return null
  return queryOne<MediaFileRow>(
    `SELECT ${MEDIA_SELECT} FROM media_files WHERE source_url = $1 ORDER BY created_at ASC LIMIT 1`,
    [sourceUrl],
  )
}

// Record where an existing media row was originally fetched from, but only when
// it isn't already attributed to a source — so a later import of the same bytes
// from a different URL doesn't clobber the first attribution.
export async function dbSetMediaSourceUrlIfNull(id: string, sourceUrl: string): Promise<void> {
  if (!id || !sourceUrl) return
  await query(
    `UPDATE media_files SET source_url = $2 WHERE id = $1 AND source_url IS NULL`,
    [id, sourceUrl],
  )
}

export interface MediaUsageRef {
  type: string
  label: string
  id: string
  title: string
  href: string | null
}

// Finds everywhere a media file's URL is referenced across the CMS so the Files
// preview can show what a file is "linked with". Matches both the relative URL
// and any absolute form (we only have the stored URL, so we match the stored
// value as a substring — robust to relative/absolute storage).
export async function dbFindMediaUsage(url: string): Promise<MediaUsageRef[]> {
  if (!url) return []
  const like = `%${url}%`
  const out: MediaUsageRef[] = []

  const blog = await query<{ id: string; title: string }>(
    `SELECT id, COALESCE(NULLIF(title,''), slug, 'Untitled post') AS title
       FROM blog_posts WHERE image = $1 OR body LIKE $2`,
    [url, like],
  )
  for (const r of blog) out.push({ type: "blog", label: "Blog post", id: r.id, title: r.title, href: `/admin/blog/${r.id}` })

  const trips = await query<{ id: string; title: string }>(
    `SELECT id, COALESCE(NULLIF(title,''), 'Untitled trip') AS title
       FROM trips
      WHERE image = $1 OR pdf_url = $1 OR video_url = $1
         OR $1 = ANY(COALESCE(gallery, '{}'))`,
    [url],
  )
  for (const r of trips) out.push({ type: "trip", label: "Trip", id: r.id, title: r.title, href: `/admin/trips/${r.id}` })

  const help = await query<{ id: string; title: string }>(
    `SELECT id, COALESCE(NULLIF(question,''), 'Help article') AS title
       FROM help_articles WHERE answer LIKE $1 OR attachments::text LIKE $1`,
    [like],
  )
  for (const r of help) out.push({ type: "help", label: "Help article", id: r.id, title: r.title, href: `/admin/help/${r.id}` })

  const pages = await query<{ id: string; title: string }>(
    `SELECT id, COALESCE(NULLIF(title,''), 'Page') AS title
       FROM pages WHERE og_image = $1 OR content::text LIKE $2`,
    [url, like],
  )
  for (const r of pages) out.push({ type: "page", label: "Page", id: r.id, title: r.title, href: `/admin/pages` })

  const hf = await query<{ id: string; title: string }>(
    `SELECT id, COALESCE(NULLIF(name,''), 'Header/Footer block') AS title
       FROM header_footer_blocks WHERE html LIKE $1`,
    [like],
  )
  for (const r of hf) out.push({ type: "header_footer", label: "Header/Footer", id: r.id, title: r.title, href: `/admin/header-footer` })

  return out
}

export async function dbUpdateMediaTitle(id: string, title: string | null): Promise<MediaFileRow | null> {
  return queryOne<MediaFileRow>(
    `UPDATE media_files SET title = $1 WHERE id = $2 RETURNING ${MEDIA_SELECT}`,
    [title && title.trim() ? title.trim() : null, id],
  )
}

export async function dbDeleteMedia(id: string): Promise<MediaFileRow | null> {
  return queryOne<MediaFileRow>(
    `DELETE FROM media_files WHERE id = $1 RETURNING ${MEDIA_SELECT}`,
    [id],
  )
}
