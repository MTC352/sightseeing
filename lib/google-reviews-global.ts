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

/** Google Text Search → Place ID by business name. An optional `locationBias`
 *  (the pin coordinates from the pasted Maps URL) disambiguates generic names
 *  like "City Tour Hop on Hop off" to the correct nearby business. */
export async function findPlaceIdByName(
  name: string,
  apiKey: string,
  locationBias?: { lat: number; lng: number } | null,
): Promise<string | null> {
  try {
    const bias = locationBias
      ? `&locationbias=point:${locationBias.lat},${locationBias.lng}`
      : ""
    const searchUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(name)}&inputtype=textquery&fields=place_id${bias}&key=${apiKey}`
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

// ── Persistent last-good copy ───────────────────────────────────────────────
// The in-memory cache is lost on every restart/redeploy and any Google error
// (quota, network, bad response) used to blank the homepage reviews. The last
// successful payload is kept in the integrations table: reused without calling
// Google for DB_FRESH_MS, and served — however old — whenever Google fails.
// Only a non-empty result ever overwrites it. Keyed by `source` (Place ID or the
// fallback search identity) so changing the Place ID never shows old reviews.
const DB_CACHE_KEY = "google_reviews_cache"
const DB_FRESH_MS = 6 * 60 * 60_000
// After a failure with nothing stored to fall back on, don't call Google again
// on every request.
const FAILURE_BACKOFF_MS = 5 * 60_000

interface StoredReviews {
  source: string
  fetchedAt: number
  data: GlobalReviews
}

let _lastFailure: { source: string; at: number; error: string } | null = null

async function readStoredReviews(source: string): Promise<StoredReviews | null> {
  try {
    const { queryOne } = await import("@/lib/db")
    const row = await queryOne<{ meta: unknown }>(
      `SELECT meta FROM integrations WHERE key = $1`,
      [DB_CACHE_KEY],
    )
    const stored = row?.meta as Partial<StoredReviews> | undefined
    if (!stored || stored.source !== source || typeof stored.fetchedAt !== "number") return null
    if (!Array.isArray(stored.data?.reviews) || stored.data.reviews.length === 0) return null
    return stored as StoredReviews
  } catch {
    return null
  }
}

async function writeStoredReviews(stored: StoredReviews): Promise<void> {
  try {
    const { query } = await import("@/lib/db")
    await query(
      `INSERT INTO integrations (key, label, value, meta, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, meta = EXCLUDED.meta, updated_at = NOW()`,
      [DB_CACHE_KEY, "Google Reviews Cache (internal)", String(stored.fetchedAt), JSON.stringify(stored)],
    )
  } catch {
    // Fail-soft: the in-memory copy still serves this process.
  }
}

/** Resolve + fetch the general Sightseeing.lu Google reviews. Never throws —
 *  returns `{ reviews: [], error }` on any failure so callers can fail soft.
 *  Prefers the stored last-good copy over an error or an empty result. */
export async function getGlobalGoogleReviews(): Promise<GlobalReviews> {
  const settings = await dbGetSettings()
  const apiKeys = settings.apiKeys as Record<string, string> | undefined
  const apiKey = apiKeys?.googleReviews || process.env.GOOGLE_PLACES_API_KEY

  let placeId: string | null = (apiKeys?.googlePlaceId ?? "").trim() || null
  const cacheKey = placeId ?? "global:sightseeing-luxembourg"
  const cached = _globalCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) return cached.data

  const stored = await readStoredReviews(cacheKey)
  if (stored && Date.now() - stored.fetchedAt < DB_FRESH_MS) {
    _globalCache.set(cacheKey, { data: stored.data, expiresAt: Date.now() + TTL_MS })
    return stored.data
  }

  const fail = (error: string): GlobalReviews => {
    _lastFailure = { source: cacheKey, at: Date.now(), error }
    return stored?.data ?? { reviews: [], error }
  }

  if (!apiKey) {
    return stored?.data ?? { reviews: [], error: "Google Places API key not configured" }
  }
  if (_lastFailure && _lastFailure.source === cacheKey && Date.now() - _lastFailure.at < FAILURE_BACKOFF_MS) {
    return stored?.data ?? { reviews: [], error: _lastFailure.error }
  }

  try {
    // Fixed server-side name — not influenced by caller input.
    if (!placeId) placeId = await findPlaceIdByName("Sightseeing Luxembourg", apiKey)
    if (!placeId) return fail("Could not resolve a Google Place ID")

    const details = await fetchPlaceDetails(placeId, apiKey)
    if (!details.ok) return fail(`Places API: ${details.status}`)

    const payload = normalizePlaceDetails(details.result)
    if (payload.reviews.length === 0 && stored) return stored.data

    _lastFailure = null
    _globalCache.set(cacheKey, { data: payload, expiresAt: Date.now() + TTL_MS })
    if (payload.reviews.length > 0) {
      await writeStoredReviews({ source: cacheKey, fetchedAt: Date.now(), data: payload })
    }
    return payload
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Failed to fetch Google reviews")
  }
}
