// Compact trip card for the planner `searchTrips` tool result.
//
// WHY THIS EXISTS — TPM token-bomb guard:
// On "skip all" onboarding the visitor has no interests, so `searchTrips` runs
// with no tags and returns the ENTIRE catalog (~18 trips). The tool result is
// then replayed on every subsequent turn. If each trip carries its full
// Palisis payload (longDescription, itinerary, essentialInformation, included/
// excluded, cancellationPolicy, hotel-pickup text, …) the result balloons to
// ~20k+ tokens, blows the OpenAI gpt-4o-mini per-minute TOKEN rate limit
// (`rate_limit_exceeded`), and the chat dies with "I couldn't reach the AI
// assistant" — even though the deterministic canvas already shows the trips.
//
// FIX: `searchTrips` returns only what is needed to (a) render the Trip Canvas
// cards on the client and (b) let the model select/order/triage. Heavy,
// per-trip prose is fetched on demand for a SINGLE trip via `getTripDetails`.
//
// The client (`aiTrips` memo in app/planner/page.tsx) only reads the card
// fields below, so trimming the rich fields does NOT change canvas rendering.

/** Fields accepted from a RichTrip. Intentionally permissive (null|undefined). */
export interface SearchCardInput {
  id: string
  title?: string | null
  image?: string | null
  price?: number | null
  originalPrice?: number | null
  rating?: number | null
  reviewCount?: number | null
  duration?: string | null
  category?: string | null
  tags?: string[] | null
  badge?: string | null
  city?: string | null
  description?: string | null
  highlights?: string[] | null
  // Small, low-token AI-useful fields (kept):
  tripTags?: string[] | null
  languages?: string[] | null
  tourType?: string | null
  departureLocation?: string | null
  country?: string | null
  nextBookableDate?: string | null
  lastBookableDate?: string | null
  minBookingSize?: number | null
  maxBookingSize?: number | null
  nonRefundable?: boolean | null
}

export interface SearchCard {
  id: string
  title?: string
  image?: string
  price?: number
  originalPrice?: number
  rating?: number
  reviewCount?: number
  duration?: string
  category?: string
  tags?: string[]
  badge?: string
  city?: string
  description?: string
  highlights?: string[]
  tripTags?: string[]
  languages?: string[]
  tourType?: string
  departureLocation?: string
  country?: string
  nextBookableDate?: string
  lastBookableDate?: string
  minBookingSize?: number
  maxBookingSize?: number
  nonRefundable?: boolean
}

/** Heavy per-trip fields deliberately EXCLUDED from search cards. */
export const HEAVY_FIELDS_EXCLUDED_FROM_SEARCH = [
  "longDescription",
  "experienceHighlights",
  "itinerary",
  "essentialInformation",
  "hotelPickupInstructions",
  "voucherRedemptionInstructions",
  "restrictions",
  "extras",
  "cancellationPolicy",
  "included",
  "excluded",
  "grade",
  "tourLeader",
  "accommodationRating",
  "endLocation",
  "shortDescription",
] as const

const MAX_DESCRIPTION = 300
const MAX_HIGHLIGHTS = 6

/** null → undefined so the key is dropped by JSON.stringify (smaller payload). */
function clean<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v
}

/**
 * Project a RichTrip onto the compact card sent to the model + client.
 * Bounds the only two free-text/array fields that survive (description,
 * highlights) so a single verbose trip can't reintroduce the token bloat.
 */
export function toSearchCard(t: SearchCardInput): SearchCard {
  const desc = clean(t.description)
  const highlights = clean(t.highlights)
  return {
    id: t.id,
    title: clean(t.title),
    image: clean(t.image),
    price: clean(t.price),
    originalPrice: clean(t.originalPrice),
    rating: clean(t.rating),
    reviewCount: clean(t.reviewCount),
    duration: clean(t.duration),
    category: clean(t.category),
    tags: clean(t.tags),
    badge: clean(t.badge),
    city: clean(t.city),
    description:
      desc && desc.length > MAX_DESCRIPTION
        ? desc.slice(0, MAX_DESCRIPTION).trimEnd() + "…"
        : desc,
    highlights: highlights ? highlights.slice(0, MAX_HIGHLIGHTS) : undefined,
    tripTags: clean(t.tripTags),
    languages: clean(t.languages),
    tourType: clean(t.tourType),
    departureLocation: clean(t.departureLocation),
    country: clean(t.country),
    nextBookableDate: clean(t.nextBookableDate),
    lastBookableDate: clean(t.lastBookableDate),
    minBookingSize: clean(t.minBookingSize),
    maxBookingSize: clean(t.maxBookingSize),
    nonRefundable: clean(t.nonRefundable),
  }
}
