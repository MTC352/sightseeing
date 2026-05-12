"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import type { Trip } from "@/lib/data"
import { useCart } from "@/lib/cart-context"
import { useIsGoodWeatherForTrip } from "@/lib/weather-context"
import {
  Star, Clock, MapPin, SlidersHorizontal, CalendarDays, X,
  ChevronRight, Sparkles, Check, Plus, Sun, LayoutGrid, List, ArrowRight,
  Users, Minus,
} from "lucide-react"
import { DateTimeModal } from "@/components/date-time-modal"

interface Filters {
  priceMin: number; priceMax: number; ratingMin: number; durationMax: number
  persons: number; locationAddress: string; locationRadius: number
  dateFrom: string; dateTo: string; timeFrom: string; timeTo: string
}
const DEFAULT_FILTERS: Filters = {
  priceMin: 0, priceMax: 500, ratingMin: 0, durationMax: 24, persons: 1,
  locationAddress: "", locationRadius: 10, dateFrom: "", dateTo: "", timeFrom: "", timeTo: "",
}

interface Timeslot { time: string; spotsLeft: number; spotsTotal: number }
interface TripAvailability { today: Timeslot[]; tomorrow: Timeslot[] }
type AvailabilityMap = Record<string, TripAvailability>

const MAX_SLOTS_SHOWN = 4

/* Deterministic fallback for when the API hasn't loaded yet */
function getDummyDepartures(tripId: string): TripAvailability {
  const hash  = tripId.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  const times = ["09:00", "10:30", "11:00", "13:00", "14:30", "15:00", "16:30", "18:00", "19:30"]
  const pickSlots = (seed: number, count: number): Timeslot[] => {
    const slots: Timeslot[] = []
    for (let i = 0; i < count; i++) {
      const idx    = (seed + i * 3) % times.length
      const total  = 10 + ((seed + i) % 15)
      const booked = Math.floor(total * (0.2 + ((seed * i) % 80) / 100))
      slots.push({ time: times[idx], spotsLeft: Math.max(0, total - booked), spotsTotal: total })
    }
    return slots.sort((a, b) => a.time.localeCompare(b.time))
  }
  return {
    today:    pickSlots(hash, 1 + (hash % 4)),
    tomorrow: pickSlots(hash + 7, 1 + ((hash + 2) % 5)),
  }
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  })
}

/* Check if a slot satisfies the person count requirement */
function slotFitsPersons(slot: Timeslot, persons: number): boolean {
  if (persons <= 1) return true
  if (slot.spotsLeft === 0) return false        // sold out
  if (slot.spotsLeft >= 99) return true         // UNLIMITED
  return slot.spotsLeft >= persons
}

/* Check if a slot falls within the user-selected time window (client-side) */
function slotFitsTime(slot: Timeslot, timeFrom: string, timeTo: string): boolean {
  if (!timeFrom && !timeTo) return true
  if (timeFrom && slot.time < timeFrom) return false
  if (timeTo   && slot.time > timeTo)   return false
  return true
}

