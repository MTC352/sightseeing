import { type NextRequest, NextResponse } from "next/server"
import { dbListTrips } from "@/lib/db/queries"
import { categories } from "@/lib/data"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const dynamic = "force-dynamic"

type TripRow = {
  id: string
  title: string
  title_override?: string | null
  price: number
  originalPrice?: number | null
  duration: string | null
  rating: number
  reviewCount: number
  category: string
  city?: string | null
  provider?: string | null
  description?: string | null
  tags?: string[] | null
  badge?: string | null
  image?: string | null
}

/**
 * Public API endpoint for AI agents and developers.
 * Returns the full PUBLISHED trip catalog from the DB as structured JSON.
 * Archived and draft trips are excluded.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  // DB-backed (publicOnly) — archived/draft trips are excluded at the query level.
  const rows = (await dbListTrips({ publicOnly: true }).catch(() => [])) as TripRow[]

  let results = rows.map((r) => ({
    id: String(r.id),
    title: r.title_override ?? r.title,
    price: Number(r.price ?? 0),
    originalPrice: r.originalPrice != null ? Number(r.originalPrice) : undefined,
    duration: r.duration ?? "",
    rating: Number(r.rating ?? 0),
    reviewCount: Number(r.reviewCount ?? 0),
    category: r.category,
    city: r.city ?? "Luxembourg",
    provider: r.provider ?? "sightseeing.lu",
    description: r.description ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    badge: r.badge ?? null,
    image: r.image ?? "/placeholder.svg",
  }))

  /* Filters */
  const category = searchParams.get("category")
  if (category) {
    results = results.filter((t) => t.category.toLowerCase() === category.toLowerCase())
  }

  const city = searchParams.get("city")
  if (city) {
    results = results.filter((t) => t.city?.toLowerCase() === city.toLowerCase())
  }

  const minPrice = searchParams.get("minPrice")
  if (minPrice) {
    results = results.filter((t) => t.price >= Number(minPrice))
  }

  const maxPrice = searchParams.get("maxPrice")
  if (maxPrice) {
    results = results.filter((t) => t.price <= Number(maxPrice))
  }

  /* Sort */
  const sort = searchParams.get("sort")
  if (sort === "price") {
    results.sort((a, b) => a.price - b.price)
  } else if (sort === "rating") {
    results.sort((a, b) => b.rating - a.rating)
  } else {
    results.sort((a, b) => b.reviewCount - a.reviewCount)
  }

  /* Limit */
  const limit = searchParams.get("limit")
  if (limit) {
    results = results.slice(0, Number(limit))
  }

  const response = {
    meta: {
      total: results.length,
      categories: categories.map((c) => c.name),
      cities: [...new Set(rows.map((t) => t.city).filter(Boolean))],
      generatedAt: new Date().toISOString(),
      source: "sightseeing.lu",
      docs: `${BASE}/llms.txt`,
    },
    trips: results.map((t) => ({
      id: t.id,
      title: t.title,
      url: `${BASE}/trip/${t.id}`,
      price: t.price,
      currency: "EUR",
      duration: t.duration,
      rating: t.rating,
      reviewCount: t.reviewCount,
      category: t.category,
      city: t.city,
      provider: t.provider,
      description: t.description,
      tags: t.tags,
      badge: t.badge,
      image: t.image.startsWith("/") ? `${BASE}${t.image}` : t.image,
    })),
  }

  return NextResponse.json(response, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  })
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
