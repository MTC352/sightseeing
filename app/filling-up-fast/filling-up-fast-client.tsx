"use client"

/**
 * Filling Up Fast — standalone page.
 *
 * Lists every trip departing TODAY (Luxembourg local time — dynamic, resolved
 * server-side), ordered by seat availability: fewest seats remaining first
 * (strongest scarcity first). Pure consumer of `/api/departing-soon?scope=today`
 * (availability served from cache — never triggers upstream). Same snapshot-first
 * two-phase load as the Departing Soon page: cards paint from the snapshot, then
 * live seat counts overlay and the list re-orders by scarcity.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Zap, Clock, MapPin, ArrowRight, RefreshCw, Loader2 } from "lucide-react"
import { EditableText } from "@/components/editable-text"
import type { DepartingSoonItem } from "@/app/api/departing-soon/route"

/** Rank a card by seats remaining (fewest first). Unlimited / unknown sort last. */
function seatRank(d: DepartingSoonItem): number {
  const s = d.spacesRemaining
  if (s === undefined || s === "UNLIMITED") return Number.MAX_SAFE_INTEGER
  return s
}

/** Seat-count badge — always shown on this page (scarcity is the whole point).
 *  Red when at/below half the threshold or full, amber below the threshold,
 *  emerald when plentiful. Unlimited / unknown → no badge. */
