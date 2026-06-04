import type { Metadata } from "next"
import { getTripById, getTripDetail } from "@/lib/data"
import type { Trip } from "@/lib/data"
import TripDetailClient, { type TripDbDetail, type TripFaq, type RelatedTrip } from "./trip-detail-view"
import { dbGetTrip, dbListTrips, dbTripStatus } from "@/lib/db/queries"

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

function s(v: unknown): string | undefined {
  if (v == null) return undefined
  const str = String(v).trim()
  return str.length > 0 ? str : undefined
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map(String).filter((x) => x.trim().length > 0) : []
}

/** Build a structured DB-detail object from a Palisis-synced trip row. */
function mapDbDetail(r: Record<string, unknown>): TripDbDetail {
  return {
    seoBody: s(r.seoBody),
    seoHighlights: arr(r.seoHighlights),
    shortDescription: s(r.shortDescription),
    longDescription: s(r.longDescription),
    experienceHighlights: s(r.experienceHighlights),
    included: arr(r.included),
    excluded: arr(r.excluded),
    itineraryText: s(r.itinerary),
    essentialInformation: s(r.essentialInformation),
    hotelPickupInstructions: s(r.hotelPickupInstructions),
    voucherRedemptionInstructions: s(r.voucherRedemptionInstructions),
    restrictions: s(r.restrictions),
    extras: s(r.extras),
    cancellationPolicy: s(r.cancellationPolicy),
    languages: arr(r.languages),
    tourType: s(r.tourType),
    tourLeader: s(r.tourLeader),
    grade: s(r.grade),
    departureLocation: s(r.departureLocation),
    endLocation: s(r.endLocation),
    country: s(r.country),
    pdfUrl: s(r.pdfUrl),
    videoUrl: s(r.videoUrl),
    minBookingSize: r.minBookingSize != null ? Number(r.minBookingSize) : undefined,
    maxBookingSize: r.maxBookingSize != null ? Number(r.maxBookingSize) : undefined,
    nonRefundable: r.nonRefundable === true,
  }
}

/**
 * Build a Q&A list that mirrors the original static "Good to know" UX, but
 * sourced from real DB fields. Falls back to the static `goodToKnow` block
 * for legacy seed trips that don't have rich Palisis data.
 */
function buildFaqs(
  dbDetail: TripDbDetail | null,
  trip: Trip,
  staticFaqs: { question: string; answer: string }[] | undefined,
): TripFaq[] {
  const out: TripFaq[] = []

  if (dbDetail) {
    if (dbDetail.cancellationPolicy) {
      out.push({ question: "What is the cancellation policy?", answer: dbDetail.cancellationPolicy })
    }
    if (dbDetail.essentialInformation) {
      out.push({ question: "What should I know before booking?", answer: dbDetail.essentialInformation })
    }
    if (dbDetail.hotelPickupInstructions) {
      out.push({ question: "Is there a hotel pickup?", answer: dbDetail.hotelPickupInstructions })
    }
    if (dbDetail.voucherRedemptionInstructions) {
      out.push({ question: "How do I redeem my voucher?", answer: dbDetail.voucherRedemptionInstructions })
    }
    if (dbDetail.restrictions) {
      out.push({ question: "Are there any restrictions?", answer: dbDetail.restrictions })
    }
    if (dbDetail.extras) {
      out.push({ question: "Are there optional extras or upgrades?", answer: dbDetail.extras })
    }
    if (dbDetail.languages.length > 0) {
      out.push({
        question: "What languages are available?",
        answer: `This experience is offered in ${dbDetail.languages.join(", ")}.`,
      })
    }
    if (dbDetail.minBookingSize != null || dbDetail.maxBookingSize != null) {
      const min = dbDetail.minBookingSize ?? 1
      const max = dbDetail.maxBookingSize ?? "any"
      out.push({
        question: "What's the group size?",
        answer: `This trip accepts ${min}–${max} people per booking.`,
      })
    }
    if (dbDetail.departureLocation) {
      out.push({ question: "Where does it start?", answer: dbDetail.departureLocation })
    }
  }

  // Always include a duration/price quick-fact so the accordion isn't empty
  if (out.length < 2) {
    out.push({
      question: "How long does it take?",
      answer: `Approximately ${trip.duration || "varies"}.`,
    })
    if (trip.price > 0) {
      out.push({
        question: "How much does it cost?",
        answer: `${trip.price.toFixed(2)} EUR per person.`,
      })
    }
  }

  // Append any legacy static FAQs that aren't duplicates of dynamic ones
  if (staticFaqs && staticFaqs.length > 0) {
    const seen = new Set(out.map((f) => f.question.toLowerCase()))
    for (const f of staticFaqs) {
      if (!seen.has(f.question.toLowerCase())) out.push(f)
    }
  }

  return out
}

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const dynamic = "force-dynamic"

