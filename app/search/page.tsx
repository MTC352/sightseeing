import type { Metadata } from "next"
import { Suspense } from "react"
import { SearchContent, type SearchTrip } from "./search-content"
import { dbListTrips, dbGetSettings } from "@/lib/db/queries"
import { SiteFooter } from "@/components/site-footer"
import {
  readSearchFiltersConfig,
  DEFAULT_SEARCH_FILTERS_CONFIG,
  type SearchFiltersConfig,
} from "@/lib/search-filters-config"
import { localizedMetadata } from "@/lib/i18n/metadata"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    path: "/search",
    title: "Search Experiences",
    description: "Search and filter tours, activities, and experiences in Luxembourg. Find your perfect sightseeing adventure.",
  })
}

function mapDbRow(r: Record<string, unknown>): SearchTrip {
  return {
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
    // ── Palisis-rich fields used by the new filters ──
    tourType: r.tourType != null ? String(r.tourType) : undefined,
    tripTags: Array.isArray(r.tripTags) ? (r.tripTags as string[]) : [],
    departureLocation: r.departureLocation != null ? String(r.departureLocation) : undefined,
    departureGeocode: r.departureGeocode != null ? String(r.departureGeocode) : undefined,
  }
}

export default async function SearchPage() {
  const [rows, settings] = await Promise.all([
    dbListTrips({ publicOnly: true }).catch(() => []),
    dbGetSettings().catch(() => null),
  ])

  const trips = (rows as Record<string, unknown>[])
    .filter((r) => r.status === "published")
    .map(mapDbRow)

  const filtersConfig: SearchFiltersConfig = settings?.apiKeys
    ? readSearchFiltersConfig(settings.apiKeys as Record<string, string>)
    : DEFAULT_SEARCH_FILTERS_CONFIG

  return (
    <Suspense fallback={null}>
      <SearchContent initialTrips={trips} filtersConfig={filtersConfig} footer={<SiteFooter />} />
    </Suspense>
  )
}
