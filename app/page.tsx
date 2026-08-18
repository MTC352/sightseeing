import type { Metadata } from "next"
import { Navbar } from "@/components/site-navbar"
import { HeroSection } from "@/components/hero-section"
import { TrendingSection, WeatherSection, CategoriesSection, ReviewsSection, RecentlyViewed, StatsBar, DeparturesSoonSection } from "@/components/home-sections"
import { LastMinuteDealsSection } from "@/components/last-minute-deals-section"
import { SiteFooter } from "@/components/site-footer"
import { dbListTrips } from "@/lib/db/queries"
import { withTimeout } from "@/lib/db"
import { safeJsonLd } from "@/lib/json-ld"
import { addLocale } from "@/lib/i18n/routing"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

// Static hreflang only — NOT generateMetadata. Converting home to
// generateMetadata would call headers()/cookies() and force this route
// dynamic, defeating the ISR (`revalidate` below) the deploy startup probe
// depends on. English is canonical; de/fr alternates are static since home
// has no page-specific metadata of its own (title/description/openGraph are
// inherited from the root layout).
export const metadata: Metadata = {
  alternates: {
    canonical: BASE,
    languages: {
      en: BASE,
      de: `${BASE}${addLocale("/", "de")}`,
      fr: `${BASE}${addLocale("/", "fr")}`,
      "x-default": BASE,
    },
  },
}

// ISR (NOT force-dynamic). The deploy startup probe hits `GET /` ~0.3s after
// boot; full per-request SSR of this large component tree on a cold autoscale
// instance takes >2s (independent of the DB), which blew the probe deadline and
// failed every publish. Serving `/` as prebuilt/cached HTML gives the probe an
// instant 200 with zero per-request render or DB work. The page regenerates in
// the background every 5 minutes, so archived trips drop out of the ItemList
// structured data within that window. All *visible* homepage content is
// client-fetched (RTK Query), so it stays live regardless of this page cache;
// only the JSON-LD reflects the ISR snapshot. The DB read below is fail-soft so
// the build-time prerender succeeds even when no database is reachable.
export const revalidate = 300

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
  //
  // Small 250ms budget for deploy-healthcheck safety: this read runs AFTER the
  // root layout's reads on the `/` critical path, so the budgets are additive.
  // The result feeds only the ItemList structured-data block (invisible SEO
  // metadata) — when omitted on a cold DB the page still renders fully and the
  // schema simply drops the ItemList. A warm DB resolves it in ~50ms.
  const rows = (await withTimeout(
    dbListTrips({ publicOnly: true }).catch(() => []),
    250,
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
