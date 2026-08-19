"use client"

import { useState, useEffect, memo } from "react"
import { trackTripView } from "@/lib/use-recently-viewed"
import Image from "next/image"
import { Link } from "@/components/i18n/link"
import { useRouter } from "next/navigation"

import { Navbar } from "@/components/site-navbar"
import type { ReactNode } from "react"
import { TripCard } from "@/components/trip-card"
import { TripChat } from "@/components/trip-chat"
import { GoogleReviews } from "@/components/google-reviews"
import { TripItinerary } from "@/components/trip-itinerary"
import { useCart } from "@/lib/cart-context"
import { getTripDetail, type Trip } from "@/lib/data"
import { resolveBookingUrl } from "@/lib/booking-url"
import { sanitizeRichText } from "@/lib/sanitize-html"
import { Star, Clock, MapPin, Users, Check, ChevronLeft, ChevronRight, ShoppingBag, Shield, Globe, CloudSun, CloudRain, Sun, Wind, Droplets, Loader2, X } from "lucide-react"
import { useWeather } from "@/hooks/use-weather"

const WEATHER_ICONS: Record<string, React.ElementType> = { "cloud-sun": CloudSun, "cloud-rain": CloudRain, sun: Sun }

/* ─── Types shared with the server page ─────────────────────────────── */
export type TripDbDetail = {
  seoBody?: string
  seoHighlights?: string[]
  shortDescription?: string
  longDescription?: string
  experienceHighlights?: string
  included: string[]
  excluded: string[]
  itineraryText?: string
  itinerarySteps?: { name: string; description: string; lat?: number | null; lng?: number | null; placeName?: string | null }[]
  essentialInformation?: string
  hotelPickupInstructions?: string
  voucherRedemptionInstructions?: string
  restrictions?: string
  extras?: string
  cancellationPolicy?: string
  languages: string[]
  tourType?: string
  tourLeader?: string
  grade?: string
  departureLocation?: string
  endLocation?: string
  country?: string
  pdfUrl?: string
  videoUrl?: string
  palisisProductId?: string | null
  customIframeUrl?: string | null
  minBookingSize?: number
  maxBookingSize?: number
  nonRefundable?: boolean
}

export type TripFaq = { question: string; answer: string }

export type RelatedTrip = {
  id: string
  slug?: string
  title: string
  image: string
  price: number
  originalPrice?: number
  rating: number
  reviewCount: number
  duration: string
  category: string
  tags: string[]
  badge?: string
  city?: string
}

function formatSelectedDate(iso: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number)
    if (!y || !m || !d) return iso
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    })
  } catch {
    return iso
  }
}

const BookingIframe = memo(function BookingIframe({ src, title, fill = false }: { src: string; title: string; fill?: boolean }) {
  // Show a loader until the booking widget's iframe finishes loading, so the
  // (tall) widget area never sits visually blank while the external widget boots.
  // `fill` mode is used inside the mobile fullscreen modal, where the iframe
  // should occupy all available height instead of the fixed clamp used inline.
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={fill ? "flex h-full flex-col overflow-hidden bg-card" : "overflow-hidden rounded-2xl border border-border bg-card shadow-sm"}>
      <div className={fill ? "relative flex-1" : "booking-iframe-wrap relative"}>
        {!loaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading booking options…</span>
          </div>
        )}
        <iframe
          src={src}
          title={title}
          className={fill ? "block h-full w-full border-0" : "booking-iframe"}
          allow="payment"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 200ms ease" }}
        />
      </div>
    </div>
  )
})

