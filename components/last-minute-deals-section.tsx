"use client"

/**
 * Last Minute Deals — homepage section.
 *
 * Two modes:
 *  DYNAMIC  — live data from /api/last-minute-deals (custom rule-filtered slots).
 *             Shown whenever at least one slot qualifies.  Red urgency theme.
 *
 *  STATIC   — preserved original layout using TripCard + trips with originalPrice.
 *             Shown as fallback when no live deals match the rules (or the
 *             discovery cache is still warming up).  Primary/teal theme — identical
 *             to the old static DealsSection so the visual design is never lost.
 *
 * The widget hides itself entirely only when:
 *   • the admin has toggled the widget OFF  (enabled === false), OR
 *   • the static pool is also empty (no trips have originalPrice).
 */

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Zap, MapPin, Clock, ArrowRight } from "lucide-react"
import { EditableText } from "@/components/editable-text"
import { TripCard } from "@/components/trip-card"
import { trips } from "@/lib/data"
import type { LastMinuteDealItem } from "@/app/api/last-minute-deals/route"

/** Trips that carry an original (crossed-out) price — used as the static fallback pool. */
const STATIC_DEALS = trips.filter((t) => t.originalPrice).slice(0, 3)

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
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

// ─── Urgency label ───────────────────────────────────────────────────────────

function urgencyLabel(hours: number): string {
  if (hours < 1) return "< 1 hour left"
  if (hours < 2) return "~1 hour left"
  if (hours <= 6) return `${Math.floor(hours)}h left`
  if (hours <= 24) return "Today"
  return `${Math.floor(hours / 24)}d left`
}

// ─── Dynamic deal card ───────────────────────────────────────────────────────

function DynamicDealCard({ deal }: { deal: LastMinuteDealItem }) {
  const slotHref = `/trip/${deal.tripId}?date=${encodeURIComponent(deal.date)}&time=${encodeURIComponent(deal.time)}#booking`
  const urLabel = urgencyLabel(deal.hoursUntilDeparture)
  const isVeryUrgent = deal.hoursUntilDeparture <= 6

  return (
    <Link
      href={slotHref}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-destructive/20 bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-destructive/40 hover:shadow-md"
    >
      {/* Image */}
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

        {/* Spaces pill — top right */}
        <div className="absolute right-3 top-3 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-white shadow">
          {deal.spacesRemaining === 1 ? "1 seat left!" : `${deal.spacesRemaining} seats left`}
        </div>
      </div>

      {/* Content */}
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

// ─── Main section ─────────────────────────────────────────────────────────────

export function LastMinuteDealsSection() {
  const [deals, setDeals] = useState<LastMinuteDealItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)

  const fetchDeals = useCallback(async () => {
    try {
      const res = await fetch("/api/last-minute-deals", { cache: "no-store" })
      const data = await res.json()
      // Admin toggled the widget OFF → hide entirely
      if (!data.ok || data.enabled === false) {
        setHidden(true)
        return
      }
      setDeals(Array.isArray(data.deals) ? data.deals : [])
    } catch {
      /* Network error — keep whatever state we had */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDeals()
  }, [fetchDeals])

  // Admin-disabled → hide
  if (hidden) return null

  // Still fetching → show skeletons in the dynamic red container
  if (loading) {
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
                <EditableText
                  id="home:deals:subheading"
                  defaultValue="Grab these discounted experiences before they sell out!"
                />
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </section>
    )
  }

  // ── DYNAMIC MODE — live deals available ──────────────────────────────────
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
                <EditableText
                  id="home:deals:subheading"
                  defaultValue="Grab these discounted experiences before they sell out!"
                />
              </p>
            </div>
            <Link
              href="/departures"
              className="hidden items-center gap-1 text-sm font-medium text-destructive hover:underline sm:flex"
            >
              All departures <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {deals.map((deal) => <DynamicDealCard key={`${deal.tripId}-${deal.date}-${deal.time}`} deal={deal} />)}
          </div>
        </div>
      </section>
    )
  }

  // ── STATIC FALLBACK — no live deals; show original TripCard layout ────────
  // Preserves the exact design of the original DealsSection (bg-primary/5, TripCard grid).
  if (STATIC_DEALS.length === 0) return null

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="rounded-2xl bg-primary/5 p-6 lg:p-8">
        <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Zap className="h-5 w-5 text-primary" />
          <EditableText id="home:deals:heading" defaultValue="Last Minute Deals" />
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <EditableText
            id="home:deals:subheading"
            defaultValue="Grab these discounted experiences before they sell out!"
          />
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STATIC_DEALS.map((t) => <TripCard key={t.id} trip={t} />)}
        </div>
      </div>
    </section>
  )
}
