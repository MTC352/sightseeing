"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Clock, MapPin, CloudSun, Sun, CloudRain, Sparkles, ArrowRight, ChevronRight } from "lucide-react"
import type { OutdoorTodayResponse, OutdoorTodayTrip } from "@/app/api/outdoor-today/route"

const WEATHER_ICONS = { sun: Sun, "cloud-sun": CloudSun, "cloud-rain": CloudRain }

const MATCH_BADGE: Record<string, string> = {
  excellent: "bg-emerald-500 text-white",
  good: "bg-primary text-primary-foreground",
  fair: "bg-amber-500 text-white",
  poor: "bg-destructive text-white",
}
/* Exact TripCard badge style (Trending This Month reference) — applied at bottom-left */
const BADGE_BASE = "absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm"
const MATCH_LABEL: Record<string, string> = {
  excellent: "Today's Best",
  good: "Today's Best",
  fair: "Good Pick",
  poor: "Weather Advisory",
}

/** Decode HTML entities (e.g. &#8364; → €) from TourCMS XML fields. */
function decodeEntities(str: string | null | undefined): string {
  if (!str) return ""
  if (typeof document !== "undefined") {
    const el = document.createElement("textarea")
    el.innerHTML = str
    return el.value
  }
  return str.replace(/&#(\d+);/g, (_, code: string) =>
    String.fromCharCode(parseInt(code, 10)),
  )
}

function SkeletonCard({ fill = false }: { fill?: boolean }) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${
      fill ? "w-full" : "w-[calc(100vw-5rem)] shrink-0 sm:w-64"
    }`}>
      <div className="h-[248px] w-full animate-pulse bg-secondary" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="h-2.5 w-16 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-full animate-pulse rounded bg-secondary" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-10 animate-pulse rounded bg-secondary" />
        </div>
        <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
      </div>
    </div>
  )
}

function TripCard({ trip, fill = false }: { trip: OutdoorTodayTrip; fill?: boolean }) {
  const matchClass = MATCH_BADGE[trip.weatherMatch] ?? MATCH_BADGE.good
  const matchLabel = MATCH_LABEL[trip.weatherMatch] ?? "Today's Best"
  const nextSlot = trip.upcomingSlots[0]
  const rawPrice = nextSlot?.priceDisplay ?? (trip.price != null ? `€${trip.price}` : null)
  const priceDisplay = decodeEntities(rawPrice)

  return (
    <Link
      data-no-edit
      href={`/trip/${trip.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md ${
        fill ? "w-full" : "w-[calc(100vw-5rem)] shrink-0 sm:w-64"
      }`}
    >
      {/* Image */}
      <div className="relative h-[248px] w-full shrink-0 overflow-hidden">
        {trip.image ? (
          <img
            src={trip.image}
            alt={trip.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-secondary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/50 to-transparent" />

        {/* Timeslot — top-left, exact Departing Soon style (Today = destructive) */}
        {nextSlot && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1 text-[11px] font-semibold text-white shadow">
            <Clock className="h-3 w-3" />
            Today {nextSlot.time}
          </div>
        )}

        {/* Recommendation badge — bottom-left, exact TripCard badge style */}
        <span className={`${BADGE_BASE} ${matchClass}`}>{matchLabel}</span>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between gap-1">
          {trip.category && (
            <p className="text-[10px] font-medium text-primary">{trip.category}</p>
          )}
          {trip.duration && (
            <p className="text-[10px] text-muted-foreground">{trip.duration}</p>
          )}
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {trip.title}
        </h3>

        {(trip.description || trip.aiReason) && (
          <p className="line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
            {trip.description || trip.aiReason}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{trip.city ?? "Luxembourg"}</span>
          </div>
          {priceDisplay && (
            <span className="text-xs font-semibold text-foreground">{priceDisplay}</span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] font-medium text-primary">
          Book now <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  )
}

interface OutdoorTodayTripsProps {
  isWeatherLoading: boolean
  weatherCondition?: string
}

export function OutdoorTodayTrips({ isWeatherLoading, weatherCondition }: OutdoorTodayTripsProps) {
  const [data, setData] = useState<OutdoorTodayResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/outdoor-today", { cache: "no-store" })
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const isLoading = loading || isWeatherLoading
  const displayCount = data?.displayCount ?? 2
  const trips = (data?.trips ?? []).slice(0, displayCount)
  const isRainy = weatherCondition?.toLowerCase().includes("rain") ?? false

  const heading = isLoading
    ? "Trips for today's weather"
    : isRainy
      ? "Best indoor experiences today"
      : "Best outdoor experiences today"

  const subtext = isLoading
    ? "Loading recommendations based on current conditions…"
    : data?.aiPowered
      ? `AI-selected for today's ${(weatherCondition ?? "current").toLowerCase()} conditions.`
      : weatherCondition
        ? `Based on ${weatherCondition.toLowerCase()} conditions, we recommend these experiences.`
        : "Recommended experiences for today."

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{heading}</h3>
        <div className="flex items-center gap-2">
          {!isLoading && data?.aiPowered && (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <Sparkles className="h-2.5 w-2.5" />
              AI
            </span>
          )}
          <Link
            href="/search"
            className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:flex"
          >
            View all <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{subtext}</p>

      {/* Carousel */}
      {isLoading ? (
        displayCount <= 3 ? (
          /* Match the few-trips grid so skeleton width === real card width */
          <div className={`mt-4 grid gap-4 ${
            displayCount === 1 ? "grid-cols-1" :
            displayCount === 2 ? "grid-cols-2" :
            "grid-cols-3"
          }`}>
            {Array.from({ length: displayCount }).map((_, i) => <SkeletonCard key={i} fill />)}
          </div>
        ) : (
          <div className="mt-4 flex gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {Array.from({ length: displayCount }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )
      ) : trips.length === 0 ? (
        <div className="mt-4 flex items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/30 p-8 text-center">
          <div>
            <p className="text-sm font-medium text-foreground">No outdoor experiences available right now</p>
            <p className="mt-1 text-xs text-muted-foreground">Check back later or browse all trips.</p>
            <Link
              href="/search"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Browse all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : trips.length <= 3 ? (
        /* Few trips — distribute evenly, no empty gap */
        <div className={`mt-4 grid gap-4 ${
          trips.length === 1 ? "grid-cols-1" :
          trips.length === 2 ? "grid-cols-2" :
          "grid-cols-3"
        }`}>
          {trips.map((t) => <TripCard key={t.id} trip={t} fill />)}
        </div>
      ) : (
        /* Many trips — horizontal carousel */
        <div className="mt-4 flex gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {trips.map((t) => <TripCard key={t.id} trip={t} />)}
        </div>
      )}
    </div>
  )
}
