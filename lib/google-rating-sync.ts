/**
 * Google Rating Sync — shared utility
 *
 * Fetches the aggregate Google Places rating for a trip that has a
 * `google_business_url` set and persists `rating` + `review_count` back to
 * the trips DB row so preview cards show accurate data without requiring a
 * detail-page visit.
 *
 * Safe to call fire-and-forget: all errors are caught internally and logged.
 * Called from:
 *   - /api/google-reviews    (after a successful trip-scoped fetch)
 *   - /api/admin/trips/[id]  (after PATCH saves a new googleBusinessUrl)
 */

interface PlaceDetails {
  rating?: number
  user_ratings_total?: number
}

const SHORTLINK_ALLOWED_HOSTS = new Set(["share.google", "goo.gl", "maps.app.goo.gl"])

function isAllowedRedirectHost(hostname: string): boolean {
  return (
    hostname === "google.com" ||
    hostname.endsWith(".google.com") ||
    hostname.endsWith(".googleapis.com")
  )
}

function isPrivateHost(h: string): boolean {
  const lo = h.toLowerCase()
  if (lo === "localhost" || lo === "0.0.0.0" || lo === "::1") return true
  if (/^127\./.test(lo)) return true
  if (/^10\./.test(lo)) return true
  if (/^192\.168\./.test(lo)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(lo)) return true
  if (/^169\.254\./.test(lo)) return true
  if (/^fc[0-9a-f]{2}:/i.test(lo) || /^fd[0-9a-f]{2}:/i.test(lo)) return true
  if (/^fe80:/i.test(lo)) return true
  return false
}

function validateRedirectTarget(rawUrl: string): string | null {
  let parsed: URL
  try { parsed = new URL(rawUrl) } catch { return null }
  if (parsed.protocol !== "https:") return null
  if (isPrivateHost(parsed.hostname)) return null
  if (!isAllowedRedirectHost(parsed.hostname)) return null
  return parsed.href
}

function extractPlaceId(url: string): string | null {
  try {
    if (/^ChIJ|^EI/.test(url)) return url
    const u = new URL(url)
    const cid = u.searchParams.get("cid")
    if (cid) return cid
    const match = url.match(/!1s([^!?&]+)/)
    if (match) return decodeURIComponent(match[1])
    return null
  } catch { return null }
}

function extractPlaceName(url: string): string | null {
  try {
    const u = new URL(url)
    const m = u.pathname.match(/\/place\/([^/@]+)/)
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null
  } catch { return null }
}

async function resolveShortlink(url: string): Promise<string> {
  try {
    let parsed: URL
    try { parsed = new URL(url) } catch { return url }
    if (parsed.protocol !== "https:") return url
    if (!SHORTLINK_ALLOWED_HOSTS.has(parsed.hostname)) return url
    if (isPrivateHost(parsed.hostname)) return url
    const MAX_HOPS = 5
    let current = parsed.href
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const res = await fetch(current, { redirect: "manual", method: "GET" })
      if (res.status < 300 || res.status >= 400) return current
      const location = res.headers.get("location")
      if (!location) return current
      let nextUrl: string
      try { nextUrl = new URL(location, current).href } catch { return current }
      const safe = validateRedirectTarget(nextUrl)
      if (!safe) return url
      current = safe
    }
    return current
  } catch { return url }
}

async function findPlaceIdByName(name: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(name)}&inputtype=textquery&fields=place_id&key=${apiKey}`,
    )
    const json = await res.json()
    if (json.status === "OK" && json.candidates?.length > 0) return json.candidates[0].place_id
    return null
  } catch { return null }
}

async function fetchRatingOnly(
  placeId: string,
  apiKey: string,
): Promise<{ ok: true; result: PlaceDetails } | { ok: false; status: string }> {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total&key=${apiKey}`,
  )
  if (!res.ok) throw new Error(`Places API HTTP ${res.status}`)
  const json = await res.json()
  if (json.status === "OK") return { ok: true, result: json.result as PlaceDetails }
  if (["NOT_FOUND", "INVALID_REQUEST", "ZERO_RESULTS"].includes(json.status)) {
    return { ok: false, status: json.status }
  }
  throw new Error(`Places API: ${json.status}`)
}

export interface GoogleRatingResult {
  rating: number
  reviewCount: number
}

/**
 * Fetch the Google aggregate rating + review count for the given trip and
 * persist them to the `trips` row.  Returns the saved values, or `null` if
 * the trip has no Google URL, the API key is missing, or any step fails.
 *
 * Always call fire-and-forget: `void syncGoogleRatingForTrip(tripId).catch(()=>{})`
 */
export async function syncGoogleRatingForTrip(
  tripId: string,
): Promise<GoogleRatingResult | null> {
  try {
    const { dbGetTrip, dbGetSettings, dbUpdateTrip } = await import("@/lib/db/queries")

    const [tripRow, settings] = await Promise.all([
      dbGetTrip(tripId, { publicOnly: false }),
      dbGetSettings(),
    ])

    const googleUrl = ((tripRow as Record<string, unknown> | null)?.googleBusinessUrl as string | null | undefined) ?? ""
    if (!googleUrl.trim()) return null

    const apiKey =
      ((settings.apiKeys as Record<string, string> | undefined)?.googleReviews ?? "").trim() ||
      (process.env.GOOGLE_PLACES_API_KEY ?? "")
    if (!apiKey) return null

    let placeId: string | null = extractPlaceId(googleUrl)
    let placeName: string | null = extractPlaceName(googleUrl)

    if (!placeId) {
      const resolved = await resolveShortlink(googleUrl)
      placeId = extractPlaceId(resolved)
      placeName = placeName ?? extractPlaceName(resolved)
    }

    if (!placeId && placeName) {
      placeId = await findPlaceIdByName(placeName, apiKey)
    }

    if (!placeId) return null

    let details = await fetchRatingOnly(placeId, apiKey)
    if (!details.ok && placeName) {
      const alt = await findPlaceIdByName(placeName, apiKey)
      if (alt && alt !== placeId) details = await fetchRatingOnly(alt, apiKey)
    }
    if (!details.ok) return null

    const rating = details.result.rating ?? 0
    const reviewCount = details.result.user_ratings_total ?? 0

    await dbUpdateTrip(tripId, { rating, reviewCount })
    return { rating, reviewCount }
  } catch (err) {
    console.warn("[google-rating-sync] failed for trip", tripId, err instanceof Error ? err.message : err)
    return null
  }
}
