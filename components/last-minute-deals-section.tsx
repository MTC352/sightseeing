"use client"

/**
 * Last Minute Deals — homepage section.
 *
 * Two display modes:
 *
 *  DYNAMIC  – live slots that matched all admin rules (spaces ≤ N, within X hrs).
 *             Red/amber urgency theme — seat count + countdown badge.
 *
 *  PREVIEW  – soonest upcoming slots, shown when no live deals qualify.
 *             Uses a PreviewDealCard that mirrors the TripCard default variant
 *             layout exactly (aspect-[4/3] image, same body padding, category
 *             text, title, info row, price + "Buy Tickets" CTA) so it looks
 *             identical to the original static DealsSection.
 *
 * Hidden entirely only when: admin toggle is OFF.
 */

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Zap, Clock, ArrowRight, CalendarDays } from "lucide-react"
import { EditableText } from "@/components/editable-text"
import type { LastMinuteDealItem, PreviewDealItem } from "@/app/api/last-minute-deals/route"

// ─── Skeleton — matches TripCard default dimensions ───────────────────────────

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

// ─── Urgency helpers ──────────────────────────────────────────────────────────

function urgencyLabel(hours: number): string {
  if (hours < 1) return "< 1 hr left"
  if (hours < 2) return "~1 hr left"
  if (hours <= 6) return `${Math.floor(hours)}h left`
  if (hours <= 24) return "Today"
  if (hours <= 48) return "Tomorrow"
  return `${Math.floor(hours / 24)}d away`
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  } catch {
    return dateStr
  }
}

// ─── Dynamic deal card (live urgency mode) ────────────────────────────────────