/**
 * Resolve the trip strictly through the DB gate.
 *
 * Returns:
 *   - the published Trip if dbGetTrip(publicOnly) returns a row
 *   - null if the DB confirms either "no such trip" OR "trip exists but is
 *     archived/draft" — both must yield not-found to the public
 *   - null if any DB call throws (fail-CLOSED; never resurface static seed
 *     data on a DB outage)
 *
 * Static seed fallback (getTripById) is only allowed when the DB has been
 * successfully queried and confirms the ID is unknown to the DB entirely
 * (legacy seed IDs that were never imported).
 */
async function resolveTrip(id: string): Promise<{
  trip: Trip | null
  dbRow: Record<string, unknown> | null
}> {
  let dbRow: Record<string, unknown> | null = null
  try {
    dbRow = (await dbGetTrip(id, { publicOnly: true })) as Record<string, unknown> | null
  } catch (e) {
    console.error(`[trip/${id}] dbGetTrip(publicOnly) failed — fail-closed:`, e)
    return { trip: null, dbRow: null }
  }
  if (dbRow) return { trip: mapDbTrip(dbRow), dbRow }

  // Alias-aware existence probe (matches id OR palisis_id). Required because
  // imports use id=`tcms_<palisisId>` while the public URL may use the raw
  // numeric palisis_id — without this, an archived `tcms_123` would be
  // missed by a `/trip/123` lookup and fall through to static seed.
  let anyStatus: string | null = null
  try {
    anyStatus = await dbTripStatus(id)
  } catch (e) {
    console.error(`[trip/${id}] dbTripStatus failed — fail-closed:`, e)
    return { trip: null, dbRow: null }
  }
  // DB has the row under either identifier but it isn't published → not-found.
  if (anyStatus !== null) return { trip: null, dbRow: null }

  // DB successfully confirmed the ID is unknown under both id and palisis_id
  // → safe to use static seed for legacy IDs never imported into the DB.
  const seed = getTripById(id)
  return { trip: seed ?? null, dbRow: null }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const { trip, dbRow } = await resolveTrip(id)
  const detail = getTripDetail(id)
  const dbDetail = dbRow ? mapDbDetail(dbRow) : null

  if (!trip) {
    return { title: "Trip not found" }
  }

  // Prefer admin-optimised, import-safe SEO fields when present.
  const seoTitle = s(dbRow?.seoTitle) ?? trip.title
  const seoKeyword = s(dbRow?.seoKeyword)

  const description =
    s(dbRow?.seoMetaDescription) ??
    dbDetail?.shortDescription ??
    dbDetail?.longDescription ??
    detail?.description ??
    trip.description ??
    `Book ${trip.title} in ${trip.city ?? "Luxembourg"}. ${trip.duration} experience from ${trip.price.toFixed(2)} EUR.`

  // Dynamic OG card so every trip share / AI preview shows the trip's own
  // title, category and price instead of the generic site default.
  const ogParams = new URLSearchParams({
    eyebrow: trip.category,
    title: trip.title,
    subtitle: (description || "").slice(0, 140),
    price: trip.price > 0 ? `${trip.price.toFixed(0)} EUR` : "",
  })
  const ogImage = `${BASE}/api/og?${ogParams.toString()}`
  const imageUrl = trip.image.startsWith("/") ? `${BASE}${trip.image}` : trip.image
  const altText = seoKeyword
    ? `${seoKeyword} — ${trip.title}`
    : `${trip.title} — ${trip.category} experience in ${trip.city ?? "Luxembourg"}`

  return {
    title: seoTitle,
    description,
    keywords: [
      ...(seoKeyword ? [seoKeyword] : []),
      trip.category, trip.city ?? "Luxembourg", ...trip.tags, "Luxembourg tours", "sightseeing",
    ],
    alternates: {
      canonical: `${BASE}/trip/${trip.id}`,
    },
    openGraph: {
      type: "article",
      title: seoTitle,
      description,
      url: `${BASE}/trip/${trip.id}`,
      images: [
        { url: ogImage, width: 1200, height: 630, alt: altText },
        { url: imageUrl, width: 1200, height: 630, alt: altText },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description,
      images: [ogImage],
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
  // Origin of the slot link — drives the heading shown above the booking
  // iframe so visitors understand which homepage row they came from.
  // Accepted values: "deals" (Filling Up Fast) | "departing" (Departing Soon)
  // | "planner" (AI Trip Planner day itinerary "Book Now").
  const fromRaw = typeof sp.from === "string" ? sp.from : undefined
  const selectedFrom: "deals" | "departing" | "planner" | undefined =
    fromRaw === "deals" || fromRaw === "departing" || fromRaw === "planner" ? fromRaw : undefined

  const resolved = await resolveTrip(id)
  const { dbRow } = resolved
  let trip = resolved.trip
  const detail = getTripDetail(id)
  const dbDetail = dbRow ? mapDbDetail(dbRow) : null
  const faqs = trip ? buildFaqs(dbDetail, trip, detail?.goodToKnow) : []

  // Related trips: pull from DB (same category preferred, then others), exclude current
  const relatedTrips: RelatedTrip[] = await dbListTrips({ publicOnly: true })
    .catch(() => [])
    .then((rows) => {
      const list = (rows as Record<string, unknown>[]).filter((r) => String(r.id) !== id)
      const tripCat = trip?.category
      const sameCat = tripCat ? list.filter((r) => String(r.category) === tripCat) : []
      const others = list.filter((r) => !sameCat.includes(r))
      return [...sameCat, ...others].slice(0, 3).map((r) => ({
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
      }))
    })

  if (!trip) {
    return (
      <TripDetailClient
        id={id}
        trip={null}
        dbDetail={null}
        faqs={[]}
        relatedTrips={[]}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        selectedFrom={selectedFrom}
      />
    )
  }

  /* ─── Augment gallery when the upstream feed only gives us 1 image ────
   * Palisis/TourCMS often returns a single `images.image[]` entry per tour,
   * which leaves the trip-detail slider with just the cover photo and no
   * navigation. To restore the multi-image gallery UX, fall back to images
   * from related DB trips (same category preferred). Original static seed
   * did the same in lib/data.ts (see getTripDetail fallback).
   * We only augment when the trip itself doesn't already provide a true
   * multi-image gallery, and we keep the trip's own image first.            */
  if ((trip.gallery ?? []).length <= 1) {
    const base = trip.image ? [trip.image] : []
    const extras: string[] = []
    for (const r of relatedTrips) {
      if (r.image && r.image !== trip.image && !extras.includes(r.image)) {
        extras.push(r.image)
      }
      if (extras.length >= 3) break
    }
    if (extras.length > 0) {
      trip = { ...trip, gallery: [...base, ...extras] }
    }
  }

  const imageUrl = trip.image.startsWith("/") ? `${BASE}${trip.image}` : trip.image

  /* 1. TouristTrip + Product combined schema */
  const touristTripLd = {
    "@context": "https://schema.org",
    "@type": ["TouristTrip", "Product"],
    name: trip.title,
    description: s(dbRow?.seoMetaDescription) ?? dbDetail?.longDescription ?? dbDetail?.shortDescription ?? detail?.description ?? trip.description ?? trip.title,
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

  /* 3. FAQPage from synthesized dynamic FAQs */
  const faqLd =
    faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((faq) => ({
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

  // Safe JSON-LD serialization: escape characters that could break out of the
  // <script> tag. DB-sourced strings (description, FAQ answers) flow into this
  // payload, so a literal "</script>" in any field would otherwise allow HTML
  // injection. Also escape U+2028 / U+2029 which break some JSON.parse impls.
  const safeJsonLd = JSON.stringify(allSchemas)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd }}
      />
      <TripDetailClient
        id={id}
        trip={trip}
        dbDetail={dbDetail}
        faqs={faqs}
        relatedTrips={relatedTrips}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        selectedFrom={selectedFrom}
      />
    </>
  )
}
