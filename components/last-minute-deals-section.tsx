"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Zap, MapPin, Clock, ArrowRight } from "lucide-react"
import { EditableText } from "@/components/editable-text"
import type { LastMinuteDealItem } from "@/app/api/last-minute-deals/route"

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

function urgencyLabel(hours: number): string {
  if (hours < 1) return "< 1 hour left"
  if (hours < 2) return "~1 hour left"
  if (hours <= 6) return `${Math.floor(hours)}h left`
  if (hours <= 24) return "Today"
  return `${Math.floor(hours / 24)}d left`
}

export function LastMinuteDealsSection() {
  const [deals, setDeals] = useState<LastMinuteDealItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)

  const fetchDeals = useCallback(async () => {
    try {
      const res = await fetch("/api/last-minute-deals", { cache: "no-store" })
      const data = await res.json()
      if (!data.ok || data.enabled === false) {
        setHidden(true)
        return
      }
      setDeals(Array.isArray(data.deals) ? data.deals : [])
    } catch {
      /* ignore — keep current state */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDeals()
  }, [fetchDeals])

  if (hidden) return null
  if (!loading && deals.length === 0) return null

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="rounded-2xl bg-destructive/5 p-6 lg:p-8">
        {/* Header */}
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

        {/* Cards */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
            : deals.map((deal) => {
                const slotHref = `/trip/${deal.tripId}?date=${encodeURIComponent(deal.date)}&time=${encodeURIComponent(deal.time)}#booking`
                const urLabel = urgencyLabel(deal.hoursUntilDeparture)
                const isVeryUrgent = deal.hoursUntilDeparture <= 6

                return (
                  <Link
                    key={`${deal.tripId}-${deal.date}-${deal.time}`}
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
                        {deal.spacesRemaining === 1
                          ? "1 seat left!"
                          : `${deal.spacesRemaining} seats left`}
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
                        <span className="text-sm font-bold text-foreground">
                          {deal.priceDisplay}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                        Book now — don&apos;t miss it{" "}
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </Link>
                )
              })}
        </div>
      </div>
    </section>
  )
}
