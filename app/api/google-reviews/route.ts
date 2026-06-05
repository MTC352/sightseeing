import { NextRequest, NextResponse } from "next/server"
import { dbGetSettings } from "@/lib/db/queries"
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

    const match = u.pathname.match(/!1s([^!]+)!/) || url.match(/!1s([^!]+)!/)
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
  const rawUrl = searchParams.get("url") ?? ""

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
     Priority order:
       1. `googlePlaceId` stored in Admin → Integrations (most reliable)
       2. Raw Place ID passed directly in the URL param
       3. Place ID extracted from a resolved Google Maps URL
       4. Text search using the place name from the URL
       5. Text search for "Sightseeing Luxembourg" (final fallback)
  ───────────────────────────────────────────────────────────────────── */
  let placeId: string | null =
    ((settings.apiKeys as Record<string, string> | undefined)?.googlePlaceId ?? "").trim() ||
    null

  // Cache key: prefer the stored Place ID, otherwise the raw URL
  const cacheKey = placeId ?? rawUrl

  const cached = _reviewsCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data)
  }

  try {
    if (!placeId && rawUrl) {
      // Try direct extraction from the raw URL first (works for full Maps URLs)
      placeId = extractPlaceId(rawUrl)

      // Follow the shortlink redirect and try again
      if (!placeId) {
        const resolvedUrl = await resolveShortlink(rawUrl)
        placeId = extractPlaceId(resolvedUrl)

        // Try text search with the place name embedded in the resolved URL
        if (!placeId) {
          const placeName = extractPlaceName(resolvedUrl)
          if (placeName) {
            placeId = await findPlaceIdByName(placeName, apiKey)
          }
        }
      }

      // Final fallback: text search for the known business name
      if (!placeId) {
        placeId = await findPlaceIdByName("Sightseeing Luxembourg", apiKey)
      }
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

    // Fetch place details + reviews from the Places API
    const fields = "name,rating,user_ratings_total,reviews"
    const apiUrl =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}&language=en`

    const res = await fetch(apiUrl)
    if (!res.ok) throw new Error(`Places API HTTP ${res.status}`)

    const json = await res.json()
    if (json.status !== "OK") {
      throw new Error(`Places API: ${json.status} — ${json.error_message ?? "unknown error"}`)
    }

    const { name, rating, user_ratings_total, reviews } = json.result

    const payload = {
      name,
      rating,
      totalReviews: user_ratings_total,
      reviews: (reviews ?? []).slice(0, 5).map(
        (r: {
          author_name: string
          profile_photo_url: string
          rating: number
          relative_time_description: string
          text: string
          author_url: string
        }) => ({
          author: r.author_name,
          avatar: r.profile_photo_url,
          rating: r.rating,
          date: r.relative_time_description,
          text: r.text,
          url: r.author_url,
        }),
      ),
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
