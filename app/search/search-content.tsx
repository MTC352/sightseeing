"use client"

import { useState, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { trips, categories } from "@/lib/data"
import type { Trip } from "@/lib/data"
import { useCart } from "@/lib/cart-context"
import { useIsGoodWeatherForTrip } from "@/lib/weather-context"
import {
  Star, Clock, MapPin, SlidersHorizontal, CalendarDays, X,
  ChevronRight, Sparkles, Check, Plus, Sun, LayoutGrid, List,
} from "lucide-react"
import { DateTimeModal } from "@/components/date-time-modal"

/* ── re-use the same filter/modal types as explore ── */
interface Filters {
  priceMin: number
  priceMax: number
  ratingMin: number
  durationMax: number
  persons: number
  locationAddress: string
  locationRadius: number
  dateFrom: string
  dateTo: string
  timeFrom: string
  timeTo: string
}
const DEFAULT_FILTERS: Filters = {
  priceMin: 0, priceMax: 500, ratingMin: 0, durationMax: 24, persons: 1,
  locationAddress: "", locationRadius: 10, dateFrom: "", dateTo: "", timeFrom: "", timeTo: "",
}

/* ── Timeslot types + dummy data (mirrors explore-client) ── */
interface Timeslot { time: string; spotsLeft: number; spotsTotal: number }
interface TripDepartures { today: Timeslot[]; tomorrow: Timeslot[] }

function getDummyDepartures(tripId: string): TripDepartures {
  const hash = tripId.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  const times = ["09:00", "10:30", "11:00", "13:00", "14:30", "15:00", "16:30", "18:00", "19:30"]
  const pickSlots = (seed: number, count: number): Timeslot[] => {
    const slots: Timeslot[] = []
    for (let i = 0; i < count; i++) {
      const idx = (seed + i * 3) % times.length
      const total = 10 + ((seed + i) % 15)
      const booked = Math.floor(total * (0.2 + ((seed * i) % 80) / 100))
      slots.push({ time: times[idx], spotsLeft: Math.max(0, total - booked), spotsTotal: total })
    }
    return slots.sort((a, b) => a.time.localeCompare(b.time))
  }
  return {
    today: pickSlots(hash, 1 + (hash % 4)),
    tomorrow: pickSlots(hash + 7, 1 + ((hash + 2) % 5)),
  }
}

/* ── Filter modal (slim inline version) ── */
function FilterModal({ open, onClose, filters, onChange }: {
  open: boolean; onClose: () => void
  filters: Filters; onChange: (f: Filters) => void
}) {
  const [local, setLocal] = useState<Filters>(filters)
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
          <button type="button" onClick={() => onChange(local)}
            className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Apply</button>
        </div>
      </div>
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
      <span className="text-[11px]">{slot.spotsLeft === 0 ? "Sold out" : `${slot.spotsLeft} left`}</span>
    </div>
  )
}

