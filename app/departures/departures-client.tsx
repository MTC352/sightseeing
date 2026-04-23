"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { trips } from "@/lib/data"
import {
  MapPin, Clock, Calendar, ArrowRight, Users, ChevronRight,
  Search, X, ChevronDown, SlidersHorizontal,
} from "lucide-react"

const DEPARTURE_TIMES: Record<string, { time: string; date: string; spots: number }> = {
  "31898": { time: "09:30", date: "Today", spots: 4 },
  "31876": { time: "10:00", date: "Today", spots: 8 },
  "31862": { time: "14:00", date: "Today", spots: 12 },
  "31855": { time: "09:00", date: "Tomorrow", spots: 2 },
  "31860": { time: "11:00", date: "Tomorrow", spots: 6 },
  "31861": { time: "15:00", date: "Tomorrow", spots: 3 },
  "31864": { time: "09:30", date: "Sat, 21 Mar", spots: 10 },
  "31865": { time: "10:30", date: "Sat, 21 Mar", spots: 5 },
  "31669": { time: "13:00", date: "Sun, 22 Mar", spots: 9 },
  "31318": { time: "09:00", date: "Sat, 21 Mar", spots: 6 },
  "31464": { time: "14:00", date: "Sun, 22 Mar", spots: 14 },
  "31532": { time: "10:00", date: "Fri, 28 Mar", spots: 30 },
}

function groupByCity(tripList: typeof trips) {
  const map: Record<string, typeof trips> = {}
  for (const trip of tripList) {
    const city = trip.city ?? "Luxembourg City"
    if (!map[city]) map[city] = []
    map[city].push(trip)
  }
  return Object.entries(map).sort((a, b) => b[1].length - a[1].length)
}

function cityStats(cityTrips: typeof trips) {
  const withDeparture = cityTrips.filter((t) => DEPARTURE_TIMES[t.id])
  const soonest =
    withDeparture.find((t) => DEPARTURE_TIMES[t.id]?.date === "Today") ??
    withDeparture.find((t) => DEPARTURE_TIMES[t.id]?.date === "Tomorrow") ??
    withDeparture[0]
  const minPrice = Math.min(...cityTrips.map((t) => t.price).filter((p) => p > 0))
  return { soonest, minPrice }
}

