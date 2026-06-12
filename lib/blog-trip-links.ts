/**
 * lib/blog-trip-links.ts
 * Helpers to make in-body trip links on the public blog point at the trip's
 * canonical slug URL (e.g. /trip/nature-castle-day-tour) instead of the raw
 * Palisis id (/trip/tcms_5). Applied at render time so existing posts — whose
 * Markdown/HTML bodies were authored/generated with id URLs — are normalized
 * without a data migration.
 *
 * It also repairs hrefs that an older version of the Markdown converter mangled
 * (underscores in /trip/tcms_5 were turned into <em> tags). The "squashed"
 * lookup key (lowercase, alphanumerics only) lets a cleaned-but-still-imperfect
 * id like "tcms5" map back to the right trip.
 */

export type TripSlugRef = {
  id?: string | null
  palisis_id?: string | null
  slug?: string | null
}

/**
 * Build a lookup from every known identifier form of a trip (id, palisis_id,
 * slug — plus an alphanumerics-only "squashed" variant of each) to its
 * canonical public URL segment (slug when set, otherwise id).
 */
export function buildTripSlugMap(trips: TripSlugRef[]): Map<string, string> {
  const map = new Map<string, string>()
  const add = (key: string | null | undefined, canonical: string) => {
    if (!key) return
    const k = key.toLowerCase()
    if (!map.has(k)) map.set(k, canonical)
    const squashed = k.replace(/[^a-z0-9]/g, "")
    if (squashed && !map.has(squashed)) map.set(squashed, canonical)
  }
  for (const t of trips) {
    const canonical = (t.slug && String(t.slug).trim()) || (t.id ? String(t.id) : "")
    if (!canonical) continue
    add(t.id != null ? String(t.id) : null, canonical)
    add(t.palisis_id != null ? String(t.palisis_id) : null, canonical)
    add(t.slug != null ? String(t.slug) : null, canonical)
  }
  return map
}

/** Recover the bare trip identifier from a /trip/<seg> href segment that may
 *  carry injected markup/entities (from the legacy converter) or URL-encoding. */
function cleanSegment(seg: string): string {
  let s = seg
  s = s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
  s = s.replace(/<[^>]*>/g, "") // strip injected tags (e.g. <em>, </em>)
  try {
    s = decodeURIComponent(s)
  } catch {
    /* leave as-is on malformed encoding */
  }
  s = s.replace(/<[^>]*>/g, "")
  s = s.split(/[?#"]/)[0] // drop query/hash and any stray quote
  return s.trim()
}

/**
 * Rewrite every `/trip/<id-or-slug>` href in an HTML string to the trip's
 * canonical slug URL. Unknown trips are left pointing at their cleaned segment
 * (still a valid /trip/[id] route). Pass the map from `buildTripSlugMap`.
 */
export function rewriteTripLinksToSlugs(html: string, slugMap: Map<string, string>): string {
  if (!html) return html
  return html.replace(/(href=")(\/trip\/[^"]*)(")/gi, (_full, pre: string, url: string, post: string) => {
    const seg = url.replace(/^\/trip\//i, "")
    const cleaned = cleanSegment(seg)
    if (!cleaned) return `${pre}${url}${post}`
    const lower = cleaned.toLowerCase()
    const squashed = lower.replace(/[^a-z0-9]/g, "")
    const target = slugMap.get(lower) || (squashed && slugMap.get(squashed)) || cleaned
    return `${pre}/trip/${encodeURIComponent(target)}${post}`
  })
}
