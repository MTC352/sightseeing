import type { Metadata } from "next"
import type { Trip } from "@/lib/data"
import ExploreClient from "./explore-client"
import { dbListTrips } from "@/lib/db/queries"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Explore All Experiences in Luxembourg",
  description: "Browse 45+ tours, activities, and experiences across Luxembourg. Filter by category, city, duration, and price. Wine tastings, castle tours, e-bike adventures, dinner hopping and more.",
  keywords: ["Luxembourg experiences", "Luxembourg activities", "things to do Luxembourg", "explore Luxembourg", "Luxembourg tours catalog"],
  alternates: {
    canonical: `${BASE}/explore`,
  },
  openGraph: {
    title: "Explore All Experiences in Luxembourg",
    description: "Browse 45+ tours, activities, and experiences across Luxembourg.",
    url: `${BASE}/explore`,
  },
}

export default async function ExplorePage() {
  const rows = await dbListTrips({ publicOnly: true }).catch(() => [])

  const dbTrips: Trip[] = rows
    .filter((r) => (r.status as string) === "published")
    .map((r) => ({
      id: String(r.id),
      slug: r.slug != null ? String(r.slug) : undefined,
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
    }))

  // Fail-closed: never fall back to static seed data, which would resurface
  // archived/draft trips. If the DB returns nothing, render an empty catalog.
  const tripList = dbTrips

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "All Experiences in Luxembourg",
    numberOfItems: tripList.length,
    itemListElement: tripList.map((trip, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE}/trip/${trip.id}`,
      name: trip.title,
      image: trip.image.startsWith("/") ? `${BASE}${trip.image}` : trip.image,
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
      <ExploreClient initialTrips={tripList} />
    </>
  )
}
