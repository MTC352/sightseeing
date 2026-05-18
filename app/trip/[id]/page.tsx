import type { Metadata } from "next"
import { trips, getTripById, getTripDetail } from "@/lib/data"
import type { Trip } from "@/lib/data"
import TripDetailClient from "./trip-detail-view"
import { dbGetTrip } from "@/lib/db/queries"

function mapDbTrip(r: Record<string, unknown>): Trip {
  return {
    id: String(r.id),
    title: String((r.title_override ?? r.title) ?? ""),
    image: String(r.image ?? "/images/placeholder.jpg"),
    gallery: Array.isArray(r.gallery) ? (r.gallery as string[]).filter(Boolean) : [],
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

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const dbRow = await dbGetTrip(id, { publicOnly: true }).catch(() => null)
  const dbRowAny = await dbGetTrip(id).catch(() => null)
  const trip = dbRow
    ? mapDbTrip(dbRow as Record<string, unknown>)
    : (dbRowAny ? null : getTripById(id))
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

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const selectedDate = typeof sp.date === "string" ? sp.date : undefined
  const selectedTime = typeof sp.time === "string" ? sp.time : undefined

  const dbRow = await dbGetTrip(id, { publicOnly: true }).catch(() => null)
  // CRITICAL: only fall back to the static seed data when the trip exists
  // there but isn't in the DB at all (legacy seed IDs). NEVER fall back when
  // the DB has the trip with non-published status — that would expose drafts.
  const dbRowAny = await dbGetTrip(id).catch(() => null)
  const trip = dbRow
    ? mapDbTrip(dbRow as Record<string, unknown>)
    : (dbRowAny ? null : getTripById(id))
  const detail = getTripDetail(id)

  if (!trip) {
    return <TripDetailClient id={id} trip={null} selectedDate={selectedDate} selectedTime={selectedTime} />
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
      <TripDetailClient id={id} trip={trip} selectedDate={selectedDate} selectedTime={selectedTime} />
    </>
  )
}
