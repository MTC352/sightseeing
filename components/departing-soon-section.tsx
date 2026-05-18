"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { Calendar, ChevronRight, Clock, MapPin, ArrowRight } from "lucide-react"
import { EditableText } from "@/components/editable-text"
import type { DepartingSoonItem } from "@/app/api/departing-soon/route"

function SkeletonCard() {
  return (
    <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="h-36 w-full animate-pulse bg-secondary" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="h-2.5 w-16 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-full animate-pulse rounded bg-secondary" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-10 animate-pulse rounded bg-secondary" />
        </div>
        <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
      </div>
    </div>
  )
}

export function DeparturesSoonSection() {
  const [departures, setDepartures] = useState<DepartingSoonItem[]>([])
  const [loading, setLoading] = useState(true)
  const [autoUpdate, setAutoUpdate] = useState(false)
  const [intervalSecs, setIntervalSecs] = useState(300)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchDepartures = useCallback(async () => {
    try {
      const res = await fetch("/api/departing-soon")
      const data = await res.json()
      if (data.ok && Array.isArray(data.departures)) {
        setDepartures(data.departures)
        setAutoUpdate(Boolean(data.autoUpdate))
        setIntervalSecs(Number(data.interval) || 300)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDepartures()
  }, [fetchDepartures])

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (autoUpdate && intervalSecs >= 60) {
      timerRef.current = setInterval(fetchDepartures, intervalSecs * 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [autoUpdate, intervalSecs, fetchDepartures])

  if (!loading && departures.length === 0) return null

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Calendar className="h-5 w-5 text-primary" />
            <EditableText id="home:departures:heading" defaultValue="Departing Soon" />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <EditableText
              id="home:departures:subheading"
              defaultValue="Guaranteed slots — book your spot before they fill up."
              multiline
            />
          </p>
        </div>
        <Link
          href="/departures"
          className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:flex"
        >
          All departures <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-6 flex gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          : departures.map((dep) => (
              <Link
                key={`${dep.tripId}-${dep.date}-${dep.time}`}
                href={`/trip/${dep.tripId}`}
                className="group relative flex w-64 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                {/* Image */}
                <div className="relative h-36 w-full overflow-hidden">
                  {dep.tripImage ? (
                    <img
                      src={dep.tripImage}
                      alt={dep.tripTitle}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full w-full bg-secondary" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />

                  {/* Departure badge */}
                  <div
                    className={`absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow ${
                      dep.label === "Today"
                        ? "bg-destructive text-white"
                        : dep.label === "Tomorrow"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-foreground"
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    {dep.label} {dep.time}
                  </div>

                  {/* Spots pill — top right */}
                  {dep.spacesRemaining !== null && dep.spacesRemaining <= 8 && (
                    <div
                      className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold shadow ${
                        dep.spacesRemaining <= 4
                          ? "bg-destructive text-white"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      {dep.spacesRemaining === 0 ? "Full" : `${dep.spacesRemaining} left`}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="text-[10px] font-medium text-primary">{dep.category}</p>
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                    {dep.tripTitle}
                  </h3>

                  <div className="mt-auto flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{dep.city ?? "Luxembourg"}</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground">
                      {dep.priceDisplay}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-medium text-primary">
                    Book now{" "}
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            ))}

        {/* See all card */}
        {!loading && (
          <Link
            href="/departures"
            className="flex w-48 shrink-0 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-background p-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <ArrowRight className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">All departure locations</p>
            <p className="text-xs text-muted-foreground">View by city</p>
          </Link>
        )}
      </div>
    </section>
  )
}
