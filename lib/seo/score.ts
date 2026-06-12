/**
 * lib/seo/score.ts
 *
 * Single source of truth for the trip SEO scoring engine (the "21 checks")
 * plus the deterministic field fixers and staleness tracking used by:
 *   - components/admin/seo-optimizer.tsx          (live widget)
 *   - components/admin/seo-ai-modal.tsx           (AI comparison modal)
 *   - app/api/admin/seo-generate/route.ts         (AI generation + auto-fix)
 *   - app/api/admin/trips/[id]/seo/route.ts       (persist + score + hashes)
 *
 * Everything here is PURE (no DB, no React) so it runs identically on the
 * client and the server. Keep it framework-free.
 */

// ── Word lists ────────────────────────────────────────────────────────────────

export const POWER_WORDS = new Set([
  "ultimate", "proven", "powerful", "essential", "best", "top", "complete",
  "definitive", "comprehensive", "exclusive", "premium", "incredible", "master",
  "revolutionary", "effective", "expert", "leading", "premier", "outstanding",
  "remarkable", "exceptional", "unbeatable", "advanced", "professional",
])

export const SENTIMENT_WORDS = new Set([
  "beautiful", "stunning", "breathtaking", "unforgettable", "incredible", "amazing",
  "wonderful", "magnificent", "spectacular", "unique", "exciting", "thrilling",
  "fascinating", "charming", "lovely", "exceptional", "extraordinary", "outstanding",
  "superb", "fantastic", "perfect", "delightful", "remarkable", "memorable",
  "scenic", "authentic", "iconic", "vibrant", "magical",
])

// ── Pure text helpers ─────────────────────────────────────────────────────────

