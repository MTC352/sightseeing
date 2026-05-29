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

/* Resolve share.google / goo.gl shortlinks by following redirects */
async function resolveShortlink(url: string): Promise<string> {
  try {
    if (
      url.includes("share.google") ||
      url.includes("goo.gl") ||
      url.includes("maps.app.goo.gl")
    ) {
      const res = await fetch(url, { redirect: "follow" })
      return res.url
    }
    return url
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