/* ── Grid card ── */
function SearchCard({ trip, priority = false }: { trip: Trip; priority?: boolean }) {
  const { addItem, isInCart } = useCart()
  const inCart = isInCart(trip.id)
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

/* ── List card ── */
function SearchListCard({ trip, priority = false }: { trip: Trip; priority?: boolean }) {
  const { addItem, isInCart } = useCart()
  const inCart = isInCart(trip.id)
  const goodWeather = useIsGoodWeatherForTrip(trip.category)
  const departures = getDummyDepartures(trip.id)
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
              <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /><span className="font-semibold text-foreground">{trip.rating}</span><span>({trip.reviewCount.toLocaleString()})</span></span>
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
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Available Timeslots</p>
          <div className="flex flex-col gap-3">
            {departures.today.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-xs font-semibold text-foreground">Today</span>
                <div className="flex flex-wrap gap-2">{departures.today.map((s, i) => <TimeslotChip key={i} slot={s} />)}</div>
              </div>
            )}
            {departures.tomorrow.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-xs font-semibold text-foreground">Tomorrow</span>
                <div className="flex flex-wrap gap-2">{departures.tomorrow.map((s, i) => <TimeslotChip key={i} slot={s} />)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main component ── */
export function SearchContent() {
  const searchParams = useSearchParams()
  const query = searchParams.get("q") || ""

  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")

  const activeFilterCount = [
    activeFilters.priceMin > 0 || activeFilters.priceMax < 500,
    activeFilters.ratingMin > 0,
    activeFilters.durationMax < 24,
    activeFilters.persons > 1,
    activeFilters.locationAddress !== "",
    activeFilters.dateFrom !== "" || activeFilters.dateTo !== "",
  ].filter(Boolean).length

  const hasDate = activeFilters.dateFrom !== "" || activeFilters.timeFrom !== ""
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

  // Keyword filter on the full catalog, then apply UI filters on top
  const keywordMatched = useMemo(() => {
    if (!query.trim()) return trips
    const kws = query.toLowerCase().split(/\s+/).filter(Boolean)
    return trips.filter((t) => {
      const hay = [t.title, t.category, t.city ?? "", t.description ?? "", t.provider ?? "", ...(t.tags ?? [])].join(" ").toLowerCase()
      return kws.every((kw) => hay.includes(kw))
    })
  }, [query])

  const filtered = keywordMatched.filter((t) => {
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

  return (
    <div className="min-h-screen bg-background font-sans">
      <Navbar />

      <FilterModal
        open={filtersOpen} onClose={() => setFiltersOpen(false)}
        filters={activeFilters} onChange={(f) => { setActiveFilters(f); setFiltersOpen(false) }}
      />
      <DateTimeModal
        open={dateOpen}
        onClose={() => setDateOpen(false)}
        value={{ date: activeFilters.dateFrom, timeFrom: activeFilters.timeFrom, timeTo: activeFilters.timeTo }}
        onApply={(v) => setActiveFilters((prev) => ({ ...prev, dateFrom: v.date, timeFrom: v.timeFrom, timeTo: v.timeTo }))}
      />

      {/* ── Sticky filter bar (mirrors explore page exactly) ── */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="flex items-center py-2.5">
            {/* Filters + Dates pills */}
            <div className="flex shrink-0 items-center gap-2 pr-2">
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
              <button type="button" onClick={() => setDateOpen(true)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  hasDate ? "bg-foreground text-background" : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}>
                <CalendarDays className="h-3.5 w-3.5" />
                {datePillLabel}
                {hasDate && (
                  <span role="button" tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setActiveFilters((p) => ({ ...p, dateFrom: "", dateTo: "", timeFrom: "", timeTo: "" })) }}
                    onKeyDown={(e) => e.key === "Enter" && setActiveFilters((p) => ({ ...p, dateFrom: "", dateTo: "", timeFrom: "", timeTo: "" }))}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-background/20" aria-label="Clear dates">
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
              <div className="h-5 w-px bg-border" />
            </div>
            {/* Scrollable category pills */}
            <div className="flex flex-1 gap-2 overflow-x-auto scrollbar-none">
              {categories.map((c) => {
                const isActive = activeCategory === c.name
                return (
                  <button type="button" key={c.name}
                    onClick={() => setActiveCategory(isActive ? null : c.name)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      isActive ? "bg-foreground text-background" : "bg-secondary text-foreground hover:bg-secondary/80"
                    }`}>
                    {c.name}
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
        {/* Results header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            {query && (
              <p className="mb-0.5 text-xs text-muted-foreground">
                Search results for <span className="font-semibold text-foreground">&quot;{query}&quot;</span>
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{filtered.length}</span> experience{filtered.length !== 1 ? "s" : ""}
              {activeCategory ? ` in ${activeCategory}` : " in Luxembourg"}
            </p>
          </div>
          {/* Grid / List toggle */}
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

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-semibold text-foreground">No experiences found{query ? ` for "${query}"` : ""}</p>
            <p className="text-sm text-muted-foreground">Try different keywords or adjust your filters.</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((t, i) => <SearchCard key={t.id} trip={t} priority={i < 8} />)}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((t, i) => <SearchListCard key={t.id} trip={t} priority={i < 4} />)}
          </div>
        )}
      </div>

      <SiteFooter />
    </div>
  )
}