export default function TripDetailClient({
  id,
  trip: serverTrip,
  dbDetail,
  faqs,
  relatedTrips,
  selectedDate,
  selectedTime,
  selectedFrom,
  footer,
}: {
  id: string
  trip: Trip | null
  dbDetail: TripDbDetail | null
  faqs: TripFaq[]
  relatedTrips: RelatedTrip[]
  selectedDate?: string
  selectedTime?: string
  /** Which rail the visitor clicked to land here, so the selected-slot banner
   *  can be labelled accurately ("Fill up fast slot", "Soon departuring slot",
   *  "Trip Planner Slot") instead of the generic "Your selected slot". */
  selectedFrom?: "deals" | "departing" | "planner"
  footer?: ReactNode
}) {
  // Map of source → eyebrow text shown above the date/time inside the
  // selected-slot card. Falls back to the original generic label when the
  // visitor lands without a `from` hint (e.g. direct link, search result).
  const slotEyebrow =
    selectedFrom === "deals"
      ? "Fill up fast slot"
      : selectedFrom === "departing"
        ? "Soon departuring slot"
        : selectedFrom === "planner"
          ? "Trip Planner Slot"
          : "Your selected slot"
  // Fail-closed: only honor the server-supplied trip. Never fall back to the
  // static seed catalog — the server gate (dbGetTrip publicOnly) is the sole
  // source of truth for whether this trip is publishable.
  const trip = serverTrip
  const detail = getTripDetail(id)

  const { addItem, isInCart } = useCart()
  const [galleryIdx, setGalleryIdx] = useState(0)
  const { weather, isLoading: weatherLoading } = useWeather()
  const router = useRouter()
  const [canGoBack, setCanGoBack] = useState(false)
  // Mobile-only: the booking iframe opens as a fullscreen in-page modal on tap,
  // avoiding the scroll-trapping that happens with a tall iframe embedded inline.
  const [bookingModalOpen, setBookingModalOpen] = useState(false)

  useEffect(() => {
    setCanGoBack(window.history.length > 2)
  }, [])

  // Lock body scroll while the fullscreen booking modal is open.
  useEffect(() => {
    if (!bookingModalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [bookingModalOpen])

  // Record this trip as "recently viewed" so the home-page rail can surface it
  // on the visitor's next visit. Skipped if the trip didn't resolve.
  useEffect(() => {
    if (trip?.id !== undefined && trip?.id !== null) {
      trackTripView(trip.id)
    }
  }, [trip?.id])

  if (!trip) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
          <p className="text-lg font-semibold text-foreground">Trip not found</p>
          <Link href="/" className="mt-4 text-sm text-primary hover:underline">Back to homepage</Link>
        </div>
      </div>
    )
  }

  const inCart = isInCart(trip.id)

  // Booking widget URL — resolution priority: custom iframe URL → Palisis
  // Product ID → TourCMS permalink. Hoisted here so the inline widget, the
  // mobile sticky bar, and the fullscreen modal all share one source of truth.
  const bookingUrl = resolveBookingUrl(trip, selectedDate, selectedTime)
  // The pre-selection banner is only meaningful for the TourCMS calendar widget
  // (permalink); the Palisis direct widgets open straight on the booking form.
  const isTourcmsCalendar = !trip.customIframeUrl?.trim() && !trip.palisisProductId?.trim()
  const showSlotBanner = Boolean(selectedDate && selectedTime && isTourcmsCalendar)

  // Gallery priority: DB → legacy static detail gallery → featured image only
  const gallery: string[] = (
    (trip.gallery ?? []).length > 0
      ? trip.gallery!
      : (detail?.gallery ?? []).length > 0
        ? detail!.gallery
        : [trip.image]
  ).filter(Boolean)

  /* ─── Merge DB + static for displayed fields ────────────────────────── */
  // Admin-optimised SEO body is authored in a rich-text editor and rendered as
  // its own formatted block below the answer-first sentence (see JSX). When it's
  // present it owns the description, so we don't also flatten it into the intro.
  const seoBodyHtml = dbDetail?.seoBody ? sanitizeRichText(dbDetail.seoBody) : ""
  const hasSeoBody = seoBodyHtml.trim().length > 0

  // Answer-first sentence tail — only used when there is no formatted SEO body.
  // Description fallback: DB long → DB short → static → trip.
  const mergedDescription = hasSeoBody
    ? ""
    : (dbDetail?.longDescription ??
       dbDetail?.shortDescription ??
       detail?.description ??
       trip.description ??
       "")

  // Highlights: admin-optimised SEO highlights → DB experience_highlights (text) → trip.highlights[]
  const highlightsList: string[] =
    dbDetail?.seoHighlights && dbDetail.seoHighlights.length > 0
      ? dbDetail.seoHighlights.map((x) => x.trim()).filter(Boolean)
      : dbDetail?.experienceHighlights
        ? dbDetail.experienceHighlights.split(/\r?\n+/).map((x) => x.trim()).filter(Boolean)
        : (trip.highlights ?? [])

  // Includes / Not included: merge DB + static (DB first)
  const includes: string[] = dbDetail?.included.length ? dbDetail.included : (detail?.includes ?? [])
  const notIncludes: string[] = dbDetail?.excluded.length ? dbDetail.excluded : (detail?.notIncluded ?? [])

  // Languages
  const languages: string[] = dbDetail?.languages.length ? dbDetail.languages : (detail?.languages ?? [])

  // Group size
  const maxGroupSize: number | undefined = dbDetail?.maxBookingSize ?? detail?.maxGroupSize

  // Cancellation policy: DB single string preferred; legacy is string[]
  const cancellationPolicyItems: string[] =
    dbDetail?.cancellationPolicy
      ? [dbDetail.cancellationPolicy]
      : (detail?.cancellationPolicy ?? [])

  // Itinerary: static structured itinerary wins (it has titles/durations);
  // otherwise render DB free-text itinerary as a paragraph.
  const hasStaticItinerary = (detail?.itinerary ?? []).length > 0
  const dbItineraryText = dbDetail?.itineraryText
  // Admin/AI-authored structured itinerary (jsonb) — highest priority when present.
  const structuredSteps = (dbDetail?.itinerarySteps ?? []).filter(
    (st) => st.name?.trim() && st.description?.trim(),
  )

  // Booking widget — one logical block rendered in TWO positions: at the top on
  // mobile (after the breadcrumb, before the gallery) and in the sticky sidebar
  // on desktop. Only one copy is ever visible per viewport (`lg:hidden` vs
  // `hidden lg:block`); the hidden copy's `loading="lazy"` iframe never enters
  // the viewport, so it is never fetched — no double load. `withAnchor` places
  // the shared `#booking` deep-link target on the desktop copy so native
  // hash-scroll keeps working there; on mobile the widget already sits at the
  // top, so a `#booking` deep link lands the visitor right on it.
  const bookingWidget = (withAnchor: boolean) =>
    bookingUrl ? (
      <div {...(withAnchor ? { id: "booking" } : {})} className="space-y-3">
        {showSlotBanner && (
          <div data-no-edit className="rounded-xl border-2 border-primary bg-primary/10 px-4 py-3 text-sm">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider text-primary"
              data-testid="selected-slot-eyebrow"
            >
              {slotEyebrow}
            </p>
            <p className="mt-1 text-base font-bold text-foreground">
              {formatSelectedDate(selectedDate!)} · {selectedTime}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              The calendar below is opened on the right month — just
              click your date and pick the
              <span className="font-semibold text-foreground"> {selectedTime} </span>
              time slot.
            </p>
          </div>
        )}
        <div className="relative">
          <BookingIframe src={bookingUrl} title={`Book ${trip.title}`} />
          <button
            type="button"
            onClick={() => setBookingModalOpen(true)}
            aria-label={`Open booking for ${trip.title}`}
            className="absolute inset-0 z-20 flex items-end justify-center bg-transparent lg:hidden"
          >
            <span className="mb-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg">
              Tap to check availability
            </span>
          </button>
        </div>
      </div>
    ) : null

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Breadcrumb */}
      <div className="mx-auto max-w-7xl px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          {canGoBack && (
            <button
              type="button"
              onClick={() => router.back()}
              className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-primary">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href={`/search?q=${encodeURIComponent(trip.category)}`} className="hover:text-primary">{trip.category}</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground line-clamp-1">{trip.title}</span>
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-12 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">

          {/* Main content */}
          <div className="flex-1">

            {/* Booking widget — mobile only, surfaced above the gallery so
                visitors can check availability without scrolling past the whole
                trip description. On desktop this copy is hidden and the widget
                renders in the sticky sidebar instead. */}
            <div className="mb-6 lg:hidden">
              {bookingWidget(false)}
            </div>

            {/*
              Gallery — all images are mounted simultaneously in absolute layers
              so switching is INSTANT (no re-fetch on next/prev). Only the active
              layer is visible; the rest sit at opacity-0 but are already loaded
              by the browser. The first image gets `priority` so the LCP isn't
              hurt; the rest load eagerly because they're inside the viewport.
            */}
            <div
              data-no-edit
              className="group relative aspect-[16/9] overflow-hidden rounded-2xl bg-muted"
              data-testid="trip-gallery"
            >
              {gallery.map((src, i) => {
                // Preload the active image, plus the immediate neighbours, so
                // forward/back is instant without paying to fully load every
                // photo in a long gallery upfront.
                const n = gallery.length
                const distance = Math.min(
                  Math.abs(i - galleryIdx),
                  n - Math.abs(i - galleryIdx),
                )
                const eager = i === 0 || distance <= 1
                const isActive = i === galleryIdx
                return (
                  <Image
                    key={`${src}-${i}`}
                    src={src || "/placeholder.svg"}
                    alt={`${trip.title} — photo ${i + 1}`}
                    fill
                    priority={i === 0}
                    unoptimized={!!src?.startsWith('/uploads/')}
                    loading={eager ? "eager" : "lazy"}
                    aria-hidden={isActive ? undefined : true}
                    className={`object-cover transition-opacity duration-300 ${isActive ? "opacity-100" : "opacity-0"}`}
                    sizes="(max-width: 1024px) 100vw, 66vw"
                  />
                )
              })}
              {gallery.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setGalleryIdx((p) => (p - 1 + gallery.length) % gallery.length)}
                    className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-sm backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background"
                    aria-label="Previous image"
                    data-testid="gallery-prev"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryIdx((p) => (p + 1) % gallery.length)}
                    className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-sm backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background"
                    aria-label="Next image"
                    data-testid="gallery-next"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-3 right-3 z-10 rounded-full bg-foreground/60 px-2.5 py-1 text-[11px] font-medium text-background backdrop-blur-sm">
                    {galleryIdx + 1} / {gallery.length}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnail strip */}
            {gallery.length > 1 && (
              <div data-no-edit className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {gallery.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setGalleryIdx(i)}
                    className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${i === galleryIdx ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}
                    aria-label={`View photo ${i + 1}`}
                  >
                    <Image src={src} alt={`${trip.title} thumbnail ${i + 1}`} fill unoptimized={!!src?.startsWith('/uploads/')} className="object-cover" sizes="96px" />
                  </button>
                ))}
              </div>
            )}

            {/* Title & meta */}
            <div data-no-edit className="mt-6">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-semibold">{trip.rating}</span>
                </div>
                <span className="text-xs text-muted-foreground">({trip.reviewCount} reviews)</span>
                {trip.badge && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{trip.badge}</span>}
              </div>
              <h1 className="mt-2 text-2xl font-bold text-foreground lg:text-3xl" data-testid="trip-title">{trip.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{trip.duration}</span>
                {maxGroupSize && <span className="flex items-center gap-1"><Users className="h-4 w-4" />Max {maxGroupSize} people</span>}
                {languages.length > 0 && <span className="flex items-center gap-1"><Globe className="h-4 w-4" />{languages.join(", ")}</span>}
                <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{trip.city ?? "Luxembourg"}</span>
              </div>
            </div>

            {/* Description */}
            <div data-no-edit className="mt-6">
              <p className="text-sm text-muted-foreground leading-relaxed trip-answer-first" data-testid="trip-description">
                {trip.title} is a {trip.duration.toLowerCase()} {trip.category.toLowerCase()} experience in {trip.city ?? "Luxembourg"}{trip.price > 0 ? `, starting at ${trip.price.toFixed(2)} EUR per person` : ", free of charge"}.{mergedDescription ? ` ${mergedDescription}` : ""}
              </p>
              {hasSeoBody && (
                <div
                  className="rte-content mt-4 text-sm text-muted-foreground"
                  data-testid="trip-seo-body"
                  dangerouslySetInnerHTML={{ __html: seoBodyHtml }}
                />
              )}
            </div>

            {/* Guides (static-only field — preserved for legacy seed trips) */}
            {(detail?.guides ?? []).length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-bold text-foreground">Meet your guides</h2>
                <div data-no-edit className="mt-4 flex flex-col gap-4">
                  {(detail!.guides).map((g) => (
                    <div key={g.id} className="flex gap-4 rounded-xl border border-border bg-card p-4">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full">
                        <Image src={g.avatar || "/placeholder.svg"} alt={g.name} fill className="object-cover" sizes="56px" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{g.name}</span>
                          {g.verified && (
                            <span className="flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              <Check className="h-3 w-3" /> Verified
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{g.rating}</span>
                          <span>{g.reviewCount} reviews</span>
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{g.bio}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reasons to book (static legacy + DB tag fallback) */}
            {(detail?.reasons ?? []).length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-bold text-foreground">Reasons to book</h2>
                <div data-no-edit className="mt-4 grid gap-2 sm:grid-cols-2">
                  {detail!.reasons.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-card p-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-sm text-foreground">{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Highlights — show when no structured itinerary */}
            {!hasStaticItinerary && highlightsList.length > 0 && (
              <div className="mt-8 trip-highlights">
                <h2 className="text-lg font-bold text-foreground">Highlights</h2>
                <ul data-no-edit className="mt-4 flex flex-col gap-2" data-testid="trip-highlights">
                  {highlightsList.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Itinerary — admin/AI-authored structured steps win, then static, then free-text DB */}
            {structuredSteps.length > 0 ? (
              <div className="mt-8">
                <h2 className="text-lg font-bold text-foreground">Itinerary</h2>
                <div data-no-edit>
                  <TripItinerary steps={structuredSteps} />
                </div>
              </div>
            ) : hasStaticItinerary ? (
              <div className="mt-8">
                <h2 className="text-lg font-bold text-foreground">Itinerary</h2>
                <div data-no-edit className="mt-4 flex flex-col">
                  {detail!.itinerary.map((step, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</div>
                        {i < detail!.itinerary.length - 1 && <div className="flex-1 w-px bg-border" />}
                      </div>
                      <div className="pb-6">
                        <p className="text-sm font-semibold text-foreground">{step.title}</p>
                        {step.duration && <p className="text-xs text-primary">{step.duration}</p>}
                        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : dbItineraryText ? (
              <div className="mt-8">
                <h2 className="text-lg font-bold text-foreground">Itinerary</h2>
                <p data-no-edit className="mt-3 whitespace-pre-line text-sm text-muted-foreground leading-relaxed" data-testid="trip-itinerary">
                  {dbItineraryText}
                </p>
              </div>
            ) : null}

            {/* Includes / Not included */}
            {(includes.length > 0 || notIncludes.length > 0) && (
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                {includes.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{"What's included"}</h3>
                    <ul data-no-edit className="mt-2 flex flex-col gap-1.5" data-testid="trip-includes">
                      {includes.map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Check className="h-3.5 w-3.5 text-primary" />{item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {notIncludes.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Not included</h3>
                    <ul data-no-edit className="mt-2 flex flex-col gap-1.5" data-testid="trip-excludes">
                      {notIncludes.map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="h-3.5 w-3.5 text-center text-xs text-destructive">&times;</span>{item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Cancellation policy */}
            {cancellationPolicyItems.length > 0 && (
              <div className="mt-8 rounded-xl border border-border bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Shield className="h-4 w-4 text-primary" /> Cancellation policy
                </h3>
                <ul data-no-edit className="mt-2 flex flex-col gap-1">
                  {cancellationPolicyItems.map((p) => (
                    <li key={p} className="text-sm text-muted-foreground whitespace-pre-line">&bull; {p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Google Reviews */}
            <GoogleReviews 
              googleBusinessUrl={trip.googleBusinessUrl}
              tripId={id}
              tripTitle={trip.title}
              rating={trip.rating}
              reviewCount={trip.reviewCount}
            />

            {/* FAQ + AI Chat — faqs are now dynamic, built server-side from DB */}
            <TripChat tripId={id} tripTitle={trip.title} faqs={faqs} />
          </div>

          {/* Booking sidebar */}
          <div id="calendar" className="shrink-0 lg:w-[400px]">
            <div className="sticky top-20 flex flex-col gap-3">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div data-no-edit className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-foreground">{trip.price.toFixed(2)} &euro;</span>
                  {trip.originalPrice && <span className="text-sm text-muted-foreground line-through">{trip.originalPrice.toFixed(2)} &euro;</span>}
                  <span className="text-xs text-muted-foreground">/ person</span>
                </div>
                <button
                  type="button"
                  onClick={() => addItem(trip)}
                  disabled={inCart}
                  className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors ${inCart ? "border-primary/30 bg-primary/5 text-primary" : "border-border text-foreground hover:border-primary/30"}`}
                >
                  {inCart ? <><Check className="h-4 w-4" /> Added to Trip</> : <><ShoppingBag className="h-4 w-4" /> Add to Trip</>}
                </button>
              </div>

              {/* Booking widget (desktop, in the sticky sidebar). On mobile this
                  copy is hidden — the widget is surfaced above the gallery
                  instead (see the lg:hidden copy in the main content column), so
                  the sidebar keeps only the price card and weather on mobile. */}
              <div className="hidden lg:block">
                {bookingWidget(true)}
              </div>

              {/* Live weather */}
              {(weatherLoading || weather) && (
                <div data-no-edit className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Right now in Luxembourg</span>
                  </div>
                  {weatherLoading ? (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
                      <div className="space-y-1.5">
                        <div className="h-6 w-16 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                      </div>
                    </div>
                  ) : weather && (() => {
                    const WIcon = WEATHER_ICONS[weather.current.icon] || CloudSun
                    return (
                      <div className="mt-3">
                        <div className="flex items-center gap-3">
                          <WIcon className="h-9 w-9 text-primary" />
                          <div>
                            <span className="text-2xl font-bold text-foreground">{weather.current.temp}&deg;C</span>
                            <p className="text-xs text-muted-foreground">{weather.current.condition}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Droplets className="h-3 w-3" />{weather.current.humidity}%</span>
                          <span className="flex items-center gap-1"><Wind className="h-3 w-3" />{weather.current.wind} km/h</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {weather.forecast.map((d) => {
                            const DI = WEATHER_ICONS[d.icon] || Sun
                            return (
                              <div key={d.day} className="flex flex-col items-center justify-center gap-1 rounded-xl bg-secondary/50 py-4 text-xs">
                                <span className="text-muted-foreground">{d.day}</span>
                                <DI className="h-5 w-5 text-primary" />
                                <span className="font-semibold text-foreground">{d.high}&deg;</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Related trips — now from DB via server prop */}
        {relatedTrips.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-bold text-foreground">Other things to do</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="related-trips">
              {relatedTrips.map((t) => <TripCard key={t.id} trip={t} />)}
            </div>
          </div>
        )}
      </div>

      {/* Spacer so the fixed mobile booking bar never permanently covers the
          footer at max scroll. Desktop has no bar, so no spacer. */}
      {bookingUrl && <div aria-hidden className="h-20 lg:hidden" />}

      {footer}

      {/* Mobile sticky booking bar — persistent access to the booking flow
          regardless of scroll position. Opens the fullscreen modal. */}
      {bookingUrl && !bookingModalOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-foreground">{trip.price.toFixed(2)} &euro;</span>
                {trip.originalPrice && <span className="text-xs text-muted-foreground line-through">{trip.originalPrice.toFixed(2)} &euro;</span>}
              </div>
              <span className="text-[11px] text-muted-foreground">per person</span>
            </div>
            <button
              type="button"
              onClick={() => setBookingModalOpen(true)}
              className="flex-1 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md max-w-[220px]"
            >
              Check Availability
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen in-page booking modal (mobile only). Mounts a fresh iframe
          only while open, so page load stays at a single inline iframe. */}
      {bookingModalOpen && bookingUrl && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-background lg:hidden"
          style={{ height: "100dvh" }}
          role="dialog"
          aria-modal="true"
          aria-label={`Book ${trip.title}`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{trip.title}</p>
              <p className="text-xs text-muted-foreground">{trip.price.toFixed(2)} &euro; / person</p>
            </div>
            <button
              type="button"
              onClick={() => setBookingModalOpen(false)}
              aria-label="Close booking"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {showSlotBanner && (
            <div data-no-edit className="border-b border-border bg-primary/10 px-4 py-2.5 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{slotEyebrow}</p>
              <p className="mt-0.5 text-sm font-bold text-foreground">
                {formatSelectedDate(selectedDate!)} · {selectedTime}
              </p>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <BookingIframe src={bookingUrl} title={`Book ${trip.title}`} fill />
          </div>
        </div>
      )}
    </div>
  )
}
