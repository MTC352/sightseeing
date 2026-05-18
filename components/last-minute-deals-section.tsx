"use client"

/**
 * Last Minute Deals — homepage section.
 *
 * DYNAMIC mode  — live slots matching admin rules (≤N spaces, within X hrs).
 *                 Same TripCard layout + urgency badge (amber/red) top-left
 *                 + seats-remaining pill top-right + "Book Now" CTA.
 *
 * PREVIEW mode  — soonest upcoming slots (no urgency rules), enriched with
 *                 full DB data. Layout is pixel-identical to TripCard default:
 *                 aspect-[4/3] image, discount % badge, category, title,
 *                 ⭐ rating · ⏱ duration row, strikethrough price, "Buy Tickets".
 *
 * Hidden entirely only when the admin toggle is OFF.
 */

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Star, Clock, Zap, ArrowRight } from "lucide-react"
import { EditableText } from "@/components/editable-text"
import type { DealItem } from "@/app/api/last-minute-deals/route"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function urgencyLabel(hours: number): string {
  if (hours < 1) return "< 1 hr left"
  if (hours < 2) return "~1 hr left"
  if (hours <= 6) return `${Math.floor(hours)}h left`
  if (hours <= 24) return "Today"
  if (hours <= 48) return "Tomorrow"
  return `${Math.floor(hours / 24)}d away`
}

/** "€7" | "14.00 EUR" → 7 | 14 */
function parsePriceDisplay(display: string): number {
  const n = parseFloat(display.replace(/[^0-9.]/g, ""))
  return isNaN(n) ? 0 : n
}

function displayPrice(item: DealItem): string {
  const p = item.price > 0 ? item.price : parsePriceDisplay(item.priceDisplay)
  return p > 0 ? `From ${p.toFixed(2)} €` : item.priceDisplay
}

// ─── Skeleton — matches TripCard dimensions ───────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="aspect-[4/3] w-full animate-pulse bg-secondary" />
      <div className="flex flex-1 flex-col p-[10px] gap-2">
        <div className="h-2 w-14 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-full animate-pulse rounded bg-secondary" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="h-5 w-20 animate-pulse rounded bg-secondary" />
          <div className="h-9 w-28 animate-pulse rounded-xl bg-secondary" />
        </div>
      </div>
    </div>
  )
}

// ─── DYNAMIC deal card — TripCard layout + urgency indicators ─────────────────

