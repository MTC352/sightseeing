import { query, queryOne } from "@/lib/db"

/**
 * Which TourCMS API powers the /search page's availability timeslots.
 *
 *  - "datesndeals": cached catalog view (showTourDatesAndDeals) — the default,
 *    one call per trip spanning a 30-day window, cached. Cheap, but the spot
 *    counts can lag live bookings.
 *  - "checkavail": real-time checkAvailability per trip/date (short cache).
 *    Accurate to the current minute + party-size aware, but far heavier on the
 *    TourCMS API. Opt-in only, toggled from the Dev-mode db-migrations tab.
 */
export type SearchAvailabilitySource = "datesndeals" | "checkavail"

export interface SearchAvailabilityConfig {
  source: SearchAvailabilitySource
  /** How long the datesndeals sweep result is cached / how often it refreshes,
   *  in ms. Doubles as the global sweep-rate lock TTL. 0 = uncached (re-sweeps
   *  on every request — heavy on the TourCMS rate limit). */
  datesndealsCacheMs: number
  /** How long a real-time checkavail result is cached, in ms. */
  checkavailCacheMs: number
}

export const DEFAULT_SEARCH_AVAILABILITY_SOURCE: SearchAvailabilitySource = "datesndeals"
export const DEFAULT_DATESNDEALS_CACHE_MS = 5 * 60_000 // 5 min
export const DEFAULT_CHECKAVAIL_CACHE_MS = 30_000      // 30 s

// Bounds — protect against absurd values from the admin form.
export const DATESNDEALS_CACHE_MIN_MS = 0             // 0 = uncached (allowed, with a UI warning)
export const DATESNDEALS_CACHE_MAX_MS = 30 * 60_000   // 30 min
export const CHECKAVAIL_CACHE_MIN_MS = 5_000          // 5 s
export const CHECKAVAIL_CACHE_MAX_MS = 300_000        // 300 s

// Single-row setting in the shared `integrations` table (same convention as the
// announcement / weglot / palisis rows). `value` holds the source; `meta` holds
// the cache TTLs.
const SETTING_KEY = "search_availability_source"

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

function coerceSource(v: unknown): SearchAvailabilitySource {
  return v === "checkavail" ? "checkavail" : DEFAULT_SEARCH_AVAILABILITY_SOURCE
}

/** Read the full config. Fail-soft to defaults so a DB hiccup never breaks
 *  public search — it just serves the safe cached path. */
export async function getSearchAvailabilityConfig(): Promise<SearchAvailabilityConfig> {
  try {
    const row = await queryOne<{ value: string; meta: unknown }>(
      `SELECT value, meta FROM integrations WHERE key = $1`,
      [SETTING_KEY],
    )
    const meta = (row?.meta ?? {}) as Partial<SearchAvailabilityConfig>
    return {
      source: coerceSource(row?.value),
      datesndealsCacheMs: clamp(
        meta.datesndealsCacheMs, DATESNDEALS_CACHE_MIN_MS, DATESNDEALS_CACHE_MAX_MS, DEFAULT_DATESNDEALS_CACHE_MS,
      ),
      checkavailCacheMs: clamp(
        meta.checkavailCacheMs, CHECKAVAIL_CACHE_MIN_MS, CHECKAVAIL_CACHE_MAX_MS, DEFAULT_CHECKAVAIL_CACHE_MS,
      ),
    }
  } catch {
    return {
      source: DEFAULT_SEARCH_AVAILABILITY_SOURCE,
      datesndealsCacheMs: DEFAULT_DATESNDEALS_CACHE_MS,
      checkavailCacheMs: DEFAULT_CHECKAVAIL_CACHE_MS,
    }
  }
}

/** Upsert the full config. Caller is responsible for auth. */
export async function setSearchAvailabilityConfig(
  cfg: SearchAvailabilityConfig,
): Promise<SearchAvailabilityConfig> {
  const clean: SearchAvailabilityConfig = {
    source: coerceSource(cfg.source),
    datesndealsCacheMs: clamp(
      cfg.datesndealsCacheMs, DATESNDEALS_CACHE_MIN_MS, DATESNDEALS_CACHE_MAX_MS, DEFAULT_DATESNDEALS_CACHE_MS,
    ),
    checkavailCacheMs: clamp(
      cfg.checkavailCacheMs, CHECKAVAIL_CACHE_MIN_MS, CHECKAVAIL_CACHE_MAX_MS, DEFAULT_CHECKAVAIL_CACHE_MS,
    ),
  }
  await query(
    `INSERT INTO integrations (key, label, value, meta, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, meta = EXCLUDED.meta, updated_at = NOW()`,
    [
      SETTING_KEY,
      "Search availability source (Dev)",
      clean.source,
      JSON.stringify({
        datesndealsCacheMs: clean.datesndealsCacheMs,
        checkavailCacheMs: clean.checkavailCacheMs,
      }),
    ],
  )
  return clean
}
