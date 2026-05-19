/**
 * Shared types + defaults for the public Search page filter widgets.
 * Admin controls which filters are visible from /admin/integrations → Settings →
 * "Trip Search Filters". Persisted in the `integrations` table (apiKeys section)
 * as boolean strings under `search_filter_<name>_enabled`.
 */

export type SearchFilterKey =
  | "location"
  | "radius"
  | "price"
  | "rating"
  | "duration"
  | "tags"
  | "type"

export interface SearchFiltersConfig {
  location: boolean
  radius: boolean
  price: boolean
  rating: boolean
  duration: boolean
  tags: boolean
  type: boolean
}

/**
 * Defaults:
 *  - location, price, duration, tags = ON
 *  - radius = ON (depends on location address being entered)
 *  - rating = OFF  → HOLD until Google Business linkage is in place
 *  - type   = OFF  → user marked it as Optional
 */
export const DEFAULT_SEARCH_FILTERS_CONFIG: SearchFiltersConfig = {
  location: true,
  radius: true,
  price: true,
  rating: false,
  duration: true,
  tags: true,
  type: false,
}

export const SEARCH_FILTER_KEY_PREFIX = "search_filter_"
export const SEARCH_FILTER_KEY_SUFFIX = "_enabled"

export function configKeyFor(key: SearchFilterKey): string {
  return `${SEARCH_FILTER_KEY_PREFIX}${key}${SEARCH_FILTER_KEY_SUFFIX}`
}

/** Build a SearchFiltersConfig from a flat string map (e.g. settings.apiKeys). */
export function readSearchFiltersConfig(
  source: Record<string, string | undefined> | null | undefined,
): SearchFiltersConfig {
  const out = { ...DEFAULT_SEARCH_FILTERS_CONFIG }
  if (!source) return out
  ;(Object.keys(out) as SearchFilterKey[]).forEach((k) => {
    const v = source[configKeyFor(k)]
    if (v === "true") out[k] = true
    else if (v === "false") out[k] = false
  })
  return out
}
