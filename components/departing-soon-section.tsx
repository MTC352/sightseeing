"use client"

/**
 * Departing Soon — homepage widget.
 *
 * Pure consumer of `/api/departing-soon` (no TourCMS calls of its own).
 * No polling: data is refreshed server-side by the auto-update-availability
 * cron, and the user can hit the "refresh" icon button for an on-demand read.
 *
 * Hides itself entirely when TourCMS is not configured.
 */

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Calendar, ChevronRight, Clock, MapPin, ArrowRight, RefreshCw } from "lucide-react"
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

/** Render the availability pill — original style:
 *   UNLIMITED / ≥9   → no pill
 *   5–8              → amber  "N left"
 *   1–4              → red    "N left"
 *   0                → red    "Full"
 */
function UrgencyBadge({ spaces }: { spaces: number | "UNLIMITED" | undefined }) {
  if (spaces === undefined || spaces === "UNLIMITED") return null
  if (typeof spaces === "number" && spaces >= 9) return null
  const colour =
    spaces === 0 || spaces <= 4
      ? "bg-destructive text-white"
      : "bg-amber-500 text-white"
  const label = spaces === 0 ? "Full" : `${spaces} left`
  return (
    <div className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold shadow ${colour}`}>
      {label}
    </div>
  )
}

/** Day label: Today / Tomorrow / weekday name. */
function dayLabel(dateIso: string): string {
  try {
    const [y, m, d] = dateIso.split("-").map(Number)
    const target = new Date(Date.UTC(y, m - 1, d))
    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
    if (diff === 0) return "Today"
    if (diff === 1) return "Tomorrow"
    return target.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
  } catch {
    return dateIso
  }
}

const RETRY_INTERVAL_MS = 4_000
const MAX_RETRIES = 12   // 12 × 4s = 48s window — covers the ~35s cold-start discovery build

export function DeparturesSoonSection() {
  const [departures, setDepartures] = useState<DepartingSoonItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hidden, setHidden] = useState(false)
  const retryCount = React.useRef(0)
  const retryTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchDepartures = useCallback(async (isRetry = false) => {
    try {
      const res = await fetch("/api/departing-soon", { cache: "no-store" })
      const data = await res.json()

      // Administratively unavailable → hide widget (master toggle OFF or no TourCMS creds)
      if (data.widgetEnabled === false || data.tourcmsConfigured === false) {
        setHidden(true)
        setDepartures([])
        setLoading(false)
        retryCount.current = 0
        return
      }

      // Server is bootstrapping discovery cache (cold start) — keep the skeleton
      // visible and retry automatically every RETRY_INTERVAL_MS until ready.
      if (res.status === 503 || data.error === "DISCOVERY_NOT_INITIALIZED") {
        if (retryCount.current < MAX_RETRIES) {
          retryCount.current += 1
          // Keep loading=true so the skeleton stays on screen during retry wait
          retryTimer.current = setTimeout(() => fetchDepartures(true), RETRY_INTERVAL_MS)
        } else {
          // Exhausted retries — stop showing skeleton, widget stays hidden
          setLoading(false)
        }
        return
      }

      // Success
      retryCount.current = 0
      setLoading(false)
      if (data.ok && Array.isArray(data.departures)) {
        setDepartures(data.departures)
      }
    } catch {
      /* Network error — don't change anything; keep whatever state we had */
      if (!isRetry) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDepartures()
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [fetchDepartures])

  async function manualRefresh() {
    setRefreshing(true)
    try {
      await fetchDepartures()
    } finally {
      setRefreshing(false)
    }
  }

  if (hidden) return null
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={manualRefresh}
            disabled={refreshing}
            aria-label="Refresh departures"
            title="Refresh availability"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/departures"
            className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:flex"
          >
            All departures <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-6 flex gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          : departures.map((dep) => {
              const label = dayLabel(dep.date)
              const labelClass =
                label === "Today" ? "bg-destructive text-white"
                : label === "Tomorrow" ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground"
              const slotHref =
                `/trip/${dep.tripId}?date=${encodeURIComponent(dep.date)}&time=${encodeURIComponent(dep.time)}#booking`
              return (
                <Link
                  key={`${dep.tripId}-${dep.date}-${dep.time}`}
                  href={slotHref}
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
                    <div className={`absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow ${labelClass}`}>
                      <Clock className="h-3 w-3" />
                      {label} {dep.time}
                    </div>

                    {/* Urgency badge — top right (only 1-9 spaces) */}
                    <UrgencyBadge spaces={dep.spacesRemaining} />
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <p className="text-[10px] font-medium text-primary">{dep.tripCategory}</p>
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                      {dep.tripTitle}
                    </h3>

                    <div className="mt-auto flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{dep.tripCity || "Luxembourg"}</span>
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
              )
            })}

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
