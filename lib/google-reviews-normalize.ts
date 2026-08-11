// Pure, dependency-free normalization of Google Place Details JSON.
// Kept free of any imports so it can be compiled + unit-tested in isolation
// by the `pretest` step (see package.json).

/** Public share link to the general Sightseeing.lu Google Business Profile.
 *  Single source of truth — imported by the homepage and About page. Lives
 *  here (not in google-reviews-global) so the client-side homepage can import
 *  it without pulling in the `server-only` helper module. */
export const GOOGLE_PROFILE_URL = "https://share.google/CMkITZRJksNDlPTRD"

export interface LiveReview {
  author: string
  avatar?: string
  rating: number
  date: string
  text: string
  url?: string
}

export interface GlobalReviews {
  name?: string
  rating?: number
  totalReviews?: number
  reviews: LiveReview[]
  error?: string
}

export interface RawPlaceDetails {
  name?: string
  rating?: number
  user_ratings_total?: number
  reviews?: Array<Record<string, unknown>>
}

/** Convert a Google Place Details `result` into our normalized review shape. */
export function normalizePlaceDetails(raw: RawPlaceDetails, max = 6): GlobalReviews {
  const rawReviews = Array.isArray(raw.reviews) ? raw.reviews : []
  return {
    name: raw.name,
    rating: typeof raw.rating === "number" ? raw.rating : undefined,
    totalReviews: typeof raw.user_ratings_total === "number" ? raw.user_ratings_total : undefined,
    reviews: rawReviews.slice(0, max).map((r) => ({
      author: (r.author_name as string) || "Google user",
      avatar: (r.profile_photo_url as string) || undefined,
      rating: typeof r.rating === "number" ? (r.rating as number) : 0,
      date: (r.relative_time_description as string) || "",
      text: (r.text as string) || "",
      url: (r.author_url as string) || undefined,
    })),
  }
}