/** Strip HTML tags + decode basic entities → plain text. */
export function stripHtml(html: string): string {
  if (!html) return ""
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<\/li>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

/** Extract paragraph-level text blocks (for the short-paragraph check). */
export function getParagraphs(html: string): string[] {
  if (html.includes("<p")) {
    return (html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? [])
      .map(stripHtml)
      .filter(Boolean)
  }
  return html.split(/\n\n+/).filter(Boolean)
}

export function wordCount(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length
}

export function countOccurrences(text: string, kw: string): number {
  if (!kw || !text) return 0
  const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
  return (text.match(re) ?? []).length
}

export function hasWordFrom(text: string, words: Set<string>): boolean {
  const lower = text.toLowerCase()
  for (const w of words) {
    if (new RegExp(`\\b${w}\\b`).test(lower)) return true
  }
  return false
}

// ── Scoring engine (the checks) ────────────────────────────────────────────────

/** Recommended meta-description length window (chars). */
export const META_MIN_LEN = 120
export const META_MAX_LEN = 160

export interface SeoCheck {
  id: string
  pass: boolean
  message: string
}

export interface SeoSection {
  id: string
  label: string
  checks: SeoCheck[]
}

export interface SeoScoreInput {
  focusKeyword: string
  seoTitle: string
  metaDescription: string
  /** Body content — HTML or plain text. */
  bodyHtml: string
  /** Slug / permalink (path segment, not the full URL). */
  permalink: string
  /** Featured image URL (used by image-alt + rich-media checks). */
  image: string
  highlights: string[]
}

/**
 * Compute the full set of grouped SEO checks. The check ids, labels, ordering
 * and messages MUST stay in sync with TOOLTIPS in the optimizer widget.
 */
export function computeSeoSections(input: SeoScoreInput): SeoSection[] {
  const kw = (input.focusKeyword || "").toLowerCase().trim()
  const seoTitle = input.seoTitle || ""
  const metaDesc = input.metaDescription || ""
  const rawHtml = input.bodyHtml || ""
  const permalink = input.permalink || ""
  const image = input.image || ""
  const highlights = input.highlights || []

  const plainText = stripHtml(rawHtml)
  const words = wordCount(plainText)
  const kwCount = countOccurrences(plainText, kw)
  const density = words > 0 ? (kwCount / words) * 100 : 0

  const tl = seoTitle.toLowerCase()
  const dl = plainText.toLowerCase()
  const ml = metaDesc.toLowerCase()
  const pl = permalink.toLowerCase()

  const basic: SeoCheck[] = [
    { id: "kw-in-title", pass: !!kw && tl.includes(kw), message: "Add Focus Keyword to the SEO title." },
    { id: "kw-in-meta", pass: !!kw && ml.includes(kw), message: "Add Focus Keyword to your SEO Meta Description." },
    {
      id: "meta-length",
      pass: metaDesc.length >= META_MIN_LEN && metaDesc.length <= META_MAX_LEN,
      message:
        metaDesc.length === 0
          ? `Meta description is empty. Write ${META_MIN_LEN}–${META_MAX_LEN} characters.`
          : metaDesc.length < META_MIN_LEN
            ? `Meta description is only ${metaDesc.length} characters. Add more (aim for ${META_MIN_LEN}–${META_MAX_LEN}).`
            : `Meta description is ${metaDesc.length} characters. Trim it to ${META_MAX_LEN} or fewer.`,
    },
    { id: "kw-in-url", pass: !!kw && pl.includes(kw.replace(/\s+/g, "-")), message: "Use Focus Keyword in the URL." },
    { id: "kw-in-intro", pass: !!kw && dl.slice(0, 100).includes(kw), message: "Use Focus Keyword at the beginning of your content." },
    { id: "kw-in-content", pass: !!kw && dl.includes(kw), message: "Use Focus Keyword in the content." },
    { id: "content-length", pass: words >= 600, message: `Content is ${words} words long. Consider using at least 600 words.` },
  ]

  const additional: SeoCheck[] = [
    { id: "kw-in-headings", pass: !!kw && highlights.some((h) => h.toLowerCase().includes(kw)), message: "Use Focus Keyword in subheadings like H2, H3, H4, etc." },
    { id: "image-alt", pass: !!image, message: "Add an image with your Focus Keyword as alt text." },
    { id: "keyword-density", pass: !!kw && density >= 0.5 && density <= 2.5, message: `Keyword Density is ${density.toFixed(1)}%. Aim for around 1% Keyword Density.` },
    {
      id: "url-length", pass: permalink.length > 0 && permalink.length <= 75,
      message: permalink.length <= 75
        ? `URL is ${permalink.length} characters long. Kudos!`
        : `URL is ${permalink.length} characters long. Consider shortening it.`,
    },
    { id: "external-links", pass: /https?:\/\/[^"'\s<>]/.test(rawHtml), message: "Link out to external resources." },
    { id: "dofollow-links", pass: /href="https?:\/\/[^"]+"/i.test(rawHtml), message: "Add DoFollow links pointing to external resources." },
    { id: "internal-links", pass: /href="\/(trip|blog|explore|departures|help)\//i.test(rawHtml), message: "Add internal links in your content." },
    { id: "kw-set", pass: !!kw, message: "Set a Focus Keyword for this content." },
  ]

  const titleReadability: SeoCheck[] = [
    { id: "kw-at-title-start", pass: !!kw && (tl.startsWith(kw) || tl.indexOf(kw) < Math.ceil(tl.length / 2)), message: "Use the Focus Keyword near the beginning of SEO title." },
    { id: "title-sentiment", pass: hasWordFrom(seoTitle, SENTIMENT_WORDS), message: "Your title doesn't contain a positive or a negative sentiment word." },
    { id: "title-power-word", pass: hasWordFrom(seoTitle, POWER_WORDS), message: "Your title doesn't contain a power word. Add at least one." },
    { id: "title-number", pass: /\d/.test(seoTitle), message: "Your SEO title doesn't contain a number." },
  ]

  const contentReadability: SeoCheck[] = [
    { id: "toc", pass: highlights.length >= 3, message: "You don't seem to be using a Table of Contents plugin." },
    {
      id: "short-paragraphs", pass: !getParagraphs(rawHtml).some((p) => wordCount(p) > 100),
      message: "At least one paragraph is long. Consider using short paragraphs.",
    },
    { id: "rich-media", pass: !!image, message: "You are not using rich media like images or videos." },
  ]

  return [
    { id: "basic", label: "Basic SEO", checks: basic },
    { id: "additional", label: "Additional", checks: additional },
    { id: "title", label: "Title Readability", checks: titleReadability },
    { id: "content", label: "Content Readability", checks: contentReadability },
  ]
}

/** The editable SEO field set produced by the AI / edited by the admin. */
export interface SeoFields {
  seoKeyword: string
  seoTitle: string
  seoMetaDescription: string
  seoBody: string
  seoHighlights: string[]
  seoSlug: string
}

/** Build a scoring input from a SeoFields set + the trip's image. */
export function scoreInputFromFields(fields: SeoFields, image: string): SeoScoreInput {
  return {
    focusKeyword: fields.seoKeyword || "",
    seoTitle: fields.seoTitle || "",
    metaDescription: fields.seoMetaDescription || "",
    bodyHtml: fields.seoBody || "",
    permalink: fields.seoSlug || "",
    image: image || "",
    highlights: fields.seoHighlights || [],
  }
}

export interface SeoScoreSummary {
  passingCount: number
  totalCount: number
  score: number
}

export function summarizeScore(sections: SeoSection[]): SeoScoreSummary {
  const all = sections.flatMap((s) => s.checks)
  const passingCount = all.filter((c) => c.pass).length
  const totalCount = all.length
  const score = totalCount > 0 ? Math.round((passingCount / totalCount) * 100) : 0
  return { passingCount, totalCount, score }
}

export function scoreSeo(input: SeoScoreInput): SeoScoreSummary {
  return summarizeScore(computeSeoSections(input))
}

// ── Trip → live score (shared client + server) ─────────────────────────────────
//
// Build the *effective* SEO field set the same way the live optimizer widget
// does: prefer the persisted seo_* columns, fall back to the trip's base content
// so a never-/partially-optimised trip still scores against real data. Sharing
// this between the widget and the server keeps the stored seo_score in lockstep
// with what the admin sees, so the score never represents stale content.

function seoStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v)
}

export function liveSeoFieldsFromTrip(trip: Record<string, unknown>): SeoFields {
  const baseHighlights = Array.isArray(trip.highlights) ? trip.highlights.map((h) => seoStr(h)) : []
  const seoHighlights =
    trip.seoHighlights == null
      ? baseHighlights
      : Array.isArray(trip.seoHighlights)
        ? trip.seoHighlights.map((h) => seoStr(h))
        : []
  return {
    seoKeyword: seoStr(trip.seoKeyword).trim(),
    seoTitle: seoStr(trip.seoTitle) || seoStr(trip.title),
    seoMetaDescription: seoStr(trip.seoMetaDescription) || stripHtml(seoStr(trip.description)).slice(0, 160),
    seoBody: seoStr(trip.seoBody) || seoStr(trip.description),
    seoHighlights,
    seoSlug: seoStr(trip.seoSlug) || seoStr(trip.permalink) || seoStr(trip.id),
  }
}

/** Deterministic live SEO score (0–100) for a trip's current effective fields. */
export function liveScoreForTrip(trip: Record<string, unknown>): number {
  const image = seoStr(trip.image)
  return scoreSeo(scoreInputFromFields(liveSeoFieldsFromTrip(trip), image)).score
}

// ── Slug helpers ───────────────────────────────────────────────────────────────

export function slugify(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/** Build a slug that contains the keyword and stays within the 75-char limit. */
export function slugifyWithKeyword(keyword: string, fallback = ""): string {
  const kwSlug = slugify(keyword)
  const fbSlug = slugify(fallback)
  let slug = kwSlug || fbSlug
  if (kwSlug && fbSlug && !fbSlug.startsWith(kwSlug)) {
    slug = `${kwSlug}-${fbSlug}`
  } else if (fbSlug.startsWith(kwSlug)) {
    slug = fbSlug
  }
  if (slug.length > 75) slug = slug.slice(0, 75).replace(/-+[^-]*$/, "") || slug.slice(0, 75)
  return slug.replace(/^-|-$/g, "")
}

// ── Deterministic field fixers ─────────────────────────────────────────────────
//
// These run AFTER the AI proposes fields, to GUARANTEE the relevant checks
// pass (the AI handles tone/length; these guarantee the mechanical checks).
// They never fabricate filler beyond the minimum needed to pass a check.

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Ensure the title passes kw-in-title, kw-at-title-start, sentiment, power, number. */
export function ensureTitleChecks(rawTitle: string, keyword: string): string {
  let title = (rawTitle || "").trim().replace(/\s+/g, " ")
  const kw = keyword.trim()
  const kwLower = kw.toLowerCase()

  if (!title) title = capitalize(kw)

  // Keyword present + near the start.
  const tl = title.toLowerCase()
  const startOk = tl.startsWith(kwLower) || (tl.includes(kwLower) && tl.indexOf(kwLower) < Math.ceil(tl.length / 2))
  if (kw && !startOk) {
    title = tl.includes(kwLower) ? `${capitalize(kw)} — ${title}` : `${capitalize(kw)}: ${title}`
  }

  // Power word.
  if (!hasWordFrom(title, POWER_WORDS)) {
    title = `Ultimate ${title}`
  }
  // Sentiment word.
  if (!hasWordFrom(title, SENTIMENT_WORDS)) {
    title = `${title} — Unforgettable`
  }
  // Number.
  if (!/\d/.test(title)) {
    title = `${title} (2026)`
  }
  return title.replace(/\s+/g, " ").trim()
}

/**
 * Ensure the meta description passes both meta checks: it contains the focus
 * keyword (kw-in-meta) AND lands in the 120–160 char window (meta-length).
 * Pads a too-short meta with a natural CTA and trims a too-long one at a word
 * boundary — never stuffs the keyword more than once.
 */
export function ensureMeta(rawMeta: string, keyword: string, opts: { city?: string } = {}): string {
  const kw = keyword.trim()
  const city = opts.city || "Luxembourg"
  let m = (rawMeta || "").replace(/\s+/g, " ").trim()

  // Degrade gracefully for the impossible case where the keyword alone exceeds
  // the max length: keep the keyword (so kw-in-meta passes) and accept that
  // meta-length cannot also pass. Realistic focus keywords are far shorter.
  if (kw && kw.length >= META_MAX_LEN) {
    return capitalize(kw)
  }

  if (!m) {
    m = kw
      ? `Discover ${kw} with sightseeing.lu.`
      : `Discover the best of ${city} with sightseeing.lu.`
  }

  // Keyword present, near the start.
  if (kw && !m.toLowerCase().includes(kw.toLowerCase())) {
    m = `${capitalize(kw)}: ${m}`
  }

  // Pad up to the minimum length with on-topic call-to-action tails.
  const tails = [
    `Book your unforgettable ${city} experience online today.`,
    `Easy booking, instant confirmation and friendly local guides.`,
    `Reserve your spot and explore more with sightseeing.lu.`,
  ]
  let ti = 0
  while (m.length < META_MIN_LEN && ti < tails.length) {
    m = `${m} ${tails[ti]}`.replace(/\s+/g, " ").trim()
    ti++
  }

  // Trim to the maximum length without cutting a word in half.
  if (m.length > META_MAX_LEN) {
    m = m.slice(0, META_MAX_LEN)
    const lastSpace = m.lastIndexOf(" ")
    if (lastSpace > META_MIN_LEN) m = m.slice(0, lastSpace)
    m = m.replace(/[\s,;:.\-–—]+$/, "").trim()
  }

  return m
}

/** Ensure ≥3 highlights and that at least one contains the keyword. */
export function ensureHighlights(rawHighlights: string[], keyword: string): string[] {
  const kw = keyword.trim()
  const out = (rawHighlights || []).map((h) => String(h).trim()).filter(Boolean)
  if (kw && !out.some((h) => h.toLowerCase().includes(kw.toLowerCase()))) {
    out.unshift(`Experience the ${capitalize(kw)} with expert local guides`)
  }
  const fillers = [
    "Hassle-free booking with instant confirmation",
    "Small groups and friendly, knowledgeable guides",
    "Perfect for first-time visitors and returning travellers",
  ]
  let fi = 0
  while (out.length < 3 && fi < fillers.length) out.push(fillers[fi++])
  return out
}

export interface EnsureBodyOptions {
  internalHref?: string
  externalHref?: string
  externalLabel?: string
  city?: string
}

/**
 * Ensure the body passes: kw-in-intro, kw-in-content, content-length (≥600),
 * keyword-density (≥0.5%), external-links, dofollow-links, internal-links,
 * short-paragraphs. Appends a real "Good to know" block with links when missing
 * and tops up keyword usage / length only as much as needed.
 */
export function ensureBody(rawBody: string, keyword: string, opts: EnsureBodyOptions = {}): string {
  const kw = keyword.trim()
  const kwLower = kw.toLowerCase()
  const city = opts.city || "Luxembourg"
  const internalHref = opts.internalHref || "/explore/"
  const externalHref = opts.externalHref || "https://www.visitluxembourg.com"
  const externalLabel = opts.externalLabel || "official Luxembourg tourism guide"

  let html = (rawBody || "").trim()
  // Normalise plain text into paragraphs if there are no HTML tags.
  if (html && !/<[a-z][\s\S]*>/i.test(html)) {
    html = html
      .split(/\n\n+/)
      .map((p) => `<p>${p.trim()}</p>`)
      .join("\n")
  }

  // kw in the first 100 chars of plain text.
  if (kw && !stripHtml(html).slice(0, 100).toLowerCase().includes(kwLower)) {
    html = `<p>Looking for the perfect ${kw}? You're in the right place.</p>\n${html}`
  }

  // External + dofollow + internal links (single "Good to know" block).
  const hasExternal = /href="https?:\/\/[^"]+"/i.test(html)
  const hasInternal = /href="\/(trip|blog|explore|departures|help)\//i.test(html)
  if (!hasExternal || !hasInternal) {
    html += `\n<h3>Good to know before you book</h3>\n<p>Planning your ${kw || `${city} experience`} is easy. For wider travel inspiration, see the <a href="${externalHref}">${externalLabel}</a>, and browse more of our <a href="${internalHref}">${city} tours and activities</a> to build the perfect day out.</p>`
  }

  // 1) Content length ≥ 600 words FIRST, topped up with on-topic, KEYWORD-FREE
  //    sentences (so the final density top-up can land squarely in 0.5–2.5%).
  const fillers = [
    `From the moment you arrive, the day blends memorable sights, local stories and practical comfort so every traveller leaves with something special to remember about ${city}.`,
    `Knowledgeable local guides share the history and hidden corners that most visitors miss, turning a simple outing into a richer, more personal discovery of ${city}.`,
    `Whether you are visiting for the first time or returning to see more, the relaxed pace leaves room to take photos, ask questions and soak in the atmosphere of ${city}.`,
    `Comfortable arrangements, clear timing and friendly hosts mean you can focus on enjoying yourself rather than worrying about the logistics of your day in ${city}.`,
  ]
  let lenGuard = 0
  while (wordCount(stripHtml(html)) < 600 && lenGuard < 60) {
    html += `\n<p>${fillers[lenGuard % fillers.length]}</p>`
    lenGuard++
  }

  // 2) Keyword density floor (aim ~1%, stay under the 2.5% ceiling). Done last,
  //    after length, since the keyword-free fillers above dilute density.
  if (kw) {
    let guard = 0
    while (guard < 12) {
      const plain = stripHtml(html)
      const words = wordCount(plain)
      const density = words > 0 ? (countOccurrences(plain, kw) / words) * 100 : 0
      if (density >= 0.8) break
      html += `\n<p>Our ${kw} is designed to make the most of your time in ${city}.</p>`
      guard++
    }
  }

  return html.trim()
}

// ── Source-hash staleness tracking ─────────────────────────────────────────────
//
// When SEO is generated it derives from a set of upstream source fields. We
// snapshot a hash of each source field at generation time. If a later Palisis
// sync (or manual edit) changes any source field, that field is "stale" and the
// admin is prompted to re-optimize.

/** Small, dependency-free string hash (djb2). Stable across client + server. */
export function seoHash(input: string): string {
  let h = 5381
  const s = input || ""
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

/** Trip source fields that SEO derives from (camelCase, as returned by queries). */
export const SEO_SOURCE_FIELDS = [
  "title",
  "description",
  "shortDescription",
  "longDescription",
  "highlights",
  "included",
  "excluded",
  "itinerary",
  "category",
  "city",
] as const

function normalizeSourceValue(v: unknown): string {
  if (v == null) return ""
  if (Array.isArray(v)) return v.map((x) => String(x)).join("|")
  return String(v)
}

export type SeoSourceHashes = Record<string, string>

/** Compute a {field: hash} snapshot from a trip-like object. */
export function computeSourceHashes(trip: Record<string, unknown>): SeoSourceHashes {
  const out: SeoSourceHashes = {}
  for (const f of SEO_SOURCE_FIELDS) {
    out[f] = seoHash(normalizeSourceValue(trip[f]))
  }
  return out
}

export interface SeoStaleness {
  optimized: boolean
  stale: boolean
  changedFields: string[]
}

/**
 * Compare a trip's CURRENT source hashes against the snapshot taken at the last
 * optimization. Returns which source fields changed since.
 */
export function computeStaleness(trip: Record<string, unknown>): SeoStaleness {
  const snapshot = (trip.seoSourceHashes ?? null) as SeoSourceHashes | null
  const optimized = !!trip.seoOptimizedAt || !!snapshot
  if (!optimized || !snapshot) {
    return { optimized, stale: false, changedFields: [] }
  }
  const current = computeSourceHashes(trip)
  const changedFields: string[] = []
  for (const f of SEO_SOURCE_FIELDS) {
    if ((snapshot[f] ?? "") !== current[f]) changedFields.push(f)
  }
  return { optimized: true, stale: changedFields.length > 0, changedFields }
}
