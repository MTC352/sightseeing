// Server-only by construction: reads settings from the DB (dbGetSettings) and
// is imported only by the API route + server components. Not importable from
// client bundles.
import { dbGetSettings } from "@/lib/db/queries"
import {
  normalizePlaceDetails,
  type GlobalReviews,
  type RawPlaceDetails,
} from "@/lib/google-reviews-normalize"

// Re-export the shared profile link so existing server-side importers keep
// resolving it from here. Canonical definition lives in google-reviews-normalize
// (dependency-free, importable from client components too).
export { GOOGLE_PROFILE_URL } from "@/lib/google-reviews-normalize"

export interface PlaceDetails extends RawPlaceDetails {}

/** Google Text Search → Place ID by business name. */
export async function findPlaceIdByName(name: string, apiKey: string): Promise<string | null> {
  try {
    const searchUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(name)}&inputtype=textquery&fields=place_id&key=${apiKey}`
    const res = await fetch(searchUrl)
    const json = await res.json()
    if (json.status === "OK" && json.candidates?.length > 0) {
      return json.candidates[0].place_id
    }
    return null
  } catch {
    return null
  }
}

/** Fetch place details + reviews. `{ ok:false, status }` for recoverable
 *  bad-place-id responses; throws on transport / quota errors. */
export async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<{ ok: true; result: PlaceDetails } | { ok: false; status: string }> {
  const fields = "name,rating,user_ratings_total,reviews"
  const apiUrl =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}&language=en`

  const res = await fetch(apiUrl)
  if (!res.ok) throw new Error(`Places API HTTP ${res.status}`)
  const json = await res.json()

  if (json.status === "OK") return { ok: true, result: json.result as PlaceDetails }
  if (json.status === "NOT_FOUND" || json.status === "INVALID_REQUEST" || json.status === "ZERO_RESULTS") {
    return { ok: false, status: json.status }
  }
  throw new Error(`Places API: ${json.status} — ${json.error_message ?? "unknown error"}`)
}

// 30-min in-memory cache for the general-account result (single identity).
const _globalCache = new Map<string, { data: GlobalReviews; expiresAt: number }>()
const TTL_MS = 30 * 60_000

/** Resolve + fetch the general Sightseeing.lu Google reviews. Never throws —
 *  returns `{ reviews: [], error }` on any failure so callers can fail soft. */
export async function getGlobalGoogleReviews(): Promise<GlobalReviews> {
  const settings = await dbGetSettings()
  const apiKeys = settings.apiKeys as Record<string, string> | undefined
  const apiKey = apiKeys?.googleReviews || process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return { reviews: [], error: "Google Places API key not configured" }
  }

  let placeId: string | null = (apiKeys?.googlePlaceId ?? "").trim() || null
  const cacheKey = placeId ?? "global:sightseeing-luxembourg"
  const cached = _globalCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) return cached.data

  try {
    // Fixed server-side name — not influenced by caller input.
    if (!placeId) placeId = await findPlaceIdByName("Sightseeing Luxembourg", apiKey)
    if (!placeId) return { reviews: [], error: "Could not resolve a Google Place ID" }

    const details = await fetchPlaceDetails(placeId, apiKey)
    if (!details.ok) return { reviews: [], error: `Places API: ${details.status}` }

    const payload = normalizePlaceDetails(details.result)
    _globalCache.set(cacheKey, { data: payload, expiresAt: Date.now() + TTL_MS })
    return payload
  } catch (err) {
    return { reviews: [], error: err instanceof Error ? err.message : "Failed to fetch Google reviews" }
  }
}