/* ── Filter modal ── */
function FilterModal({ open, onClose, filters, onChange }: {
  open: boolean; onClose: () => void; filters: Filters; onChange: (f: Filters) => void
}) {
  const [local, setLocal] = useState<Filters>(filters)
  useEffect(() => { if (open) setLocal(filters) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null
  const set = (k: keyof Filters, v: number | string) => setLocal((p) => ({ ...p, [k]: v }))
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">Filters</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col gap-5 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Price range</label>
            <div className="flex items-center gap-3">
              <input type="number" min={0} max={500} value={local.priceMin} onChange={(e) => set("priceMin", +e.target.value)}
                className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm" placeholder="Min €" />
              <span className="text-muted-foreground">–</span>
              <input type="number" min={0} max={500} value={local.priceMax} onChange={(e) => set("priceMax", +e.target.value)}
                className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm" placeholder="Max €" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Min. rating: {local.ratingMin > 0 ? `${local.ratingMin}+` : "Any"}</label>
            <input type="range" min={0} max={5} step={0.5} value={local.ratingMin} onChange={(e) => set("ratingMin", +e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Max duration: {local.durationMax < 24 ? `${local.durationMax}h` : "Any"}</label>
            <input type="range" min={1} max={24} step={0.5} value={local.durationMax} onChange={(e) => set("durationMax", +e.target.value)} className="w-full" />
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-5 py-4">
          <button type="button" onClick={() => { setLocal(DEFAULT_FILTERS); onChange(DEFAULT_FILTERS) }}
            className="flex-1 rounded-full border border-border py-2 text-sm font-medium text-foreground hover:bg-secondary">Reset</button>
          <button type="button" onClick={() => { onChange(local); onClose() }}
            className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Apply</button>
        </div>
      </div>
    </div>
  )
}

/* ── Persons popover (inline +/- counter) ── */
function PersonsPopover({
  persons,
  onChange,
  onClose,
}: {
  persons: number
  onChange: (n: number) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 mt-1.5 flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 shadow-xl"
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, persons - 1))}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary"
        aria-label="Fewer guests"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-7 text-center text-sm font-semibold text-foreground">{persons}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(50, persons + 1))}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary"
        aria-label="More guests"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <span className="ml-1 text-xs text-muted-foreground">guest{persons !== 1 ? "s" : ""}</span>
    </div>
  )
}

/* ── Timeslot chip ── */
function TimeslotChip({ slot }: { slot: Timeslot }) {
  const pct = slot.spotsLeft / slot.spotsTotal
  const colorClass = slot.spotsLeft === 0
    ? "bg-red-50 border-red-200 text-red-700"
    : pct <= 0.2 ? "bg-amber-50 border-amber-200 text-amber-700"
    : "bg-emerald-50 border-emerald-200 text-emerald-700"
  const dotColor = slot.spotsLeft === 0 ? "bg-red-500" : pct <= 0.2 ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${colorClass}`}>
      <span className="font-semibold">{slot.time}</span>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className="text-[11px]">
        {slot.spotsLeft === 0 ? "Sold out" : slot.spotsLeft >= 99 ? "Available" : `${slot.spotsLeft} left`}
      </span>
    </div>
  )
}

/* ── Grid card ── */
function SearchCard({ trip, priority = false }: { trip: Trip; priority?: boolean }) {
  const { addItem, isInCart } = useCart()
  const inCart      = isInCart(trip.id)
  const goodWeather = useIsGoodWeatherForTrip(trip.category)
  return (
    <Link href={`/trip/${trip.id}`} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image src={trip.image || "/placeholder.svg"} alt={trip.title} fill priority={priority}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" />
        {trip.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow">{trip.badge}</span>
        )}
        {goodWeather && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold text-amber-900 shadow backdrop-blur-sm">
            <Sun className="h-2.5 w-2.5" />Good for today
          </span>
        )}
        <button type="button" onClick={(e) => { e.preventDefault(); addItem(trip) }} disabled={inCart}
          className={`absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-md backdrop-blur-sm transition-all duration-200 ${
            inCart ? "bg-primary text-primary-foreground" : "bg-background/90 text-foreground opacity-0 group-hover:opacity-100 hover:bg-background"
          }`}>
          {inCart ? <><Check className="h-3 w-3" />Added</> : <><Plus className="h-3 w-3" />Add to Triplist</>}
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{trip.category}</p>
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">{trip.title}</h3>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /><span className="font-semibold text-foreground">{trip.rating}</span></span>
          <span>·</span>
          <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{trip.duration}</span>
        </div>
        <p className="mt-auto pt-1 text-sm font-bold text-foreground">
          From <span className="text-primary">{trip.price.toFixed(2)} €</span>
        </p>
      </div>
    </Link>
  )
}

/* ── Timeslot skeleton (shown while availability is loading) ── */
// `rows` must match the number of date rows the real content will show
// so card height stays identical and no reflow happens on load.
function TimeslotSkeleton({ rows }: { rows: 1 | 2 }) {
  return (
    <div className="mt-4 border-t border-border pt-4">
      {/* section-label skeleton */}
      <div className="mb-2 h-3 w-28 animate-pulse rounded bg-muted" />
      {/* one skeleton chip-row per expected date row */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, ri) => (
          <div key={ri} className="flex items-center gap-2">
            <div className="h-4 w-[72px] animate-pulse rounded bg-muted shrink-0" />
            <div className="flex gap-2">
              {[76, 68, 72].map((w, ci) => (
                <div
                  key={ci}
                  className="h-8 animate-pulse rounded-lg bg-muted"
                  style={{ width: w }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Slot row: label + up-to-4 chips filtered by person count + time window (client-side) ── */
function SlotRow({
  label, slots, tripId, persons, timeFrom, timeTo,
}: {
  label: string; slots: Timeslot[]; tripId: string; persons: number; timeFrom: string; timeTo: string
}) {
  const eligible = slots.filter((s) => slotFitsPersons(s, persons) && slotFitsTime(s, timeFrom, timeTo))
  if (eligible.length === 0) return null
  const visible  = eligible.slice(0, MAX_SLOTS_SHOWN)
  const overflow = eligible.length - MAX_SLOTS_SHOWN
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-semibold text-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        {visible.map((s, i) => <TimeslotChip key={i} slot={s} />)}
        {overflow > 0 && (
          <Link
            href={`/trip/${tripId}#booking`}
            className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            +{overflow} more <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  )
}

