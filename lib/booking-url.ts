/**
 * Builds the TourCMS/Palisis booking iframe URL from a trip permalink.
 * Appends a `month_year` hint so the embedded booking calendar opens on the
 * relevant month (the selected/visited date, or the current month as fallback).
 *
 * Shared by the single-trip page (`app/trip/[id]/trip-detail-view.tsx`) and the
 * trip planner modal (`app/planner/page.tsx`) so both render the identical form.
 */
/**
 * Palisis webshop `locale` codes we can request. The site only serves en/fr/de,
 * and Palisis honours these exact codes on the widget URL (`?locale=fr`), so the
 * mapping is a straight pass-through. Palisis also supports nl/it/es/pt/ca/no/sv
 * if the site ever adds those languages. Anything outside this set is ignored so
 * we never inject an unsupported/garbage locale.
 */
const PALISIS_LOCALES = new Set(["en", "fr", "de"])

/** Append `key=value` to a URL, choosing `?` or `&` based on the existing query. */
function appendParam(url: string, key: string, value: string): string {
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}${key}=${encodeURIComponent(value)}`
}

/**
 * Add a Palisis `locale` param for the visitor's site language, unless the URL
 * already pins one. Only recognised Palisis locales are applied; `en` is the
 * safe default the widget falls back to on its own.
 */
function withPalisisLocale(url: string, lang?: string): string {
  if (!lang || !PALISIS_LOCALES.has(lang)) return url
  if (/[?&]locale=/i.test(url)) return url
  return appendParam(url, "locale", lang)
}

/**
 * Builds the direct Palisis booking widget URL from a Palisis Product ID set
 * by the admin on the trip (e.g. "r-8146" → the sightseeingluxembourg.palisis.com
 * direct-booking widget).  Takes priority over the TourCMS permalink widget.
 *
 * `lang` (the visitor's current site language) is appended as `?locale=<lang>`
 * so the widget renders in the same language as the rest of the page.
 */
export function buildPalisisBookingUrl(palisisProductId: string, lang?: string): string {
  const base = `https://sightseeingluxembourg.palisis.com/?book-direct=${encodeURIComponent(palisisProductId)}`
  return withPalisisLocale(base, lang)
}

/** Minimal trip shape needed to resolve a booking iframe URL. */
export interface BookingUrlSource {
  /** Full custom iframe URL — used verbatim when set (external Palisis accounts). */
  customIframeUrl?: string | null
  /** Palisis Product ID → sightseeingluxembourg.palisis.com direct widget. */
  palisisProductId?: string | null
  /** TourCMS reserve permalink (last-resort iframe). */
  permalink?: string | null
}

/**
 * Resolve the booking iframe `src` for a trip, in priority order:
 *   1. `customIframeUrl` — used exactly as entered (external Palisis accounts).
 *   2. `palisisProductId` — the default sightseeingluxembourg direct widget.
 *   3. `permalink` — the TourCMS iframe (with the `month_year` calendar hint).
 * Returns null when none is configured (no booking widget).
 *
 * `lang` is the visitor's current site language (en/fr/de). It is applied as the
 * Palisis `?locale=` param to both Palisis branches so the booking widget matches
 * the page language. The TourCMS permalink has no URL language param (TourCMS
 * derives language from its channel/account config), so it is left unlocalised.
 *
 * Note: only the TourCMS permalink consumes date/time (its calendar opens on the
 * right month); the Palisis direct widgets are used as-is.
 */
export function resolveBookingUrl(
  trip: BookingUrlSource,
  date?: string,
  time?: string,
  lang?: string,
): string | null {
  const custom = trip.customIframeUrl?.trim()
  if (custom) return withPalisisLocale(custom, lang)

  const productId = trip.palisisProductId?.trim()
  if (productId) return buildPalisisBookingUrl(productId, lang)

  const permalink = trip.permalink?.trim()
  if (permalink) return substitutePlaceholders(permalink, date, time)

  return null
}

export function substitutePlaceholders(url: string, date?: string, _time?: string): string {
  if (!url) return url
  let month: string
  let year: string
  const m = date ? /^(\d{4})-(\d{2})-\d{2}$/.exec(date) : null
  if (m) {
    year = m[1]
    month = m[2]
  } else {
    const now = new Date()
    year = String(now.getFullYear())
    month = String(now.getMonth() + 1).padStart(2, "0")
  }
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}month_year=${month}_${year}`
}
