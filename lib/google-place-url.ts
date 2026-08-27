/**
 * Pure helpers for turning an admin-pasted "Google Place ID or Business URL"
 * into the pieces we need to resolve a Google Places result:
 *   - a genuine Places API place_id (ChIJ…), if one is actually present
 *   - the business name (from the /place/<name> path segment)
 *   - the precise pin coordinates (for location-biased name search)
 *
 * IMPORTANT: modern Google Maps place URLs do NOT contain a `ChIJ…` place_id.
 * The `data=…!1s0x…:0x…` token is a hex feature-id / CID, which the Places
 * *Details* endpoint rejects. We must never mistake that hex for a place_id —
 * doing so silently resolved the wrong business. When no real place_id is
 * present, callers fall back to a location-biased name search using the
 * coordinates extracted here.
 *
 * Dependency-free by design so it is unit-testable without network/DB.
 */

// A real Places API place_id: known prefixes + URL-safe base64 body. This
// deliberately excludes the hex feature-id (`0x…:0x…`, leading digit + colon)
// and bare business names (which contain spaces / are too short).
const PLACE_ID_RE = /^(ChIJ|GhIJ|EI|Ei|Ej|El|Ee|Cm)[A-Za-z0-9_-]{10,}$/

function isRealPlaceId(candidate: string): boolean {
  return PLACE_ID_RE.test(candidate) && !candidate.includes(":")
}

/**
 * Returns a genuine `ChIJ…` place_id, or null. Accepts a place_id pasted
 * directly, or one embedded as a real `!1s<ChIJ…>` token in a Maps URL.
 * Returns null for hex feature-ids / CIDs and for URLs that carry no place_id.
 */
export function extractPlaceId(url: string): string | null {
  try {
    const trimmed = url.trim()

    // Raw Place ID pasted directly.
    if (isRealPlaceId(trimmed)) return trimmed

    // `!1s<id>` token in the `data=` segment — only when it's a real place_id,
    // never the `0x…:0x…` hex feature-id that modern URLs embed there.
    const match = url.match(/!1s([^!?&]+)/)
    if (match) {
      const token = decodeURIComponent(match[1])
      if (isRealPlaceId(token)) return token
    }

    return null
  } catch {
    return null
  }
}

/** Business name from the `/place/<name>` path segment (`+` → space). */
export function extractPlaceName(url: string): string | null {
  try {
    const u = new URL(url)
    const m = u.pathname.match(/\/place\/([^/@]+)/)
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null
  } catch {
    return null
  }
}

/**
 * Precise place coordinates, preferring the `!3d<lat>!4d<lng>` pin (the actual
 * business location) over the `@<lat>,<lng>` map viewport centre. Used as a
 * location bias so a name search resolves the correct nearby business.
 */
export function extractPlaceCoords(url: string): { lat: number; lng: number } | null {
  const pin = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (pin) return { lat: parseFloat(pin[1]), lng: parseFloat(pin[2]) }

  const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) }

  return null
}
