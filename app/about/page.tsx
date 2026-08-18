import type { Metadata } from "next"
import { Link } from "@/components/i18n/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { dbListTrips, dbListHomepageTripTagsWithCounts } from "@/lib/db/queries"
import { getGlobalGoogleReviews, GOOGLE_PROFILE_URL } from "@/lib/google-reviews-global"
import { AboutGoogleReviews } from "@/components/about-google-reviews"
import { iconForSlug } from "@/lib/tag-icons"
import { MapPin, Users, Award, Globe, Shield, Heart, ArrowRight } from "lucide-react"
import { AboutHeroText, AboutStoryText, AboutValuesHeading, AboutOfferHeading, AboutReviewsHeading, AboutHeroImage, AboutTeamImage } from "./about-content"
import { localizedMetadata } from "@/lib/i18n/metadata"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

// Dynamic — counts/prices/aggregate-rating reflect only currently-published
// trips so archived/draft trips never contribute to public stats or JSON-LD.
export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    path: "/about",
    title: "About Us",
    description: "sightseeing.lu is Luxembourg's leading tourism platform. We connect travellers with handpicked tours, activities, and local guides across the Grand Duchy since 2020.",
  })
}

const values = [
  { icon: Heart, title: "Passion for Luxembourg", description: "Every experience is handpicked by our team of locals who are passionate about showcasing the very best of the Grand Duchy." },
  { icon: Shield, title: "Quality Guarantee", description: "We personally vet every tour provider and guide. If an experience doesn't meet our standards, it doesn't make the cut." },
  { icon: Globe, title: "Multilingual Service", description: "Our tours are available in English, French, German, and Luxembourgish to welcome visitors from around the world." },
  { icon: Users, title: "Small Groups", description: "We prioritize intimate group sizes so every traveller gets a personal, authentic experience." },
]

type AboutTrip = {
  id: string
  category?: string | null
  price?: number | null
  reviewCount?: number | null
}

export default async function AboutPage() {
  // Fail-closed: empty array on DB error so no static/archived data leaks.
  const publishedTrips = (await dbListTrips({ publicOnly: true }).catch(() => [])) as AboutTrip[]

  // Dynamic categories — same admin-managed homepage trip tags the Home page
  // "Currently trending categories" section uses. Fail-soft to [] on DB error.
  const offerTags = await dbListHomepageTripTagsWithCounts().catch(() => [])

  // Live general-account Google reviews. Fail-soft: null → stats/JSON-LD fall
  // back to the historical 4.7, and the section shows its graceful fallback.
  const google = await getGlobalGoogleReviews().catch(() => null)
  const liveRating = typeof google?.rating === "number" ? google.rating : null
  const liveReviewCount = typeof google?.totalReviews === "number" ? google.totalReviews : null

  const totalReviews = publishedTrips.reduce((sum, t) => sum + Number(t.reviewCount ?? 0), 0)
  const experienceCount = publishedTrips.length

  const stats = [
    { label: "Experiences", value: experienceCount > 0 ? `${experienceCount}+` : "—" },
    { label: "Happy Travellers", value: "12,000+" },
    { label: "Customer Rating", value: liveRating ? `${liveRating.toFixed(1)}/5` : "4.7/5" },
    { label: "Local Guides", value: "25+" },
  ]

  const aboutLd = {
    "@context": "https://schema.org",
    "@type": "TouristInformationCenter",
    name: "sightseeing.lu",
    description: "Luxembourg's leading tourism platform offering handpicked tours, activities, and experiences with local guides.",
    url: BASE,
    logo: `${BASE}/images/logo.png`,
    foundingDate: "2020",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Luxembourg City",
      addressCountry: "LU",
    },
    contactPoint: {
      "@type": "ContactPoint",
      email: "info@sightseeing.lu",
      telephone: "+352123456",
      contactType: "customer service",
      availableLanguage: ["English", "French", "German", "Luxembourgish"],
    },
    aggregateRating: (liveRating !== null || totalReviews > 0) ? {
      "@type": "AggregateRating",
      ratingValue: (liveRating ?? 4.7).toFixed(1),
      reviewCount: (liveReviewCount ?? totalReviews).toString(),
    } : undefined,
    areaServed: {
      "@type": "Country",
      name: "Luxembourg",
    },
    numberOfEmployees: { "@type": "QuantitativeValue", value: 25 },
    knowsAbout: offerTags.map((t) => t.label),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutLd) }} />
      <div className="min-h-screen bg-background">
        <Navbar />

        {/* Hero */}
        <section className="relative">
          <div className="relative h-[340px] lg:h-[420px]">
            <AboutHeroImage />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          </div>
          <div className="absolute inset-0 flex items-end">
            <div className="mx-auto w-full max-w-7xl px-4 pb-10 lg:px-8">
              <AboutHeroText />
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 text-center">
                <span className="text-2xl font-bold text-primary">{s.value}</span>
                <span className="mt-1 text-xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Our story */}
        <section className="mx-auto max-w-7xl px-4 pb-12 lg:px-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
            <div className="flex-1">
              <AboutStoryText />
            </div>
            <div className="relative h-64 w-full overflow-hidden rounded-2xl lg:h-80 lg:w-96">
              <AboutTeamImage />
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="border-t border-border bg-card py-12">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <AboutValuesHeading />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {values.map((v) => (
                <div key={v.title} className="rounded-xl border border-border bg-background p-5">
                  <v.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{v.title}</h3>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{v.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Categories overview — DYNAMIC: mirrors the Home page "Currently
            trending categories" (admin-managed homepage trip tags). The grid is
            data-no-edit so frontend Edit Mode never tags it as editable; only
            the AboutOfferHeading (static copy) stays editable. */}
        {offerTags.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <AboutOfferHeading />
            <div data-no-edit className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {offerTags.map((tag) => {
                const Icon = iconForSlug(tag.slug)
                return (
                  <Link key={tag.slug} href={`/search?tag=${encodeURIComponent(tag.slug)}`} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{tag.label}</h3>
                        <p className="text-xs text-muted-foreground">
                          {tag.trip_count} experience{tag.trip_count === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Reviews */}
        <section className="border-t border-border bg-card py-12">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <AboutReviewsHeading />
            <AboutGoogleReviews data={google} profileUrl={GOOGLE_PROFILE_URL} />
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-4 py-12 text-center lg:px-8">
          <h2 className="text-2xl font-bold text-foreground">Ready to Explore Luxembourg?</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Browse our full catalog of handpicked experiences and find your perfect adventure.</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/explore" className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              Explore All Experiences
            </Link>
            <Link href="/planner" className="rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/30">
              AI Trip Planner
            </Link>
          </div>
        </section>

        <SiteFooter />
      </div>
    </>
  )
}