/* ── List card ── */
function SearchListCard({
  trip, priority = false, availability, dateFilter, persons, timeFrom, timeTo, isLoading,
}: {
  trip: Trip
  priority?: boolean
  availability: AvailabilityMap
  dateFilter: { date: string } | null
  persons: number
  timeFrom: string
  timeTo: string
  isLoading: boolean
}) {
  const { addItem, isInCart } = useCart()
  const inCart      = isInCart(trip.id)
  const goodWeather = useIsGoodWeatherForTrip(trip.category)
  // Show skeleton while this trip's data hasn't arrived yet
  const tripAvail   = availability[trip.id]
  const showSkeleton = isLoading && !tripAvail
  const departures  = tripAvail ?? getDummyDepartures(trip.id)

  // Build labeled slot rows: when date filter active show ONLY that date; otherwise today/tomorrow
  const now           = new Date()
  const todayLabel    = formatDate(now.toISOString().split("T")[0])
  const tomorrowLabel = formatDate(new Date(now.getTime() + 86_400_000).toISOString().split("T")[0])

  const slotRows: { label: string; slots: Timeslot[] }[] = []
  if (dateFilter?.date) {
    slotRows.push({ label: formatDate(dateFilter.date), slots: departures.today })
  } else {
    if (departures.today.length > 0)    slotRows.push({ label: todayLabel,    slots: departures.today })
    if (departures.tomorrow.length > 0) slotRows.push({ label: tomorrowLabel, slots: departures.tomorrow })
  }

  const hasEligibleSlots = slotRows.some(({ slots }) =>
    slots.some((s) => slotFitsPersons(s, persons) && slotFitsTime(s, timeFrom, timeTo))
  )

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md sm:flex-row">
      <div className="relative aspect-[16/10] sm:aspect-auto sm:w-56 lg:w-64 shrink-0">
        <Link href={`/trip/${trip.id}`} className="absolute inset-0">
          <Image src={trip.image || "/placeholder.svg"} alt={trip.title} fill priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, 256px" />
        </Link>
        {trip.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow">{trip.badge}</span>
        )}
        {goodWeather && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold text-amber-900 shadow backdrop-blur-sm">
            <Sun className="h-2.5 w-2.5" />Good for today
          </span>
        )}
        <button type="button" onClick={(e) => { e.preventDefault(); addItem(trip) }} disabled={inCart}
          className={`absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-md backdrop-blur-sm transition-all duration-200 ${
            inCart ? "bg-primary text-primary-foreground" : "bg-background/90 text-foreground opacity-0 group-hover:opacity-100 hover:bg-background"
          }`}>
          {inCart ? <><Check className="h-3 w-3" />Added</> : <><Plus className="h-3 w-3" />Add to Triplist</>}
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{trip.category}</p>
            <Link href={`/trip/${trip.id}`}>
              <h3 className="mt-0.5 text-base font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">{trip.title}</h3>
            </Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-foreground">{trip.rating}</span>
                <span>({trip.reviewCount.toLocaleString()})</span>
              </span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{trip.duration}</span>
              {trip.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{trip.city}</span>}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-lg font-bold text-foreground">{trip.price.toFixed(2)} <span className="text-sm font-medium">€</span></p>
            {trip.originalPrice && <p className="text-xs text-muted-foreground line-through">{trip.originalPrice.toFixed(2)} €</p>}
            <p className="text-[10px] text-muted-foreground">per person</p>
          </div>
        </div>

        {showSkeleton ? (
          <TimeslotSkeleton rows={dateFilter?.date ? 1 : 2} />
        ) : hasEligibleSlots ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {dateFilter?.date ? "Departures" : "Available Timeslots"}
            </p>
            <div className="flex flex-col gap-3">
              {slotRows.map(({ label, slots }) => (
                <SlotRow key={label} label={label} slots={slots} tripId={trip.id} persons={persons} timeFrom={timeFrom} timeTo={timeTo} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ── Main component ── */
export function SearchContent({ initialTrips }: { initialTrips: Trip[] }) {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const query        = searchParams.get("q") || ""

  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen]       = useState(false)
  const [dateOpen, setDateOpen]             = useState(false)
  const [personsOpen, setPersonsOpen]       = useState(false)
  const [viewMode, setViewMode]             = useState<"grid" | "list">("list")
  const [availability, setAvailability]     = useState<AvailabilityMap>({})
  const [availLoading, setAvailLoading]     = useState(false)

  // Initialize filters from URL params (preserves hero search selections)
  const [activeFilters, setActiveFilters] = useState<Filters>(() => ({
    ...DEFAULT_FILTERS,
    dateFrom: searchParams.get("date")     ?? "",
    timeFrom: searchParams.get("timeFrom") ?? "",
    timeTo:   searchParams.get("timeTo")   ?? "",
    persons:  Math.max(1, parseInt(searchParams.get("persons") ?? "1", 10) || 1),
  }))

  // Sync URL params when date/time/persons filters change (so URL stays shareable)
  const isMounted = useRef(false)
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return }
    const params = new URLSearchParams()
    if (query)                   params.set("q",        query)
    if (activeFilters.dateFrom)  params.set("date",     activeFilters.dateFrom)
    if (activeFilters.timeFrom)  params.set("timeFrom", activeFilters.timeFrom)
    if (activeFilters.timeTo)    params.set("timeTo",   activeFilters.timeTo)
    if (activeFilters.persons > 1) params.set("persons", String(activeFilters.persons))
    router.replace(`/search?${params.toString()}`, { scroll: false })
  }, [activeFilters.dateFrom, activeFilters.timeFrom, activeFilters.timeTo, activeFilters.persons]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Fetch availability — only re-fires when the DATE changes.
     Time + person filtering is fully client-side so those changes never
     trigger a network request and can't cause race conditions.
     AbortController cancels any stale in-flight request. */
  const abortRef = useRef<AbortController | null>(null)

  const fetchAvailability = useCallback((dateFrom: string) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const params = new URLSearchParams()
    if (dateFrom) params.set("date", dateFrom)   // date only — no time params
    setAvailLoading(true)
    fetch(`/api/availability?${params}`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : {})
      .then((data: AvailabilityMap) => { setAvailability(data); abortRef.current = null })
      .catch((err) => { if (err?.name !== "AbortError") console.error(err) })
      .finally(() => setAvailLoading(false))
  }, [])

  useEffect(() => { fetchAvailability(activeFilters.dateFrom) }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchAvailability(activeFilters.dateFrom)
  }, [activeFilters.dateFrom, fetchAvailability])

  /* Category pills */
  const categories = useMemo(() => {
    const seen = new Set<string>()
    return initialTrips
      .map((t) => t.category)
      .filter((c) => { if (!c || seen.has(c)) return false; seen.add(c); return true })
      .sort()
  }, [initialTrips])

  const dateFilterActive = activeFilters.dateFrom !== ""
  const dateFilter = dateFilterActive
    ? { date: activeFilters.dateFrom, timeFrom: activeFilters.timeFrom, timeTo: activeFilters.timeTo }
    : null
  const persons = activeFilters.persons

  const activeFilterCount = [
    activeFilters.priceMin > 0 || activeFilters.priceMax < 500,
    activeFilters.ratingMin > 0,
    activeFilters.durationMax < 24,
    activeFilters.locationAddress !== "",
  ].filter(Boolean).length

  const hasDate    = activeFilters.dateFrom !== "" || activeFilters.timeFrom !== ""
  const hasPersons = persons > 1

  const datePillLabel = (() => {
    if (!activeFilters.dateFrom && !activeFilters.timeFrom) return "Dates & Times"
    const datePart = activeFilters.dateFrom
      ? new Date(activeFilters.dateFrom + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : ""
    const timePart = activeFilters.timeFrom
      ? activeFilters.timeTo ? `${activeFilters.timeFrom}–${activeFilters.timeTo}` : activeFilters.timeFrom
      : ""
    return [datePart, timePart].filter(Boolean).join(" · ")
  })()

  /* Keyword match */
  const keywordMatched = useMemo(() => {
    if (!query.trim()) return initialTrips
    const kws = query.toLowerCase().split(/\s+/).filter(Boolean)
    return initialTrips.filter((t) => {
      const hay = [t.title, t.category, t.city ?? "", t.description ?? "", t.provider ?? "", ...(t.tags ?? [])].join(" ").toLowerCase()
      return kws.every((kw) => hay.includes(kw))
    })
  }, [query, initialTrips])

  /* Full filter chain */
  const filtered = useMemo(() => {
    let result = keywordMatched.filter((t) => {
      if (activeCategory && t.category !== activeCategory) return false
      if (t.price < activeFilters.priceMin || t.price > activeFilters.priceMax) return false
      if (t.rating < activeFilters.ratingMin) return false
      if (activeFilters.locationAddress &&
        !t.title.toLowerCase().includes(activeFilters.locationAddress.toLowerCase()) &&
        !t.category.toLowerCase().includes(activeFilters.locationAddress.toLowerCase())) return false
      const dHours = parseFloat(t.duration?.replace(/[^\d.]/g, "") || "99")
      if (activeFilters.durationMax < 24 && dHours > activeFilters.durationMax) return false
      return true
    })

    // When availability is loaded, hide trips with no qualifying timeslots.
    // Person count + time range are applied client-side here (no re-fetch needed).
    const timeFrom = activeFilters.timeFrom
    const timeTo   = activeFilters.timeTo
    const hasTimeFilter = timeFrom !== "" || timeTo !== ""

    if (!availLoading && Object.keys(availability).length > 0) {
      result = result.filter((t) => {
        const avail = availability[t.id]
        if (!avail) return true // no data yet — keep showing

        const slotOk = (s: Timeslot) =>
          slotFitsPersons(s, persons) && slotFitsTime(s, timeFrom, timeTo)

        if (dateFilterActive) {
          // Date selected → must have a matching slot on that date
          return avail.today.some(slotOk)
        } else if (persons > 1 || hasTimeFilter) {
          // Person or time filter active → must have a matching slot today or tomorrow
          return avail.today.some(slotOk) || avail.tomorrow.some(slotOk)
        }
        // No availability-based filter → show all
        return true
      })
    }

    return result
  }, [keywordMatched, activeCategory, activeFilters, dateFilterActive, availability, availLoading, persons])

  /* ── Smooth exit animation state ── */
  const [displayedTrips, setDisplayedTrips] = useState<Trip[]>(filtered)
  const [exitingIds, setExitingIds]         = useState<Set<string>>(new Set())
  const displayedRef  = useRef<Trip[]>(filtered)
  const filteredRef   = useRef<Trip[]>(filtered)   // always latest — avoids stale closures in setTimeout
  const exitTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep refs in sync with current state/derived values
  useEffect(() => { displayedRef.current = displayedTrips }, [displayedTrips])
  useEffect(() => { filteredRef.current  = filtered        }, [filtered])

  useEffect(() => {
    if (exitTimer.current) clearTimeout(exitTimer.current)

    const newIds    = new Set(filtered.map((t) => t.id))
    // Only consider "currently visible" trips (exclude those already mid-exit)
    const currently = displayedRef.current.filter((t) => !exitingIds.has(t.id))
    const leaving   = currently.filter((t) => !newIds.has(t.id))

    if (leaving.length > 0) {
      // Mark leaving trips as exiting → CSS transition collapses them
      setExitingIds((prev) => new Set([...prev, ...leaving.map((t) => t.id)]))
      exitTimer.current = setTimeout(() => {
        // Use filteredRef so we always commit the *latest* filtered list,
        // not the stale value captured when the timeout was created.
        setDisplayedTrips(filteredRef.current)
        setExitingIds(new Set())
        exitTimer.current = null
      }, 320)
    } else {
      // Trips entering or no change — update immediately and ALWAYS clear
      // any stale exitingIds so previously-exiting trips don't stay invisible.
      setDisplayedTrips(filtered)
      setExitingIds(new Set())
    }
    return () => { if (exitTimer.current) clearTimeout(exitTimer.current) }
  }, [filtered]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearDate = () =>
    setActiveFilters((p) => ({ ...p, dateFrom: "", dateTo: "", timeFrom: "", timeTo: "" }))

  return (
    <div className="min-h-screen bg-background font-sans">
      <Navbar />

      <FilterModal
        open={filtersOpen} onClose={() => setFiltersOpen(false)}
        filters={activeFilters} onChange={(f) => setActiveFilters(f)}
      />
      <DateTimeModal
        open={dateOpen}
        onClose={() => setDateOpen(false)}
        value={{ date: activeFilters.dateFrom, timeFrom: activeFilters.timeFrom, timeTo: activeFilters.timeTo }}
        onApply={(v) => setActiveFilters((prev) => ({ ...prev, dateFrom: v.date, timeFrom: v.timeFrom, timeTo: v.timeTo }))}
      />

      {/* ── Sticky filter bar ── */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="flex items-center py-2.5">
            {/* Left pills */}
            <div className="flex shrink-0 items-center gap-2 pr-2">
              {/* Filter button */}
              <button type="button" onClick={() => setFiltersOpen(true)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  activeFilterCount > 0 ? "bg-foreground text-background" : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground">{activeFilterCount}</span>
                )}
              </button>

              {/* Dates & Times pill */}
              <button type="button" onClick={() => setDateOpen(true)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  hasDate ? "bg-foreground text-background" : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}>
                <CalendarDays className="h-3.5 w-3.5" />
                {datePillLabel}
                {hasDate && (
                  <span role="button" tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); clearDate() }}
                    onKeyDown={(e) => e.key === "Enter" && clearDate()}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-background/20" aria-label="Clear dates">
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>

              {/* Guests pill with inline popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPersonsOpen((o) => !o)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    hasPersons ? "bg-foreground text-background" : "bg-secondary text-foreground hover:bg-secondary/80"
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  {hasPersons ? `${persons} guest${persons !== 1 ? "s" : ""}` : "Guests"}
                  {hasPersons && (
                    <span
                      role="button" tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setActiveFilters((p) => ({ ...p, persons: 1 })); setPersonsOpen(false) }}
                      onKeyDown={(e) => e.key === "Enter" && setActiveFilters((p) => ({ ...p, persons: 1 }))}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-background/20" aria-label="Clear guests"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </button>
                {personsOpen && (
                  <PersonsPopover
                    persons={persons}
                    onChange={(n) => setActiveFilters((p) => ({ ...p, persons: n }))}
                    onClose={() => setPersonsOpen(false)}
                  />
                )}
              </div>

              <div className="h-5 w-px bg-border" />
            </div>

            {/* Category pills (scrollable) */}
            <div className="flex flex-1 gap-2 overflow-x-auto scrollbar-none">
              {categories.map((cat) => {
                const isActive = activeCategory === cat
                return (
                  <button type="button" key={cat}
                    onClick={() => setActiveCategory(isActive ? null : cat)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      isActive ? "bg-foreground text-background" : "bg-secondary text-foreground hover:bg-secondary/80"
                    }`}>
                    {cat}
                  </button>
                )
              })}
            </div>
            <div className="shrink-0 pl-1">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            {query && (
              <p className="mb-0.5 text-xs text-muted-foreground">
                Results for <span className="font-semibold text-foreground">&quot;{query}&quot;</span>
              </p>
            )}
            {dateFilterActive && (
              <p className="mb-0.5 text-xs text-muted-foreground">
                Departures on <span className="font-semibold text-foreground">{formatDate(activeFilters.dateFrom)}</span>
                {activeFilters.timeFrom && (
                  <> · <span className="font-semibold text-foreground">{activeFilters.timeFrom}{activeFilters.timeTo ? `–${activeFilters.timeTo}` : ""}</span></>
                )}
                {persons > 1 && (
                  <> · <span className="font-semibold text-foreground">{persons} guests</span></>
                )}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {availLoading
                ? <span className="italic">Checking availability…</span>
                : <><span className="font-semibold text-foreground">{filtered.length}</span> experience{filtered.length !== 1 ? "s" : ""}{activeCategory ? ` in ${activeCategory}` : " in Luxembourg"}</>
              }
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
            <button type="button" onClick={() => setViewMode("grid")} aria-label="Grid view"
              className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setViewMode("list")} aria-label="List view"
              className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {filtered.length === 0 && !availLoading ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-semibold text-foreground">
              {dateFilterActive
                ? `No departures found for ${formatDate(activeFilters.dateFrom)}${persons > 1 ? ` with ${persons} guests` : ""}`
                : persons > 1
                ? `No available experiences for ${persons} guests`
                : `No experiences found${query ? ` for "${query}"` : ""}`}
            </p>
            <p className="text-sm text-muted-foreground">
              {dateFilterActive || persons > 1
                ? "Try a different date, time, or fewer guests."
                : "Try different keywords or adjust your filters."}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {dateFilterActive && (
                <button type="button" onClick={clearDate}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                  Clear date filter
                </button>
              )}
              {persons > 1 && (
                <button type="button" onClick={() => setActiveFilters((p) => ({ ...p, persons: 1 }))}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                  Clear guest count
                </button>
              )}
            </div>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((t, i) => <SearchCard key={t.id} trip={t} priority={i < 8} />)}
          </div>
        ) : (
          <div className="flex flex-col">
            {displayedTrips.map((t, i) => {
              const exiting = exitingIds.has(t.id)
              return (
                // CSS Grid row-height trick: grid-rows-[1fr] → [0fr] collapses height
                // smoothly without knowing the element's pixel height in advance.
                <div
                  key={t.id}
                  className={`grid transition-all duration-300 ease-in-out ${
                    exiting
                      ? "grid-rows-[0fr] opacity-0 pointer-events-none"
                      : "grid-rows-[1fr] opacity-100"
                  }`}
                >
                  {/* overflow-hidden is required for the row-height trick to work */}
                  <div className="overflow-hidden">
                    <div className="pb-4">
                      <SearchListCard
                        trip={t}
                        priority={i < 4}
                        availability={availability}
                        dateFilter={dateFilter}
                        persons={persons}
                        timeFrom={activeFilters.timeFrom}
                        timeTo={activeFilters.timeTo}
                        isLoading={availLoading}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <SiteFooter />
    </div>
  )
}

