import type { Metadata } from "next"
import { Suspense } from "react"
import { SearchContent } from "./search-content"
import { dbListTrips } from "@/lib/db/queries"
import type { Trip } from "@/lib/data"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Search Experiences",
  description: "Search and filter tours, activities, and experiences in Luxembourg. Find your perfect sightseeing adventure.",
  alternates: {
    canonical: `${BASE}/search`,
  },
  openGraph: {
    title: "Search Experiences | sightseeing.lu",
    description: "Search and filter tours, activities, and experiences in Luxembourg.",
    url: `${BASE}/search`,
  },
}

function mapDbRow(r: Record<string, unknown>): Trip {
  return {
    id: String(r.id),
    title: String((r.title_override ?? r.title) ?? ""),
    image: String(r.image ?? "/images/placeholder.jpg"),
    price: Number(r.price ?? 0),
    originalPrice: r.originalPrice != null ? Number(r.originalPrice) : undefined,
    rating: Number(r.rating ?? 0),
    reviewCount: Number(r.reviewCount ?? 0),
    duration: String(r.duration ?? ""),
    category: String(r.category ?? ""),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    badge: r.badge != null ? String(r.badge) : undefined,
    city: r.city != null ? String(r.city) : undefined,
    description: r.description != null ? String(r.description) : undefined,
    permalink: r.permalink != null ? String(r.permalink) : undefined,
    provider: r.provider != null ? String(r.provider) : undefined,
    highlights: Array.isArray(r.highlights) ? (r.highlights as string[]) : [],
    googleBusinessUrl: r.googleBusinessUrl != null ? String(r.googleBusinessUrl) : undefined,
  }
}

export default async function SearchPage() {
  const rows = await dbListTrips().catch(() => [])
  const trips = (rows as Record<string, unknown>[])
    .filter((r) => r.status === "published")
    .map(mapDbRow)

  return (
    <Suspense fallback={null}>
      <SearchContent initialTrips={trips} />
    </Suspense>
  )
}
