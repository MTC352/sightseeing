import { NextRequest, NextResponse } from "next/server"
import { dbGetSettings } from "@/lib/db/queries"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"

/* -----------------------------------------------------------------------
   Extracts a Place ID from a variety of Google Maps URL formats:
   - https://maps.google.com/?cid=XXXX
   - https://www.google.com/maps/place/Name/@lat,lng,z/data=...!1s<PLACE_ID>!...
   - Raw Place ID passed directly
   ----------------------------------------------------------------------- */
function extractPlaceId(url: string): string | null {
  try {
    // Raw Place ID (starts with ChIJ or EI...)
    if (/^ChIJ|^EI/.test(url)) return url

    const u = new URL(url)

    // ?cid= param
    const cid = u.searchParams.get("cid")
    if (cid) return cid

    // data= segment contains !1s<placeId>!
    const match = u.pathname.match(/!1s([^!]+)!/) || url.match(/!1s([^!]+)!/)
    if (match) return decodeURIComponent(match[1])

    return null
  } catch {
    return null
  }
}

/* Extract place name from Google Maps URL for text search fallback */
function extractPlaceName(url: string): string | null {
  try {
    const u = new URL(url)
    
    // https://www.google.com/maps/place/Place+Name/...
    const placeMatch = u.pathname.match(/\/place\/([^/@]+)/)
    if (placeMatch) {
      return decodeURIComponent(placeMatch[1].replace(/\+/g, " "))
    }
    
    return null
  } catch {
    return null
  }
}

/* Use Google Text Search to find Place ID by name */
async function findPlaceIdByName(name: string, apiKey: string): Promise<string | null> {
  try {
    const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(name)}&inputtype=textquery&fields=place_id&key=${apiKey}`
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

/* Resolve shortlinks by following redirects */
async function resolveShortlink(url: string): Promise<string> {
  try {
    // For share.google and goo.gl links, follow redirects
    if (url.includes("share.google") || url.includes("goo.gl") || url.includes("maps.app.goo.gl")) {
      const res = await fetch(url, { redirect: "follow" })
      return res.url
    }
    return url
  } catch {
    return url
  }
}

// Server-side response cache — keyed by the raw URL supplied by the caller (30-min TTL)
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

  // Serve from cache if available
  const cached = _reviewsCache.get(rawUrl)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data)
  }

  const settings = await dbGetSettings()
  const apiKey = settings.apiKeys?.googleReviews || process.env.GOOGLE_PLACES_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Places API key not configured. Add it in Admin → Integrations → Google Reviews.", reviews: [] },
      { status: 503 }
    )
  }

  try {
    // Step 1: Resolve shortlinks first
    const resolvedUrl = await resolveShortlink(rawUrl)
    
    // Step 2: Try to extract Place ID directly
    let placeId = extractPlaceId(resolvedUrl)
    
    // Step 3: If no Place ID, try text search with place name
    if (!placeId) {
      const placeName = extractPlaceName(resolvedUrl)
      if (placeName) {
        placeId = await findPlaceIdByName(placeName, apiKey)
      }
    }
    
    // Step 4: If still no Place ID, try text search with original URL path
    if (!placeId && rawUrl) {
      // Try searching with the business name from the share URL
      const urlParts = rawUrl.split("/")
      const lastPart = urlParts[urlParts.length - 1]
      if (lastPart && lastPart.length > 5) {
        // Could be a short code, try a broader search
        placeId = await findPlaceIdByName("Dinner Hopping Luxembourg", apiKey)
      }
    }

    if (!placeId) {
      return NextResponse.json(
        { error: "Could not find Place ID. Please use a full Google Maps URL with the place name visible (e.g., https://www.google.com/maps/place/Business+Name).", reviews: [] },
        { status: 400 }
      )
    }

    // Step 5: Fetch place details with reviews
    const fields = "name,rating,user_ratings_total,reviews"
    const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}&language=en`
    
    const res = await fetch(apiUrl)

    if (!res.ok) {
      throw new Error(`Places API HTTP ${res.status}`)
    }

    const json = await res.json()

    if (json.status !== "OK") {
      throw new Error(`Places API: ${json.status} — ${json.error_message ?? ""}`)
    }

    const { name, rating, user_ratings_total, reviews } = json.result

    const payload = {
      name,
      rating,
      totalReviews: user_ratings_total,
      reviews: (reviews ?? []).slice(0, 5).map((r: {
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
      })),
    }
    _reviewsCache.set(rawUrl, { data: payload, expiresAt: Date.now() + 30 * 60_000 })
    return NextResponse.json(payload)
  } catch (err) {
    console.error("[v0] Google Reviews fetch error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch reviews", reviews: [] },
      { status: 500 }
    )
  }
}
