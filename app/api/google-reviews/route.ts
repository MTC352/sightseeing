import { NextRequest, NextResponse } from "next/server"
import { dbGetSettings, dbGetTrip } from "@/lib/db/queries"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"

/* -----------------------------------------------------------------------
   Extracts a Place ID from a variety of Google Maps URL formats:
   - https://maps.google.com/?cid=XXXX
   - https://www.google.com/maps/place/Name/@lat,lng,z/data=...!1s<PLACE_ID>!...
   - Raw Place ID passed directly (starts with ChIJ or EI)
   ----------------------------------------------------------------------- */
function extractPlaceId(url: string): string | null {
  try {
    if (/^ChIJ|^EI/.test(url)) return url

    const u = new URL(url)

    const cid = u.searchParams.get("cid")
    if (cid) return cid

    // `!1s<id>` token in the `data=` segment. May be terminated by another `!`
    // token OR sit at the very end of the string, so don't require a trailing `!`.
    const match = url.match(/!1s([^!?&]+)/)
    if (match) return decodeURIComponent(match[1])

    return null
  } catch {
    return null
  }
}

/* Use Google Text Search to find Place ID by business name */
async function findPlaceIdByName(name: string, apiKey: string): Promise<string | null> {
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

interface PlaceDetails {
  name?: string
  rating?: number
  user_ratings_total?: number
  reviews?: Array<Record<string, unknown>>
}

/* Fetch place details + reviews. Returns `{ ok:false, status }` for resolvable
   "bad place id" responses (NOT_FOUND / INVALID_REQUEST) so the caller can retry
   with a text-search-derived id; throws on transport / quota errors. */
async function fetchPlaceDetails(
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
  // Bad/stale place id — recoverable via text search
  if (json.status === "NOT_FOUND" || json.status === "INVALID_REQUEST" || json.status === "ZERO_RESULTS") {
    return { ok: false, status: json.status }
  }
  // Quota / auth / server errors — not recoverable by retrying with another id
  throw new Error(`Places API: ${json.status} — ${json.error_message ?? "unknown error"}`)
}

/* Allowlist of hostnames that are valid Google shortlink input domains */
const SHORTLINK_ALLOWED_HOSTS = new Set([
  "share.google",
  "goo.gl",
  "maps.app.goo.gl",
])

/* Allowlist of hostname suffixes that are valid Google redirect destinations */
function isAllowedRedirectHost(hostname: string): boolean {
  return (
    hostname === "google.com" ||
    hostname.endsWith(".google.com") ||
    hostname.endsWith(".googleapis.com")
  )
}

/* Block private / link-local / loopback destinations.
   Covers the most common SSRF pivots; hostname-level check before any fetch. */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  // Loopback / localhost
  if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true
  // IPv4 private ranges: 127.x, 10.x, 192.168.x, 172.16-31.x, 169.254.x (IMDS)
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  // IPv6 private / link-local prefixes
  if (/^fc[0-9a-f]{2}:/i.test(h) || /^fd[0-9a-f]{2}:/i.test(h)) return true
  if (/^fe80:/i.test(h)) return true
  return false
}

/* Validate a redirect-destination URL is safe to follow.
   Returns the validated URL string or null if it should be rejected. */
function validateRedirectTarget(rawUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== "https:") return null
  if (isPrivateHost(parsed.hostname)) return null
  if (!isAllowedRedirectHost(parsed.hostname)) return null
  return parsed.href
}

/* Resolve share.google / goo.gl shortlinks to the final Google Maps URL.
   Uses manual redirect handling so every hop is validated before being fetched.
   Only the initial request goes to an allowlisted shortlink host; redirects are
   only followed when the Location header points to an allowed Google domain.
   Private / internal IP destinations are rejected at every hop. */
async function resolveShortlink(url: string): Promise<string> {
  try {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return url
    }

    // Only accept HTTPS URLs whose hostname is exactly an allowlisted shortlink domain
    if (parsed.protocol !== "https:") return url
    if (!SHORTLINK_ALLOWED_HOSTS.has(parsed.hostname)) return url
    if (isPrivateHost(parsed.hostname)) return url

    // Follow redirects manually — validate each Location before requesting it
    const MAX_HOPS = 5
    let current = parsed.href
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const res = await fetch(current, {
        redirect: "manual",
        method: "GET",
      })

      // Not a redirect — current is the final URL
      if (res.status < 300 || res.status >= 400) return current

      const location = res.headers.get("location")
      if (!location) return current

      // Resolve relative Location headers against the current URL
      let nextUrl: string
      try {
        nextUrl = new URL(location, current).href
      } catch {
        return current
      }

      // Validate the next hop before following
      const safe = validateRedirectTarget(nextUrl)
      if (!safe) return url   // abort — return original input unchanged

      current = safe
    }

    return current
  } catch {
    return url
  }
}

