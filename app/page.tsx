import { Navbar } from "@/components/site-navbar"
import { HeroSection } from "@/components/hero-section"
import { TrendingSection, WeatherSection, CategoriesSection, ReviewsSection, RecentlyViewed, StatsBar, DeparturesSoonSection } from "@/components/home-sections"
import { LastMinuteDealsSection } from "@/components/last-minute-deals-section"
import { SiteFooter } from "@/components/site-footer"
import { dbListTrips } from "@/lib/db/queries"
import { withTimeout } from "@/lib/db"
import { safeJsonLd } from "@/lib/json-ld"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

// Dynamic — itemListLd reflects only currently-published trips so archived
// items disappear from homepage structured data immediately.
export const dynamic = "force-dynamic"

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "sightseeing.lu",
  url: BASE,
  description: "Handpicked tours, activities, and experiences in and around Luxembourg.",
  areaServed: { "@type": "Country", name: "Luxembourg" },
}

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "sightseeing.lu",
  url: BASE,
  potentialAction: {
    "@type": "SearchAction",
    target: `${BASE}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
}

export default async function Page() {
  // Top-5 published trips for the ItemList JSON-LD. Fail-closed: empty list
  // on DB error so we never expose archived/draft trip references.
  const rows = (await withTimeout(
    dbListTrips({ publicOnly: true }).catch(() => []),
    2500,
    [],
  )) as Array<{
    slug?: string | null
    id: string
    title: string
    title_override?: string | null
    reviewCount?: number
  }>
  const top = rows
    .slice()
    .sort((a, b) => Number(b.reviewCount ?? 0) - Number(a.reviewCount ?? 0))
    .slice(0, 5)

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Popular Experiences in Luxembourg",
    itemListElement: top.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE}/trip/${String(t.slug || t.id)}`,
      name: t.title_override ?? t.title,
    })),
  }

  const schemas = top.length > 0
    ? [organizationLd, itemListLd, websiteLd]
    : [organizationLd, websiteLd]

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(schemas) }}
      />
      <Navbar />
      <HeroSection />
      <DeparturesSoonSection />
      <TrendingSection />
      <WeatherSection />
      <RecentlyViewed />
      <CategoriesSection />
      <LastMinuteDealsSection />
      <ReviewsSection />
      <StatsBar />
      <SiteFooter />
    </div>
  )
}
