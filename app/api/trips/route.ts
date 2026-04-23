import { trips, categories } from "@/lib/data"
import { type NextRequest, NextResponse } from "next/server"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

/**
 * Public API endpoint for AI agents and developers.
 * Returns the full trip catalog as structured JSON.
 *
 * Query params:
 *   category – filter by category name (case-insensitive)
 *   city     – filter by city name (case-insensitive)
 *   minPrice – minimum price (inclusive)
 *   maxPrice – maximum price (inclusive)
 *   limit    – max results (default: all)
 *   sort     – "price" | "rating" | "reviews" (default: reviews desc)
 */
export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  let results = [...trips]

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
      cities: [...new Set(trips.map((t) => t.city).filter(Boolean))],
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
      city: t.city ?? "Luxembourg",
      provider: t.provider ?? "sightseeing.lu",
      description: t.description ?? null,
      tags: t.tags,
      badge: t.badge ?? null,
      image: t.image.startsWith("/") ? `${BASE}${t.image}` : t.image,
    })),
  }

  return NextResponse.json(response, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
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