function SeatBadge({
  spaces,
  threshold,
}: {
  spaces: number | "UNLIMITED" | undefined
  threshold: number
}) {
  if (spaces === undefined || spaces === "UNLIMITED") return null
  const redLimit = Math.floor(threshold / 2)
  const colour =
    spaces === 0 || spaces <= redLimit
      ? "bg-destructive text-white"
      : spaces < threshold
        ? "bg-amber-500 text-white"
        : "bg-emerald-500 text-white"
  const label = spaces === 0 ? "Full" : `${spaces} left`
  return (
    <div className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold shadow ${colour}`}>
      {label}
    </div>
  )
}

/** Loading skeleton shown in the seat-pill slot while availability is fetched. */
function SeatPillSkeleton() {
  return (
    <div
      className="absolute right-3 top-3 h-[18px] w-12 animate-pulse rounded-full bg-white/75 shadow"
      aria-label="Checking availability"
    />
  )
}

/** Format a YYYY-MM-DD date for the hero, e.g. "Thursday, 14 August 2026". */
function formatToday(dateIso: string): string {
  try {
    const [y, m, d] = dateIso.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
  } catch {
    return dateIso
  }
}

const RETRY_INTERVAL_MS = 4_000
const MAX_RETRIES = 12 // ~48s window — covers the cold-start discovery build.

export function FillingUpFastClient() {
  const [departures, setDepartures] = useState<DepartingSoonItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [threshold, setThreshold] = useState(15)
  const [today, setToday] = useState<string | null>(null)
  const [availEnabled, setAvailEnabled] = useState(false)
  const [availLoaded, setAvailLoaded] = useState(false)
  const retryCount = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Phase 2: overlay live seat availability, then re-order by scarcity.
  const overlayAvailability = useCallback(async () => {
    try {
      const res = await fetch("/api/departing-soon?scope=today", { cache: "no-store" })
      const data = await res.json()
      if (!data.ok || !Array.isArray(data.departures)) return
      if (typeof data.availabilityThreshold === "number") setThreshold(data.availabilityThreshold)
      const ranked = [...(data.departures as DepartingSoonItem[])].sort(
        (a, b) => seatRank(a) - seatRank(b),
      )
      setDepartures(ranked)
    } catch {
      /* Keep the snapshot cards as-is if the availability pass fails. */
    } finally {
      setAvailLoaded(true)
    }
  }, [])

  // Phase 1: fast paint from the snapshot (no availability), then overlay.
  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/departing-soon?scope=today&availability=0", { cache: "no-store" })
      const data = await res.json()

      if (data.widgetEnabled === false || data.tourcmsConfigured === false) {
        setUnavailable(true)
        setDepartures([])
        setLoading(false)
        retryCount.current = 0
        return
      }

      if (res.status === 503 || data.error === "DISCOVERY_NOT_INITIALIZED") {
        if (retryCount.current < MAX_RETRIES) {
          retryCount.current += 1
          retryTimer.current = setTimeout(fetchSnapshot, RETRY_INTERVAL_MS)
        } else {
          setLoading(false)
        }
        return
      }

      retryCount.current = 0
      setLoading(false)
      if (data.ok && Array.isArray(data.departures)) {
        setDepartures(data.departures)
        if (typeof data.today === "string") setToday(data.today)
        setAvailEnabled(data.availabilityEnabled === true)
        setAvailLoaded(false)
        void overlayAvailability()
      }
    } catch {
      setLoading(false)
    }
  }, [overlayAvailability])

  useEffect(() => {
    fetchSnapshot()
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [fetchSnapshot])

  async function manualRefresh() {
    setRefreshing(true)
    try {
      retryCount.current = 0
      await fetchSnapshot()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <>
      {/* Hero */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-14">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <Zap className="h-4 w-4" />
            <EditableText id="filling-up-fast:hero:eyebrow" defaultValue="Filling Up Fast" />
          </div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground lg:text-4xl">
                <EditableText id="filling-up-fast:hero:title" defaultValue="Filling up fast today" />
              </h1>
              <p className="mt-3 max-w-xl text-muted-foreground">
                <EditableText
                  id="filling-up-fast:hero:subheading-lead"
                  defaultValue="Every experience departing"
                />{" "}
                {/* Dynamic date — never editable, even in admin edit mode. */}
                <span data-no-edit>
                  {today ? (
                    <span className="font-medium text-foreground">today, {formatToday(today)}</span>
                  ) : (
                    "today"
                  )}
                </span>
                ,{" "}
                <EditableText
                  id="filling-up-fast:hero:subheading-tail"
                  defaultValue="ranked by how few seats remain. Grab yours before they sell out."
                />
              </p>
            </div>
            {/* Live control — not content. */}
            <button
              data-no-edit
              type="button"
              onClick={manualRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {/* Grid */}
      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
        {loading ? (
          // Transient live status — never editable.
          <div data-no-edit className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
            <p className="mt-3 text-sm">Loading today&apos;s experiences…</p>
          </div>
        ) : unavailable ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
            <Zap className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-foreground">
              <EditableText id="filling-up-fast:unavailable:title" defaultValue="This is currently unavailable" />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <EditableText id="filling-up-fast:unavailable:body" defaultValue="Please check back shortly." />
            </p>
          </div>
        ) : departures.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
            <Zap className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-foreground">
              <EditableText id="filling-up-fast:empty:title" defaultValue="Nothing left for today" />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <EditableText
                id="filling-up-fast:empty:body"
                defaultValue="All of today's experiences have departed or sold out. Explore what's coming up next."
                multiline
              />
            </p>
            <Link
              data-no-edit
              href="/explore"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Browse all experiences
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            {/* Dynamic count — never editable. */}
            <p data-no-edit className="mb-5 text-sm text-muted-foreground">
              {departures.length} {departures.length === 1 ? "experience" : "experiences"} departing today · fewest seats first
            </p>
            {/* Live trip cards — never editable. */}
            <div data-no-edit className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {departures.map((dep) => {
                const slotHref = `/trip/${dep.tripSlug ?? dep.tripId}?date=${encodeURIComponent(dep.date)}&time=${encodeURIComponent(dep.time)}&from=filling-up#booking`
                return (
                  <Link
                    key={`${dep.tripId}-${dep.date}-${dep.time}`}
                    href={slotHref}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-destructive/30 hover:shadow-md"
                  >
                    {/* Image */}
                    <div className="relative h-40 w-full overflow-hidden">
                      {dep.tripImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
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
                      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1 text-[11px] font-semibold text-white shadow">
                        <Clock className="h-3 w-3" />
                        Today {dep.time}
                      </div>
                      {availEnabled && !availLoaded ? (
                        <SeatPillSkeleton />
                      ) : (
                        <SeatBadge spaces={dep.spacesRemaining} threshold={threshold} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <p className="text-[10px] font-medium text-primary">{dep.tripCategory}</p>
                      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                        {dep.tripTitle}
                      </h3>
                      <div className="mt-auto flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{dep.tripCity || "Luxembourg"}</span>
                        </div>
                        <span className="text-xs font-semibold text-foreground">{dep.priceDisplay}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                        Book now{" "}
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
