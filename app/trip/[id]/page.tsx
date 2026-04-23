import type { Metadata } from "next"
import { trips, getTripById, getTripDetail } from "@/lib/data"
import TripDetailClient from "./trip-detail-view"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const trip = getTripById(id)
  const detail = getTripDetail(id)

  if (!trip) {
    return { title: "Trip not found" }
  }

  const description = detail?.description ?? `Book ${trip.title} in ${trip.city ?? "Luxembourg"}. ${trip.duration} experience from ${trip.price.toFixed(2)} EUR.`
  const imageUrl = trip.image.startsWith("/") ? `${BASE}${trip.image}` : trip.image

  return {
    title: trip.title,
    description,
    keywords: [trip.category, trip.city ?? "Luxembourg", ...trip.tags, "Luxembourg tours", "sightseeing"],
    alternates: {
      canonical: `${BASE}/trip/${trip.id}`,
    },
    openGraph: {
      type: "article",
      title: trip.title,
      description,
      url: `${BASE}/trip/${trip.id}`,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: trip.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: trip.title,
      description,
      images: [imageUrl],
    },
  }
}

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = getTripById(id)
  const detail = getTripDetail(id)

  if (!trip) {
    return <TripDetailClient id={id} trip={null} />
  }

  const imageUrl = trip.image.startsWith("/") ? `${BASE}${trip.image}` : trip.image

  /* 1. TouristTrip + Product combined schema */
  const touristTripLd = {
    "@context": "https://schema.org",
    "@type": ["TouristTrip", "Product"],
    name: trip.title,
    description: detail?.description ?? trip.title,
    image: imageUrl,
    url: `${BASE}/trip/${trip.id}`,
    touristType: trip.category,
    brand: { "@type": "Organization", name: "sightseeing.lu", url: BASE },
    offers: {
      "@type": "Offer",
      price: trip.price.toFixed(2),
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
      url: `${BASE}/trip/${trip.id}`,
      validFrom: "2025-01-01",
      priceValidUntil: "2026-12-31",
    },
    ...(trip.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: trip.rating.toString(),
            reviewCount: trip.reviewCount.toString(),
            bestRating: "5",
            worstRating: "1",
          },
        }
      : {}),
    provider: {
      "@type": "Organization",
      name: trip.provider ?? "sightseeing.lu",
    },
    duration: trip.duration,
    ...(trip.city
      ? {
          contentLocation: {
            "@type": "Place",
            name: trip.city,
            address: { "@type": "PostalAddress", addressLocality: trip.city, addressCountry: "LU" },
          },
        }
      : {}),
  }

  /* 2. BreadcrumbList */
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: trip.category, item: `${BASE}/experiences/${trip.category.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-")}` },
      { "@type": "ListItem", position: 3, name: trip.title, item: `${BASE}/trip/${trip.id}` },
    ],
  }

  /* 3. FAQPage from goodToKnow */
  const faqEntries = detail?.goodToKnow ?? []
  const faqLd =
    faqEntries.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqEntries.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        }
      : null

  /* 4. Speakable for answer-first paragraph */
  const speakableLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: trip.title,
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: [".trip-answer-first", ".trip-highlights"],
    },
    url: `${BASE}/trip/${trip.id}`,
  }

  const allSchemas = [touristTripLd, breadcrumbLd, speakableLd, ...(faqLd ? [faqLd] : [])]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(allSchemas) }}
      />
      <TripDetailClient id={id} trip={trip} />
    </>
  )
}