function DynamicDealCard({ item }: { item: DealItem }) {
  const href = item.permalink
    ? `/trip/${item.permalink}?date=${encodeURIComponent(item.date)}&time=${encodeURIComponent(item.time)}#booking`
    : `/trip/${item.tripId}?date=${encodeURIComponent(item.date)}&time=${encodeURIComponent(item.time)}#booking`
  const urLabel     = urgencyLabel(item.hoursUntilDeparture)
  const isVeryUrgent = item.hoursUntilDeparture <= 6
  const urgencyBg   = isVeryUrgent ? "bg-destructive text-white" : "bg-amber-500 text-white"

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-destructive/20 bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Image wrapper — same aspect + rounded-b-none as TripCard */}
      <Link href={href} className="relative aspect-[4/3] overflow-hidden rounded-b-none">
        <img
          src={item.image || "/placeholder.svg"}
          alt={item.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {/* Urgency badge — top left (replaces trip.badge) */}
        <span className={`absolute left-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm ${urgencyBg}`}>
          <Clock className="h-3 w-3" />
          {urLabel}
        </span>
        {/* Seats remaining — top right (replaces discount %) */}
        <span className="absolute right-3 top-3 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
          {item.spacesRemaining === 1 ? "1 seat left!" : `${item.spacesRemaining} seats`}
        </span>
      </Link>

      {/* Card body — identical padding to TripCard */}
      <div className="flex flex-1 flex-col p-[10px]">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {item.category}
        </span>
        <Link
          href={href}
          className="mt-1 block text-sm font-semibold text-card-foreground line-clamp-2 group-hover:text-destructive transition-colors"
        >
          {item.title}
        </Link>

        {/* Info row — rating if available, then departure date·time */}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {item.reviewCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {item.rating} ({item.reviewCount})
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {item.date} · {item.time}
          </span>
        </div>

        {/* Price + CTA — same layout as TripCard */}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            {item.originalPrice && item.originalPrice > item.price && (
              <span className="text-xs text-muted-foreground line-through">
                {item.originalPrice.toFixed(2)} &euro;
              </span>
            )}
            <span className="block text-base font-bold text-foreground">{displayPrice(item)}</span>
          </div>
          <Link
            href={href}
            className="rounded-xl bg-destructive px-5 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-destructive/90"
          >
            Book Now
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── PREVIEW deal card — pixel-identical to TripCard default variant ──────────

function PreviewDealCard({ item }: { item: DealItem }) {
  const href = item.permalink
    ? `/trip/${item.permalink}`
    : `/trip/${item.tripId}`
  const hasDiscount   = !!(item.originalPrice && item.originalPrice > item.price && item.price > 0)
  const discountPct   = hasDiscount
    ? Math.round((1 - item.price / item.originalPrice!) * 100)
    : 0
  const departureBadge = urgencyLabel(item.hoursUntilDeparture)

  return (
    /* Exact same wrapper classes as TripCard default */
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">

      {/* Image — rounded-b-none Link, same aspect-[4/3] */}
      <Link href={href} className="relative aspect-[4/3] overflow-hidden rounded-b-none">
        <img
          src={item.image || "/placeholder.svg"}
          alt={item.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />

        {/* Top-left: departure badge (primary, same style as trip.badge in TripCard) */}
        <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-sm">
          {departureBadge}
        </span>

        {/* Top-right: discount % badge — only when DB has originalPrice */}
        {hasDiscount && (
          <span className="absolute right-3 top-3 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
            -{discountPct}%
          </span>
        )}
      </Link>

      {/* Card body — p-[10px] same as TripCard */}
      <div className="flex flex-1 flex-col p-[10px]">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {item.category}
        </span>
        <Link
          href={href}
          className="mt-1 block text-sm font-semibold text-card-foreground line-clamp-2 group-hover:text-primary transition-colors"
        >
          {item.title}
        </Link>

        {/* Info row — exactly as TripCard: ⭐ rating (reviews) · ⏱ duration */}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {item.reviewCount > 0 ? (
            <>
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {item.rating} ({item.reviewCount})
              </span>
              {item.duration && (
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  {item.duration}
                </span>
              )}
            </>
          ) : (
            /* Fallback when no rating data — show departure date + duration */
            <>
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {item.date} · {item.time}
              </span>
              {item.duration && (
                <span className="flex items-center gap-0.5 opacity-70">
                  {item.duration}
                </span>
              )}
            </>
          )}
        </div>

        {/* Price + CTA — same as TripCard */}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            {hasDiscount && (
              <span className="text-xs text-muted-foreground line-through">
                {item.originalPrice!.toFixed(2)} &euro;
              </span>
            )}
            <span className="block text-base font-bold text-foreground">
              {displayPrice(item)}
            </span>
          </div>
          <Link
            href={href}
            className="rounded-xl bg-primary px-5 py-2 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Buy Tickets
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function LastMinuteDealsSection() {
  const [deals,        setDeals]        = useState<DealItem[]>([])
  const [previewDeals, setPreviewDeals] = useState<DealItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [hidden,       setHidden]       = useState(false)

  const fetchDeals = useCallback(async (attempt = 0) => {
    try {
      const res  = await fetch("/api/last-minute-deals", { cache: "no-store" })
      const data = await res.json()

      if (!data.ok || data.enabled === false) { setHidden(true); return }

      if (data.cacheWarming && attempt < 3) {
        setTimeout(() => fetchDeals(attempt + 1), (attempt + 1) * 5000)
        return
      }

      setDeals(       Array.isArray(data.deals)        ? data.deals        : [])
      setPreviewDeals(Array.isArray(data.previewDeals) ? data.previewDeals : [])
    } catch { /* keep state on network error */ }
    finally  { setLoading(false) }
  }, [])

  useEffect(() => { fetchDeals(0) }, [fetchDeals])

  if (hidden) return null

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="rounded-2xl bg-primary/5 p-6 lg:p-8">
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Zap className="h-5 w-5 text-primary" />
            <EditableText id="home:deals:heading" defaultValue="Filling Up Fast" />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <EditableText id="home:deals:subheading" defaultValue="Grab these discounted experiences before they sell out!" />
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0,1,2].map((i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </section>
    )
  }

  // ── DYNAMIC MODE — urgent live deals ─────────────────────────────────────
  if (deals.length > 0) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="rounded-2xl bg-destructive/5 p-6 lg:p-8">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                <Zap className="h-5 w-5 text-destructive" />
                <EditableText id="home:deals:heading" defaultValue="Filling Up Fast" />
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                <EditableText id="home:deals:subheading" defaultValue="Grab these discounted experiences before they sell out!" />
              </p>
            </div>
            <Link href="/departures" className="hidden items-center gap-1 text-sm font-medium text-destructive hover:underline sm:flex">
              All departures <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {deals.map((d) => (
              <DynamicDealCard key={`${d.tripId}-${d.date}-${d.time}`} item={d} />
            ))}
          </div>
        </div>
      </section>
    )
  }

  // ── PREVIEW MODE — upcoming trips, exact TripCard design ─────────────────
  if (previewDeals.length === 0) return null

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="rounded-2xl bg-primary/5 p-6 lg:p-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Zap className="h-5 w-5 text-primary" />
              <EditableText id="home:deals:heading" defaultValue="Filling Up Fast" />
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <EditableText id="home:deals:subheading" defaultValue="Grab these discounted experiences before they sell out!" />
            </p>
          </div>
          <Link href="/departures" className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:flex">
            All departures <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {/* gap-6 identical to original DealsSection grid */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {previewDeals.map((item) => (
            <PreviewDealCard key={`${item.tripId}-${item.date}`} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}
