"use client"

import { useCallback, useEffect, useState } from "react"
import { useCart } from "@/lib/cart-context"
import Link from "next/link"
import Image from "next/image"
import {
  Route, Sparkles, Clock, Bus, Car, Building2, ArrowRight,
  Star, Lightbulb, Maximize2, Loader2, UtensilsCrossed, Coffee, ExternalLink, Calendar,
} from "lucide-react"
import { ItineraryTimeslots } from "@/components/timeslot-chips"

/* ─── Visit-date helpers — must match the planner page so cookies are shared ─── */
const PREFS_COOKIE = "sightseeing_prefs"
const MAX_AGE = 60 * 60 * 24 * 7

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  try {
    const m = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))
    return m ? decodeURIComponent(m.split("=").slice(1).join("=")) : null
  } catch { return null }
}
function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${MAX_AGE};SameSite=Lax`
}
function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
function todayYMD(): string { return ymdLocal(new Date()) }
function tomorrowYMD(): string { const d = new Date(); d.setDate(d.getDate() + 1); return ymdLocal(d) }
function nextWeekendYMD(): string {
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 6 ? 0 : (6 - dow + 7) % 7))
  return ymdLocal(d)
}
function formatYMDPretty(ymd: string): string {
  if (!ymd) return ""
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) return ymd
  const t = todayYMD(); const tm = tomorrowYMD()
  if (ymd === t) return "Today"
  if (ymd === tm) return "Tomorrow"
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

/** Read startDate from the shared prefs cookie. Returns null if missing, malformed, or in the past. */
function readVisitDate(): string | null {
  const raw = readCookie(PREFS_COOKIE)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { startDate?: string }
    const sd = parsed?.startDate
    if (sd && /^\d{4}-\d{2}-\d{2}$/.test(sd) && sd >= todayYMD()) return sd
  } catch { /* ignore */ }
  return null
}

/** Persist startDate into the shared prefs cookie, preserving any other fields. */
function writeVisitDate(date: string) {
  const raw = readCookie(PREFS_COOKIE)
  let obj: Record<string, unknown> = {}
  if (raw) { try { obj = JSON.parse(raw) ?? {} } catch { obj = {} } }
  obj.startDate = date
  writeCookie(PREFS_COOKIE, JSON.stringify(obj))
}

interface BreakAfter {
  type: "food" | "coffee" | "none"
  label: string
  location: string
  durationMinutes: number
}

interface ItineraryStep {
  time: string
  tripTitle: string
  tripId: string
  durationMinutes: number
  travelToNext: string | null
  breakAfter?: BreakAfter
}

function tripAdvisorUrl(location: string, type: "food" | "coffee") {
  const query = type === "coffee"
    ? `cafes in ${location}`
    : `restaurants in ${location}`
  return `https://www.tripadvisor.com/Search?q=${encodeURIComponent(query)}`
}

interface Listing {
  name: string
  category?: string
  area?: string
  price: number
  image: string
  provider?: string
  stars?: number
  badge: string | null
}

interface CrossSell {
  recommended: boolean
  reason: string
  area?: string
  listings?: Listing[]
}

export interface Itinerary {
  steps: ItineraryStep[]
  summary: string
  tips: string[]
  carSuggestion?: CrossSell
  hotelSuggestion?: CrossSell
}

interface SidebarItineraryProps {
  /** Called once itinerary loads — parent uses this to open the center panel */
  onOpenItinerary: (itinerary: Itinerary) => void
}

