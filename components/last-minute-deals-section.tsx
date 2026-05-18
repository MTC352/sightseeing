"use client"

/**
 * Last Minute Deals — homepage section.
 *
 * Two display modes — both self-contained, no TripCard / external hook deps:
 *
 *  DYNAMIC  – live slots that matched all admin rules (spaces ≤ N, within X hrs).
 *             Red urgency theme with urgency badge + seat-count pill.
 *
 *  PREVIEW  – upcoming slots with no rules applied, returned by the API as
 *             `previewDeals` when no live deals qualify.
 *             Teal / primary theme — mirrors the original static DealsSection
 *             look and feel so the widget always shows meaningful content.
 *
 * Hidden entirely only when: admin toggle is OFF.
 */

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Zap, MapPin, Clock, ArrowRight, Tag } from "lucide-react"
import { EditableText } from "@/components/editable-text"
import type { LastMinuteDealItem } from "@/app/api/last-minute-deals/route"

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="h-44 w-full animate-pulse bg-secondary" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="h-2.5 w-16 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-full animate-pulse rounded bg-secondary" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-14 animate-pulse rounded bg-secondary" />
        </div>
      </div>
    </div>
  )
}

// ─── Urgency label ────────────────────────────────────────────────────────────

function urgencyLabel(hours: number): string {
  if (hours < 1) return "< 1 hr left"
  if (hours < 2) return "~1 hr left"
  if (hours <= 6) return `${Math.floor(hours)}h left`
  if (hours <= 24) return "Today"
  if (hours <= 48) return "Tomorrow"
  return `${Math.floor(hours / 24)}d away`
}

// ─── Dynamic deal card (live LMD rules matched) ───────────────────────────────

function DynamicDealCard({ deal }: { deal: LastMinuteDealItem }) {
  const slotHref = `/trip/${deal.tripId}?date=${encodeURIComponent(deal.date)}&time=${encodeURIComponent(deal.time)}#booking`
  const urLabel = urgencyLabel(deal.hoursUntilDeparture)
  const isVeryUrgent = deal.hoursUntilDeparture <= 6

  return (
    <Link
      href={slotHref}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-destructive/20 bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-destructive/40 hover:shadow-md"
    >
      <div className="relative h-44 w-full overflow-hidden">
        {deal.tripImage ? (
          <img
            src={deal.tripImage}
            alt={deal.tripTitle}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-secondary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/50 to-transparent" />

        {/* Urgency badge — top left */}
        <div
          className={`absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold shadow ${
            isVeryUrgent ? "bg-destructive text-white" : "bg-amber-500 text-white"
          }`}
        >
          <Clock className="h-3 w-3" />
          {urLabel}
        </div>

        {/* Seats pill — top right */}
        <div className="absolute right-3 top-3 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-white shadow">
          {deal.spacesRemaining === 1 ? "1 seat left!" : `${deal.spacesRemaining} seats left`}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-[10px] font-medium text-primary">{deal.tripCategory}</p>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {deal.tripTitle}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{deal.tripCity || "Luxembourg"}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{deal.priceDisplay}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-medium text-destructive">
          Book now — don&apos;t miss it{" "}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  )
}

// ─── Preview card (static fallback — upcoming trips, no rule filter) ──────────
// Mirrors the original static DealsSection design: primary/teal theme, no urgency.

function PreviewDealCard({ deal }: { deal: LastMinuteDealItem }) {
  const slotHref = `/trip/${deal.tripId}?date=${encodeURIComponent(deal.date)}&time=${encodeURIComponent(deal.time)}#booking`
  const depLabel = urgencyLabel(deal.hoursUntilDeparture)

  return (
    <Link
      href={slotHref}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      <div className="relative h-44 w-full overflow-hidden">
        {deal.tripImage ? (
          <img
            src={deal.tripImage}
            alt={deal.tripTitle}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-secondary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />

        {/* Departure badge */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-primary/90 px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow">
          <Clock className="h-3 w-3" />
          {depLabel}
        </div>

        {/* Deal badge */}
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow">
          <Tag className="h-2.5 w-2.5" />
          Deal
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-[10px] font-medium text-primary">{deal.tripCategory}</p>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {deal.tripTitle}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{deal.tripCity || "Luxembourg"}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{deal.priceDisplay}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-medium text-primary">
          Book now <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  )
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function LastMinuteDealsSection() {
  const [deals, setDeals] = useState<LastMinuteDealItem[]>([])
  const [previewDeals, setPreviewDeals] = useState<LastMinuteDealItem[]>([])
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
      // Cache still warming on cold start — retry up to 3 times with back-off
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

  // Admin-disabled
  if (hidden) return null

  // Loading — show skeletons
  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="rounded-2xl bg-destructive/5 p-6 lg:p-8">
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Zap className="h-5 w-5 text-destructive" />
            <EditableText id="home:deals:heading" defaultValue="Last Minute Deals" />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <EditableText id="home:deals:subheading" defaultValue="Grab these discounted experiences before they sell out!" />
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </section>
    )
  }

  // ── DYNAMIC MODE — live deals matched admin rules ─────────────────────────
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
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {deals.map((d) => <DynamicDealCard key={`${d.tripId}-${d.date}-${d.time}`} deal={d} />)}
          </div>
        </div>
      </section>
    )
  }

  // ── PREVIEW MODE — no live deals; show upcoming trips (original teal theme) ─
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
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {previewDeals.map((d) => <PreviewDealCard key={`${d.tripId}-${d.date}-${d.time}`} deal={d} />)}
        </div>
      </div>
    </section>
  )
}
