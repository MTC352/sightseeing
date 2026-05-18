import { Navbar } from "@/components/site-navbar"
import { HeroSection } from "@/components/hero-section"
import { TrendingSection, WeatherSection, CategoriesSection, ReviewsSection, RecentlyViewed, StatsBar, DeparturesSoonSection } from "@/components/home-sections"
import { LastMinuteDealsSection } from "@/components/last-minute-deals-section"
import { SiteFooter } from "@/components/site-footer"
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

/* JSON-LD: Organization — kept small to stay under the 128 kB page data limit */
const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "sightseeing.lu",
  url: BASE,
  description: "Handpicked tours, activities, and experiences in and around Luxembourg.",
  areaServed: { "@type": "Country", name: "Luxembourg" },
}

/* Hardcoded top-5 for the ItemList — avoids importing + serializing the full trips array */
const itemListLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Popular Experiences in Luxembourg",
  itemListElement: [
    { "@type": "ListItem", position: 1, url: `${BASE}/trip/31898`, name: "Sightseeing City Tour" },
    { "@type": "ListItem", position: 2, url: `${BASE}/trip/31464`, name: "Guided Tour - Printing Museum in Grevenmacher" },
    { "@type": "ListItem", position: 3, url: `${BASE}/trip/31318`, name: "Climbing Initiation in Echternach" },
    { "@type": "ListItem", position: 4, url: `${BASE}/trip/32018`, name: "Guided E-Bike Tour" },
    { "@type": "ListItem", position: 5, url: `${BASE}/trip/31967`, name: "Dinner Hopping - Italian" },
  ],
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

export default function Page() {
  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([organizationLd, itemListLd, websiteLd]) }}
      />
      <Navbar />
      <HeroSection />
      <TrendingSection />
      <DeparturesSoonSection />
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