export function SidebarItinerary({ onOpenItinerary }: SidebarItineraryProps) {
  const { items } = useCart()
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  /* ─── Visit-date gating ─────────────────────────────────────────────────
     The itinerary cannot be built without a visit date (timeslots, deals,
     and day-of-week logic depend on it). If the user added trips directly
     from /explore or /trip/[id] without going through the planner
     onboarding, the prefs cookie will be missing the startDate — we
     surface an inline date picker before allowing the build. */
  const [visitDate, setVisitDate] = useState<string | null>(null)
  const [showDatePrompt, setShowDatePrompt] = useState(false)
  const [pendingDate, setPendingDate] = useState<string>("")

  // Read date from cookie on mount AND whenever the cart contents change
  // (the user may have completed onboarding in the chat panel after opening
  // the cart, and we want the date to flow through without a full refresh).
  useEffect(() => {
    setVisitDate(readVisitDate())
  }, [items.length])

  const runGenerate = useCallback(async (dateForRun: string) => {
    setLoading(true)
    setError("")
    try {
      const trips = items.map(i => ({
        id: i.trip.id,
        title: i.trip.title,
        city: i.trip.city,
        duration: i.trip.duration,
        category: i.trip.category,
      }))
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trips, startDate: dateForRun }),
      })
      if (!res.ok) throw new Error("Failed to generate")
      const data: Itinerary = await res.json()
      setItinerary(data)
      // Immediately open itinerary panel once loaded
      onOpenItinerary(data)
    } catch {
      setError("Could not generate itinerary. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [items, onOpenItinerary])

  const handleBuildClick = useCallback(() => {
    const existing = readVisitDate()
    if (existing) {
      setVisitDate(existing)
      void runGenerate(existing)
    } else {
      // No date saved — prompt for one before building.
      setPendingDate("")
      setShowDatePrompt(true)
    }
  }, [runGenerate])

  const handleConfirmDate = useCallback((dateValue: string) => {
    if (!dateValue || dateValue < todayYMD()) return
    writeVisitDate(dateValue)
    setVisitDate(dateValue)
    setShowDatePrompt(false)
    void runGenerate(dateValue)
  }, [runGenerate])

  if (items.length < 2) return null

  return (
    <div className="border-t border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Route className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">Smart Itinerary</span>
        {itinerary && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
            {itinerary.steps.length} stops
          </span>
        )}
      </div>

      {!itinerary && !loading && !showDatePrompt && (
        <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
          {visitDate
            ? `Planned for ${formatYMDPretty(visitDate)} — we'll optimise your ${items.length} saved trips into a day plan with transit times.`
            : `Optimise your ${items.length} saved trips into a day plan with transit times.`}
        </p>
      )}

      {/* Inline date prompt — shown when the user has no saved visit date yet. */}
      {showDatePrompt && !itinerary && (
        <div className="mb-2 rounded-xl border border-primary/40 bg-primary/5 p-2.5">
          <div className="mb-2 flex items-start gap-1.5">
            <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="text-[11px] leading-snug text-foreground">
              When are you visiting? We need a date to fetch real timeslots and current deals.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[
              { value: todayYMD(),       label: "Today" },
              { value: tomorrowYMD(),    label: "Tomorrow" },
              { value: nextWeekendYMD(), label: "Weekend" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleConfirmDate(opt.value)}
                className="rounded-md border border-border bg-card px-1.5 py-1.5 text-[10px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="date"
              min={todayYMD()}
              value={pendingDate}
              onChange={(e) => setPendingDate(e.target.value)}
              className="flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] text-foreground focus:border-primary focus:outline-none"
              aria-label="Pick visit date"
            />
            <button
              type="button"
              disabled={!pendingDate || pendingDate < todayYMD()}
              onClick={() => handleConfirmDate(pendingDate)}
              className="rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Use date
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowDatePrompt(false)}
            className="mt-1.5 w-full text-center text-[10px] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {error && <p className="mb-2 text-[10px] text-destructive">{error}</p>}

      <div className="flex gap-1.5">
        {/* Primary action: build OR open */}
        {!itinerary ? (
          <button
            type="button"
            onClick={handleBuildClick}
            disabled={loading || showDatePrompt}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Building...
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                Build Itinerary
              </>
            )}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onOpenItinerary(itinerary)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Maximize2 className="h-3 w-3" />
              View Itinerary
            </button>

          </>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────── */
/* STEP CARD — handles its own real-time snap state */
/* ─────────────────────────────────────────────── */
function ItineraryStepCard({ step }: { step: ItineraryStep }) {
  const [snapped, setSnapped] = useState<{ time: string; day: "today" | "tomorrow" } | null>(null)
  const handleSnap = useCallback(
    (next: { time: string; day: "today" | "tomorrow" }) => {
      setSnapped((prev) =>
        prev && prev.time === next.time && prev.day === next.day ? prev : next,
      )
    },
    [],
  )
  const displayTime = snapped?.time ?? step.time
  const dayLabel = snapped?.day === "tomorrow" ? "Tomorrow " : ""
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold text-primary">
          <span className="text-[10px] font-medium text-muted-foreground">
            {snapped ? "Recommended: " : "Suggested: "}
          </span>
          {dayLabel}
          {displayTime}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {step.durationMinutes} min
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">{step.tripTitle}</p>
      <ItineraryTimeslots
        tripId={step.tripId}
        suggestedTime={step.time}
        onSnap={handleSnap}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────── */
/* ITINERARY PANEL — rendered in the center column */
/* ─────────────────────────────────────────────── */
export function ItineraryPanel({
  itinerary,
  onClose,
  onRegenerate,
  regenerating,
}: {
  itinerary: Itinerary
  onClose: () => void
  onRegenerate: () => void
  regenerating: boolean
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Route className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Day Itinerary</h3>
            <p className="text-xs text-muted-foreground">{itinerary.steps.length} stops planned</p>
          </div>
        </div>
        <div className="flex items-center gap-2">

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close itinerary"
          >
            <span className="text-base leading-none">&times;</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{itinerary.summary}</p>

        {/* Timeline */}
        <div className="relative ml-3 border-l-2 border-primary/20 pl-6">
          {itinerary.steps.map((step, i) => (
            <div key={i} className="relative pb-6 last:pb-0">
              <div className="absolute -left-[17px] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-background">
                <span className="text-[8px] font-bold text-primary">{i + 1}</span>
              </div>
              <ItineraryStepCard step={step} />
              {/* Transit connector */}
              {step.travelToNext && (
                <div className="ml-2 mt-2 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                    <Bus className="h-3 w-3" />
                    <span>{step.travelToNext}</span>
                  </div>
                  <Link
                    href="/cars"
                    className="flex items-center gap-1.5 text-xs text-blue-500/70 transition-colors hover:text-blue-600"
                  >
                    <Car className="h-3 w-3" />
                    {"or rent a car \u2014 from 39\u20AC/day"}
                    <ArrowRight className="h-2.5 w-2.5" />
                  </Link>
                </div>
              )}

              {/* Food / coffee break */}
              {step.breakAfter && step.breakAfter.type !== "none" && step.breakAfter.location && (
                <div className="ml-2 mt-3">
                  <div className={`rounded-xl border p-3 ${
                    step.breakAfter.type === "coffee"
                      ? "border-amber-200/60 bg-amber-50/40"
                      : "border-orange-200/60 bg-orange-50/40"
                  }`}>
                    <div className="flex items-center gap-2">
                      {step.breakAfter.type === "coffee"
                        ? <Coffee className="h-3.5 w-3.5 text-amber-600" />
                        : <UtensilsCrossed className="h-3.5 w-3.5 text-orange-500" />
                      }
                      <span className="text-xs font-semibold text-foreground">{step.breakAfter.label}</span>
                      <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {step.breakAfter.durationMinutes} min
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {"Near " + step.breakAfter.location}
                    </p>
                    <Link
                      href={tripAdvisorUrl(step.breakAfter.location, step.breakAfter.type)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`mt-2 flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                        step.breakAfter.type === "coffee"
                          ? "text-amber-700 hover:text-amber-800"
                          : "text-orange-600 hover:text-orange-700"
                      }`}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {step.breakAfter.type === "coffee"
                        ? `Find cafes in ${step.breakAfter.location} on TripAdvisor`
                        : `Find restaurants in ${step.breakAfter.location} on TripAdvisor`
                      }
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Tips */}
        {itinerary.tips && itinerary.tips.length > 0 && (
          <div className="mt-5 rounded-xl border border-amber-200/50 bg-amber-50/50 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              Tips for your day
            </div>
            <ul className="mt-2 space-y-1.5">
              {itinerary.tips.map((tip, i) => (
                <li key={i} className="text-xs leading-relaxed text-muted-foreground">{"- " + tip}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Car cross-sell */}
        {itinerary.carSuggestion?.recommended && (
          <div className="mt-5 rounded-xl border border-blue-200/50 bg-blue-50/30 p-4">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-blue-600" />
              <h4 className="text-sm font-semibold text-foreground">Rent a car</h4>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{itinerary.carSuggestion.reason}</p>
            {itinerary.carSuggestion.listings && (
              <div className="mt-3 space-y-2">
                {itinerary.carSuggestion.listings.map((car) => (
                  <Link key={car.name} href="/cars" className="flex items-center gap-3 rounded-lg bg-background/80 p-2.5 transition-colors hover:bg-background">
                    <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg">
                      <Image src={car.image} alt={car.name} fill className="object-cover" sizes="80px" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-foreground">{car.name}</p>
                      <p className="text-[10px] text-muted-foreground">{car.category} &middot; {car.provider}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-foreground">{car.price}&euro;</span>
                      <p className="text-[10px] text-muted-foreground">per day</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <Link href="/cars" className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-blue-100/50 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
              Browse all car rentals <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {/* Hotel cross-sell */}
        {itinerary.hotelSuggestion?.recommended && (
          <div className="mt-4 rounded-xl border border-amber-200/50 bg-amber-50/30 p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-amber-600" />
              <h4 className="text-sm font-semibold text-foreground">
                {"Stay the night" + (itinerary.hotelSuggestion.area ? ` near ${itinerary.hotelSuggestion.area}` : "")}
              </h4>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{itinerary.hotelSuggestion.reason}</p>
            {itinerary.hotelSuggestion.listings && (
              <div className="mt-3 space-y-2">
                {itinerary.hotelSuggestion.listings.map((hotel) => (
                  <Link key={hotel.name} href="/hotels" className="flex items-center gap-3 rounded-lg bg-background/80 p-2.5 transition-colors hover:bg-background">
                    <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg">
                      <Image src={hotel.image} alt={hotel.name} fill className="object-cover" sizes="80px" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-foreground">{hotel.name}</p>
                      <div className="flex gap-0.5">
                        {Array.from({ length: hotel.stars || 3 }).map((_, i) => (
                          <Star key={i} className="h-2 w-2 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-foreground">{hotel.price}&euro;</span>
                      <p className="text-[10px] text-muted-foreground">per night</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <Link href="/hotels" className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-amber-100/50 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100">
              Browse all hotels <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
