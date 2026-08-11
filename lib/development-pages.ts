/**
 * lib/development-pages.ts
 * Single source of truth for the "Development Pages" admin tab and the
 * public-facing 404 gate in app/layout.tsx.
 *
 * These are static public routes (app/<slug>/page.tsx) that are NOT in the
 * hardcoded MANAGED_PAGES list on /admin/pages, so before this module they were
 * unmanageable. All default to ENABLED; a slug is "disabled" only when it
 * appears in the stored integrations row 'page_visibility'.meta.disabled.
 */
export interface DevelopmentPage {
  /** Top-level route segment, e.g. "emergency" for /emergency. */
  slug: string
  label: string
  url: string
  description: string
}

export const DEVELOPMENT_PAGES: DevelopmentPage[] = [
  { slug: "emergency", label: "Emergency", url: "/emergency", description: "Emergency contacts & business hours" },
  { slug: "cars",      label: "Cars",      url: "/cars",      description: "Car rental vertical" },
  { slug: "flights",   label: "Flights",   url: "/flights",   description: "Flights vertical" },
  { slug: "hotels",    label: "Hotels",    url: "/hotels",    description: "Hotels vertical" },
  { slug: "trains",    label: "Trains",    url: "/trains",    description: "Trains vertical" },
  { slug: "travel",    label: "Travel",    url: "/travel",    description: "Travel vertical" },
  { slug: "widgets",   label: "Widgets",   url: "/widgets",   description: "Embeddable widgets demo" },
  { slug: "impressum", label: "Impressum", url: "/impressum", description: "Legal notice (Impressum)" },
  { slug: "privacy",   label: "Privacy",   url: "/privacy",   description: "Privacy policy" },
]

export const DEVELOPMENT_PAGE_SLUGS: Set<string> = new Set(DEVELOPMENT_PAGES.map((p) => p.slug))

/** First path segment of a pathname ("/emergency/x" → "emergency", "/" → ""). */
export function topLevelSlug(pathname: string): string {
  return pathname.split("/")[1] ?? ""
}

/** Keep only governed slugs, de-duplicated and order-stable. Ignores anything else. */
export function sanitizeDisabledSlugs(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of input) {
    if (typeof v === "string" && DEVELOPMENT_PAGE_SLUGS.has(v) && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

/** True when the request must 404: a governed slug, currently disabled, and the
 *  visitor is not an authenticated admin. */
export function isDevPageBlocked(pathname: string, disabled: Iterable<string>, isAdmin: boolean): boolean {
  if (isAdmin) return false
  const slug = topLevelSlug(pathname)
  if (!DEVELOPMENT_PAGE_SLUGS.has(slug)) return false
  return new Set(disabled).has(slug)
}