/* ── Product selector dropdown ─────────────────────────────────── */
function ProductSelector({
  selected,
  onSelect,
}: {
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () =>
      trips.filter((t) =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.city ?? "").toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  )

  const selectedTrip = trips.find((t) => t.id === selected)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <div ref={ref} className="relative w-full sm:w-96">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 truncate text-left text-foreground">
          {selectedTrip ? selectedTrip.title : "Filter by product…"}
        </span>
        {selected ? (
          <span
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelect(null)}
            onClick={(e) => { e.stopPropagation(); onSelect(null); setSearch("") }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear filter"
          >
            <X className="h-4 w-4" />
          </span>
        ) : (
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {/* Search field */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* All / clear option */}
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); setSearch("") }}
            className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-secondary ${!selected ? "text-primary font-medium" : "text-muted-foreground"}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />
            All departure locations
          </button>

          {/* Product list */}
          <ul className="max-h-64 overflow-y-auto" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">No products found.</li>
            ) : (
              filtered.map((t) => (
                <li key={t.id} role="option" aria-selected={selected === t.id}>
                  <button
                    type="button"
                    onClick={() => { onSelect(t.id); setOpen(false); setSearch("") }}
                    className={`flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-secondary ${selected === t.id ? "bg-primary/5 text-primary" : "text-foreground"}`}
                  >
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] font-semibold text-muted-foreground">
                      {t.city?.slice(0, 1) ?? "L"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-snug">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.city ?? "Luxembourg City"}</p>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ── Main component ────────────────────────────────────────────── */
export function DeparturesClient() {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

  const grouped = useMemo(() => {
    if (!selectedProductId) return groupByCity(trips)
    const product = trips.find((t) => t.id === selectedProductId)
    if (!product) return groupByCity(trips)
    const city = product.city ?? "Luxembourg City"
    // Show only the city that matches this product
    return [[city, trips.filter((t) => (t.city ?? "Luxembourg City") === city)]] as [string, typeof trips][]
  }, [selectedProductId])

  const selectedTrip = trips.find((t) => t.id === selectedProductId)

  return (
    <>
      {/* Hero */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <MapPin className="h-4 w-4" />
            Departure locations
          </div>
          <h1 className="mt-2 text-3xl font-bold text-foreground lg:text-4xl">
            Find experiences by location
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Choose your departure point and discover what is available near you. All experiences include free Luxembourg public transport to the start point.
          </p>

          {/* Stats chips */}
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              {trips.length} experiences
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {groupByCity(trips).length} departure cities
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Departures today &amp; tomorrow
            </span>
          </div>

          {/* Product filter with contextual question */}
          <div className="mt-6 rounded-2xl border border-border bg-background px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Find your departure</p>
            <p className="mt-1 text-base font-semibold text-foreground">What trip did you book?</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Select your experience to see the exact departure location.
            </p>
            <div className="mt-3">
              <ProductSelector selected={selectedProductId} onSelect={setSelectedProductId} />
            </div>
          </div>
        </div>
      </section>

      {/* Active filter banner */}
      {selectedTrip && (
        <div className="border-b border-primary/20 bg-primary/5">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 lg:px-8">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <MapPin className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Showing departure location for:{" "}
                <span className="text-primary">{selectedTrip.title}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Departs from <strong>{selectedTrip.city ?? "Luxembourg City"}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProductId(null)}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        </div>
      )}

      {/* Location grid */}
      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
        {grouped.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">No departure locations found.</div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {grouped.map(([city, cityTrips]) => {
              const { soonest, minPrice } = cityStats(cityTrips)
              const nextDep = soonest ? DEPARTURE_TIMES[soonest.id] : null
              const coverImage = cityTrips[0].image

              return (
                <Link
                  key={city}
                  href={`/search?q=${encodeURIComponent(city)}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
                >
                  <div className="relative h-44 w-full overflow-hidden">
                    <Image
                      src={coverImage}
                      alt={city}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-foreground/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-white/90" />
                        <h2 className="text-base font-bold text-white">{city}</h2>
                      </div>
                      <p className="mt-0.5 text-xs text-white/70">
                        {cityTrips.length} {cityTrips.length === 1 ? "experience" : "experiences"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 p-4">
                    {nextDep ? (
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground">Next departure</p>
                          <p className="truncate text-xs font-semibold text-foreground">
                            {nextDep.date} at {nextDep.time}
                          </p>
                        </div>
                        {nextDep.spots <= 4 && (
                          <span className="ml-auto shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                            {nextDep.spots} left
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <p className="text-xs text-muted-foreground">Check availability</p>
                      </div>
                    )}

                    {/* Highlight the selected product in this city if filtered */}
                    {selectedProductId && cityTrips.some((t) => t.id === selectedProductId) ? (
                      <div className="flex flex-col gap-1">
                        {cityTrips.map((t) => (
                          <div
                            key={t.id}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${t.id === selectedProductId ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground"}`}
                          >
                            <span className={`h-1 w-1 shrink-0 rounded-full ${t.id === selectedProductId ? "bg-primary" : "bg-primary/30"}`} />
                            <span className="truncate">{t.title}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {cityTrips.slice(0, 3).map((t) => (
                          <div key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="h-1 w-1 shrink-0 rounded-full bg-primary/40" />
                            <span className="truncate">{t.title}</span>
                          </div>
                        ))}
                        {cityTrips.length > 3 && (
                          <p className="pl-3 text-xs text-primary">+{cityTrips.length - 3} more</p>
                        )}
                      </div>
                    )}

                    <div className="mt-auto flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">
                        From{" "}
                        <span className="font-semibold text-foreground">
                          {minPrice === Infinity ? "Free" : `${minPrice} €`}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-xs font-medium text-primary transition-colors group-hover:text-primary/80">
                        View all
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <div className="mt-12 text-center">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Browse all experiences
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  )
}