function DynamicDealCard({ deal }: { deal: LastMinuteDealItem }) {
  const slotHref = `/trip/${deal.tripId}?date=${encodeURIComponent(deal.date)}&time=${encodeURIComponent(deal.time)}#booking`
  const urLabel = urgencyLabel(deal.hoursUntilDeparture)
  const isVeryUrgent = deal.hoursUntilDeparture <= 6

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-destructive/20 bg-card shadow-sm transition-shadow hover:shadow-md">
      <Link href={slotHref} className="relative aspect-[4/3] overflow-hidden rounded-b-none">
        {deal.tripImage ? (
          <img
            src={deal.tripImage}
            alt={deal.tripTitle}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-secondary" />
        )}
        {/* Urgency badge — top left */}
        <span
          className={`absolute left-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow ${
            isVeryUrgent ? "bg-destructive text-white" : "bg-amber-500 text-white"
          }`}
        >
          <Clock className="h-3 w-3" />
          {urLabel}
        </span>
        {/* Seats pill — top right */}
        <span className="absolute right-3 top-3 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-white shadow">
          {deal.spacesRemaining === 1 ? "1 seat left!" : `${deal.spacesRemaining} seats left`}
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-[10px]">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{deal.tripCategory}</span>
        <Link href={slotHref} className="mt-1 block text-sm font-semibold text-card-foreground line-clamp-2 group-hover:text-destructive transition-colors">
          {deal.tripTitle}
        </Link>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{deal.date} · {deal.time}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="block text-base font-bold text-foreground">{deal.priceDisplay}</span>
          <Link href={slotHref} className="rounded-xl bg-destructive px-5 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-destructive/90">
            Book Now
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Preview deal card — mirrors TripCard default variant exactly ─────────────
// Same structure: aspect-[4/3] image, same padding, category / title / info row,
// price + "Buy Tickets" CTA. Uses reliable slot data — no broken zero-values.

function PreviewDealCard({ item }: { item: PreviewDealItem }) {
  const tripHref = item.trip.permalink
    ? `/trip/${item.trip.permalink}`
    : `/trip/${item.tripId}`
  const depLabel = urgencyLabel(item.hoursUntilDeparture)
  const dateLabel = formatDate(item.date)
  const hasDiscount =
    item.trip.originalPrice != null && item.trip.originalPrice > item.trip.price

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Image — same aspect ratio as TripCard */}
      <Link href={tripHref} className="relative aspect-[4/3] overflow-hidden rounded-b-none">
        <img
          src={item.trip.image || "/placeholder.svg"}
          alt={item.trip.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {/* Departure soon badge — top left (replaces trip.badge) */}
        <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-sm">
          {depLabel}
        </span>
        {/* Discount % badge — top right, only when originalPrice is set */}
        {hasDiscount && (
          <span className="absolute right-3 top-3 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
            -{Math.round((1 - item.trip.price / (item.trip.originalPrice ?? item.trip.price)) * 100)}%
          </span>
        )}
      </Link>

      {/* Card body — same p-[10px] as TripCard */}
      <div className="flex flex-1 flex-col p-[10px]">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {item.trip.category}
        </span>
        <Link
          href={tripHref}
          className="mt-1 block text-sm font-semibold text-card-foreground line-clamp-2 group-hover:text-primary transition-colors"
        >
          {item.trip.title}
        </Link>
        {/* Info row — departure date + time instead of rating (no reliable rating data) */}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <CalendarDays className="h-3 w-3" />
            {dateLabel} · {item.time}
          </span>
          {item.trip.duration && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {item.trip.duration}
            </span>
          )}
        </div>
        {/* Price + CTA row — mirrors TripCard exactly */}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            {hasDiscount && (
              <span className="text-xs text-muted-foreground line-through">
                {(item.trip.originalPrice ?? 0).toFixed(2)} &euro;
              </span>
            )}
            <span className="block text-base font-bold text-foreground">
              {item.trip.price > 0
                ? `From ${item.trip.price.toFixed(2)} \u20ac`
                : item.priceDisplay}
            </span>
          </div>
          <Link
            href={tripHref}
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
  const [deals, setDeals] = useState<LastMinuteDealItem[]>([])
  const [previewDeals, setPreviewDeals] = useState<PreviewDealItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)

  const fetchDeals = useCallback(async (attempt = 0) => {
    try {
      const res = await fetch("/api/last-minute-deals", { cache: "no-store" })
      const data = await res.json()

      if (!data.ok || data.enabled === false) {
        setHidden(true)
        return
      }

      // Cache still warming on cold start — retry with back-off (up to 3 times)
      if (data.cacheWarming && attempt < 3) {
        setTimeout(() => fetchDeals(attempt + 1), (attempt + 1) * 5000)
        return
      }

      setDeals(Array.isArray(data.deals) ? data.deals : [])
      setPreviewDeals(Array.isArray(data.previewDeals) ? data.previewDeals : [])
    } catch {
      /* keep current state on network error */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDeals(0)
  }, [fetchDeals])

  if (hidden) return null

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="rounded-2xl bg-primary/5 p-6 lg:p-8">
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Zap className="h-5 w-5 text-primary" />
            <EditableText id="home:deals:heading" defaultValue="Last Minute Deals" />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <EditableText id="home:deals:subheading" defaultValue="Grab these discounted experiences before they sell out!" />
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </section>
    )
  }

  // ── DYNAMIC MODE — live urgent deals ─────────────────────────────────────
  if (deals.length > 0) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="rounded-2xl bg-destructive/5 p-6 lg:p-8">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                <Zap className="h-5 w-5 text-destructive" />
                <EditableText id="home:deals:heading" defaultValue="Last Minute Deals" />
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
              <DynamicDealCard key={`${d.tripId}-${d.date}-${d.time}`} deal={d} />
            ))}
          </div>
        </div>
      </section>
    )
  }

  // ── PREVIEW MODE — upcoming trips, TripCard-identical layout ─────────────
  if (previewDeals.length === 0) return null

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="rounded-2xl bg-primary/5 p-6 lg:p-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Zap className="h-5 w-5 text-primary" />
              <EditableText id="home:deals:heading" defaultValue="Last Minute Deals" />
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <EditableText id="home:deals:subheading" defaultValue="Grab these discounted experiences before they sell out!" />
            </p>
          </div>
          <Link href="/departures" className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:flex">
            All departures <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {/* Same gap-6 grid as original DealsSection */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {previewDeals.map((item) => (
            <PreviewDealCard key={`${item.tripId}-${item.date}`} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}
