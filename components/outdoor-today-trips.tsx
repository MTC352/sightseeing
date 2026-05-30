"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Clock, MapPin, CloudSun, Sun, CloudRain, Sparkles, ArrowRight, ChevronRight } from "lucide-react"
import type { OutdoorTodayResponse, OutdoorTodayTrip } from "@/app/api/outdoor-today/route"

const WEATHER_ICONS = { sun: Sun, "cloud-sun": CloudSun, "cloud-rain": CloudRain }
const MATCH_BADGE: Record<string, string> = {
  excellent: "bg-white text-emerald-700 border-emerald-500/30",
  good: "bg-white text-primary border-primary/30",
  fair: "bg-white text-amber-700 border-amber-500/30",
  poor: "bg-white text-destructive border-destructive/30",
}
const MATCH_LABEL: Record<string, string> = {
  excellent: "Perfect conditions",
  good: "Good match",
  fair: "Fair match",
  poor: "Weather warning",
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

function SkeletonCard() {
  return (
    <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="h-36 w-full animate-pulse bg-secondary" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="h-2.5 w-16 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-full animate-pulse rounded bg-secondary" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-14 animate-pulse rounded bg-secondary" />
        </div>
        <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
      </div>
    </div>
  )
}

function TripCard({ trip }: { trip: OutdoorTodayTrip }) {
  const matchClass = MATCH_BADGE[trip.weatherMatch] ?? MATCH_BADGE.good
  const matchLabel = MATCH_LABEL[trip.weatherMatch] ?? "Good match"
  const nextSlot = trip.upcomingSlots[0]
  const rawPrice = nextSlot?.priceDisplay ?? (trip.price != null ? `€${trip.price}` : null)
  const priceDisplay = decodeEntities(rawPrice)

  return (
    <Link
      href={`/trip/${trip.id}`}
      className="group relative flex w-64 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      {/* Image */}
      <div className="relative h-36 w-full shrink-0 overflow-hidden">
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
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />

        {/* Weather match badge */}
        <div className={`absolute left-2 top-2 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${matchClass}`}>
          {matchLabel}
        </div>

        {/* Next slot badge */}
        {nextSlot && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-foreground/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            <Clock className="h-2.5 w-2.5" />
            {nextSlot.time || "Available today"}
          </div>
        )}
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

        <p className="line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
          {trip.description || trip.aiReason || "A memorable experience in Luxembourg."}
        </p>

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
    <div className="flex flex-1 flex-col">
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

      {/* Carousel — same pattern as Departing Soon */}
      {isLoading ? (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
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
      ) : (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {trips.map((t) => <TripCard key={t.id} trip={t} />)}
          {/* See all card */}
          <Link
            href="/search"
            className="flex w-48 shrink-0 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-background p-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <ArrowRight className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">Browse all trips</p>
            <p className="text-xs text-muted-foreground">View full catalogue</p>
          </Link>
        </div>
      )}
    </div>
  )
}