/* Extract place name segment from a Google Maps URL */
function extractPlaceName(url: string): string | null {
  try {
    const u = new URL(url)
    const placeMatch = u.pathname.match(/\/place\/([^/@]+)/)
    if (placeMatch) {
      return decodeURIComponent(placeMatch[1].replace(/\+/g, " "))
    }
    return null
  } catch {
    return null
  }
}

// Server-side response cache — 30-min TTL, keyed by place ID
const _reviewsCache = new Map<string, { data: unknown; expiresAt: number }>()

function pruneReviewsCache() {
  const now = Date.now()
  for (const [key, entry] of _reviewsCache) {
    if (now >= entry.expiresAt) _reviewsCache.delete(key)
  }
}

export async function GET(request: NextRequest) {
  schedulePrune()
  pruneReviewsCache()

  const rl = rateLimit(request, { limit: 10, windowMs: 60_000 })
  if (!rl.allowed) return rl.response

  const { searchParams } = request.nextUrl

  const settings = await dbGetSettings()
  const apiKey =
    (settings.apiKeys as Record<string, string> | undefined)?.googleReviews ||
    process.env.GOOGLE_PLACES_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Google Places API key not configured. Add it in Admin → Integrations → Google Reviews.",
        reviews: [],
      },
      { status: 503 },
    )
  }

  /* ── Resolve Place ID ─────────────────────────────────────────────────
     Two scopes:
       • Homepage / global (default): the admin's stored `googlePlaceId` is the
         single business identity and takes top priority.
       • Per-trip (`scope=trip`): resolve strictly from the `google_business_url`
         stored on the trip row in our database — the caller supplies only a
         `tripId` and we look it up server-side. This prevents the endpoint from
         being used as a general-purpose Google Places proxy for arbitrary inputs.

     Resolution order:
       1. (global scope only) `googlePlaceId` stored in Admin → Integrations
       2. (trip scope) DB-stored `google_business_url` for the given tripId
       3. Raw Place ID pasted directly (ChIJ… / EI…)
       4. Place ID / CID extracted from a resolved Google Maps URL
       5. Text search using the place name from the URL
       6. (global scope only) Text search for "Sightseeing Luxembourg"
  ───────────────────────────────────────────────────────────────────── */
  const isTrip = searchParams.get("scope") === "trip"

  // Trip-scoped requests: resolve the Google Business URL from our own DB —
  // never from a caller-supplied URL.  This is the allowlist gate that stops
  // the endpoint being used as a public Google Places proxy.
  if (isTrip) {
    const tripId = searchParams.get("tripId") ?? ""
    if (!tripId) {
      return NextResponse.json({ error: "Missing tripId", reviews: [] }, { status: 400 })
    }

    let tripRow: Record<string, unknown> | null = null
    try {
      tripRow = (await dbGetTrip(tripId, { publicOnly: true })) as Record<string, unknown> | null
    } catch {
      tripRow = null
    }

    if (!tripRow) {
      return NextResponse.json({ error: "Trip not found", reviews: [] }, { status: 404 })
    }

    const storedUrl = (tripRow.googleBusinessUrl as string | null | undefined) ?? ""
    if (!storedUrl.trim()) {
      return NextResponse.json({ error: "No Google Business URL configured for this trip", reviews: [] }, { status: 404 })
    }

    // From here we continue with the stored URL as rawUrl — same resolution
    // logic below, but the input is DB-controlled, not caller-controlled.
    const tripCacheKey = `trip:${tripId}`
    const cached = _reviewsCache.get(tripCacheKey)
    if (cached && Date.now() < cached.expiresAt) {
      return NextResponse.json(cached.data)
    }

    let placeId: string | null = null
    let placeName: string | null = null

    try {
      placeId = extractPlaceId(storedUrl)
      placeName = extractPlaceName(storedUrl)

      if (!placeId) {
        const resolvedUrl = await resolveShortlink(storedUrl)
        placeId = extractPlaceId(resolvedUrl)
        placeName = placeName ?? extractPlaceName(resolvedUrl)
      }

      if (!placeId && placeName) {
        placeId = await findPlaceIdByName(placeName, apiKey)
      }

      if (!placeId) {
        return NextResponse.json(
          {
            error:
              "Could not resolve a Google Place ID for this trip. In the trip editor, paste the " +
              "business Place ID (most reliable) or a full Google Maps place URL that includes the business name.",
            reviews: [],
          },
          { status: 400 },
        )
      }

      let details = await fetchPlaceDetails(placeId, apiKey)
      if (!details.ok && placeName) {
        const alt = await findPlaceIdByName(placeName, apiKey)
        if (alt && alt !== placeId) details = await fetchPlaceDetails(alt, apiKey)
      }
      if (!details.ok) {
        throw new Error(`Places API: ${details.status}`)
      }

      const { name, rating, user_ratings_total, reviews } = details.result as {
        name?: string
        rating?: number
        user_ratings_total?: number
        reviews?: Array<Record<string, unknown>>
      }

      const payload = {
        name,
        rating,
        totalReviews: user_ratings_total,
        reviews: (reviews ?? []).slice(0, 5).map((r) => ({
          author: r.author_name as string,
          avatar: r.profile_photo_url as string,
          rating: r.rating as number,
          date: r.relative_time_description as string,
          text: r.text as string,
          url: r.author_url as string,
        })),
      }

      _reviewsCache.set(tripCacheKey, { data: payload, expiresAt: Date.now() + 30 * 60_000 })
      return NextResponse.json(payload)
    } catch (err) {
      console.error("[google-reviews] trip fetch error:", err)
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Failed to fetch Google reviews",
          reviews: [],
        },
        { status: 500 },
      )
    }
  }

  // ── Global / homepage scope ─────────────────────────────────────────
  // The caller-supplied `url` parameter is intentionally ignored here.
  // Identity is resolved exclusively from server-side-controlled sources:
  //   1. Admin-configured `googlePlaceId` (most specific, always preferred)
  //   2. Hardcoded fallback text search for the known business name
  // This prevents the unauthenticated endpoint from acting as a general-purpose
  // Google Places proxy for arbitrary caller-supplied identifiers.

  let placeId: string | null =
    ((settings.apiKeys as Record<string, string> | undefined)?.googlePlaceId ?? "").trim() || null

  const cacheKey = placeId ?? "global:sightseeing-luxembourg"

  const cached = _reviewsCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data)
  }

  try {
    // If no admin-configured Place ID, fall back to the known house business name.
    // This is a fixed server-side string — not influenced by caller input.
    if (!placeId) {
      placeId = await findPlaceIdByName("Sightseeing Luxembourg", apiKey)
    }

    if (!placeId) {
      return NextResponse.json(
        {
          error:
            "Could not resolve a Google Place ID. Go to Admin → Integrations → Google Reviews " +
            "and paste your Place ID directly (find it at developers.google.com/maps/documentation/places/web-service/place-id).",
          reviews: [],
        },
        { status: 400 },
      )
    }

    // Fetch place details + reviews.
    let details = await fetchPlaceDetails(placeId, apiKey)
    if (!details.ok) {
      throw new Error(`Places API: ${details.status}`)
    }

    const { name, rating, user_ratings_total, reviews } = details.result as {
      name?: string
      rating?: number
      user_ratings_total?: number
      reviews?: Array<Record<string, unknown>>
    }

    const payload = {
      name,
      rating,
      totalReviews: user_ratings_total,
      reviews: (reviews ?? []).slice(0, 5).map((r) => ({
        author: r.author_name as string,
        avatar: r.profile_photo_url as string,
        rating: r.rating as number,
        date: r.relative_time_description as string,
        text: r.text as string,
        url: r.author_url as string,
      })),
    }

    _reviewsCache.set(cacheKey, { data: payload, expiresAt: Date.now() + 30 * 60_000 })
    return NextResponse.json(payload)
  } catch (err) {
    console.error("[google-reviews] fetch error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch Google reviews",
        reviews: [],
      },
      { status: 500 },
    )
  }
}
