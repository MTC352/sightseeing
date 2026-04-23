import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { trips, categories, reviews } from "@/lib/data"
import { MapPin, Users, Star, Award, Globe, Shield, Heart, ArrowRight } from "lucide-react"
import { AboutHeroText, AboutStoryText, AboutValuesHeading, AboutOfferHeading, AboutReviewsHeading } from "./about-content"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const metadata: Metadata = {
  title: "About Us",
  description: "sightseeing.lu is Luxembourg's leading tourism platform. We connect travellers with handpicked tours, activities, and local guides across the Grand Duchy since 2020.",
  alternates: { canonical: `${BASE}/about` },
  openGraph: {
    title: "About sightseeing.lu",
    description: "Luxembourg's leading tourism platform. Handpicked tours, activities, and local guides across the Grand Duchy.",
    url: `${BASE}/about`,
  },
}

const stats = [
  { label: "Experiences", value: `${trips.length}+` },
  { label: "Happy Travellers", value: "12,000+" },
  { label: "Customer Rating", value: "4.7/5" },
  { label: "Local Guides", value: "25+" },
]

const values = [
  { icon: Heart, title: "Passion for Luxembourg", description: "Every experience is handpicked by our team of locals who are passionate about showcasing the very best of the Grand Duchy." },
  { icon: Shield, title: "Quality Guarantee", description: "We personally vet every tour provider and guide. If an experience doesn't meet our standards, it doesn't make the cut." },
  { icon: Globe, title: "Multilingual Service", description: "Our tours are available in English, French, German, and Luxembourgish to welcome visitors from around the world." },
  { icon: Users, title: "Small Groups", description: "We prioritize intimate group sizes so every traveller gets a personal, authentic experience." },
]

export default function AboutPage() {
  const totalReviews = trips.reduce((sum, t) => sum + t.reviewCount, 0)

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
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.7",
      reviewCount: totalReviews.toString(),
    },
    areaServed: {
      "@type": "Country",
      name: "Luxembourg",
    },
    numberOfEmployees: { "@type": "QuantitativeValue", value: 25 },
    knowsAbout: categories.map((c) => c.name),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutLd) }} />
      <div className="min-h-screen bg-background">
        <Navbar />

        {/* Hero */}
        <section className="relative">
          <div className="relative h-[340px] lg:h-[420px]">
            <Image src="/images/about-hero.jpg" alt="Panoramic view of Luxembourg City" fill priority className="object-cover" sizes="100vw" />
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
              <Image src="/images/about-team.jpg" alt="The sightseeing.lu team" fill className="object-cover" sizes="(max-width:1024px) 100vw, 384px" />
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

        {/* Categories overview */}
        <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
          <AboutOfferHeading />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => {
              const catTrips = trips.filter((t) => t.category === cat.name)
              const minPrice = Math.min(...catTrips.map((t) => t.price).filter((p) => p > 0))
              return (
                <Link key={cat.name} href={`/experiences/${cat.name.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-")}`} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{cat.name}</h3>
                    <p className="text-xs text-muted-foreground">{catTrips.length} experiences from {minPrice.toFixed(0)} EUR</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              )
            })}
          </div>
        </section>

        {/* Reviews */}
        <section className="border-t border-border bg-card py-12">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="flex items-center gap-3">
              <AboutReviewsHeading />
              <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1">
                <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                <span className="text-xs font-semibold text-primary">4.7 average</span>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-background p-5">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-border"}`} />
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{r.text}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{r.author}</span>
                    <span className="text-[10px] text-muted-foreground">{r.tripTitle}</span>
                  </div>
                </div>
              ))}
            </div>
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
