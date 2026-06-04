"use client"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { categories } from "@/lib/data"
import { Star, Clock, ChevronDown, ChevronUp, MapPin, Utensils, Bike, Landmark, Map, Users, Wine, Sparkles, Heart, SlidersHorizontal, X, ChevronRight, CalendarDays, ChevronLeft, Search, Check, Plus, Sun, LayoutGrid, List } from "lucide-react"
import type { Trip } from "@/lib/data"
import { useCart } from "@/lib/cart-context"
import { useIsGoodWeatherForTrip } from "@/lib/weather-context"
import { DateTimeModal } from "@/components/date-time-modal"

/* ── Filter types ── */
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
  locationAddress: "", locationRadius: 10,
  dateFrom: "", dateTo: "", timeFrom: "", timeTo: "",
}

const RADIUS_OPTIONS = [1, 2, 5, 10, 20, 50]

/* ── Timeslot / Departure data ── */
interface Timeslot {
  time: string
  spotsLeft: number
  spotsTotal: number
}
interface TripDepartures {
  today: Timeslot[]
  tomorrow: Timeslot[]
}

// Generate dummy departures for any trip
function getDummyDepartures(tripId: string): TripDepartures {
  // Use tripId hash to create consistent but varied data per trip
  const hash = tripId.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  const times = ["09:00", "10:30", "11:00", "13:00", "14:30", "15:00", "16:30", "18:00", "19:30"]
  
  const pickSlots = (seed: number, count: number): Timeslot[] => {
    const slots: Timeslot[] = []
    for (let i = 0; i < count; i++) {
      const idx = (seed + i * 3) % times.length
      const total = 10 + ((seed + i) % 15) // 10-24 spots
      const booked = Math.floor(total * (0.2 + ((seed * i) % 80) / 100)) // 20-100% booked
      slots.push({ time: times[idx], spotsLeft: Math.max(0, total - booked), spotsTotal: total })
    }
    return slots.sort((a, b) => a.time.localeCompare(b.time))
  }

  const todayCount = 1 + (hash % 4) // 1-4 slots today
  const tomorrowCount = 1 + ((hash + 2) % 5) // 1-5 slots tomorrow

  return {
    today: pickSlots(hash, todayCount),
    tomorrow: pickSlots(hash + 7, tomorrowCount),
  }
}

/* ── Shared modal shell ── */


function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-background shadow-2xl">
        {children}
      </div>
    </div>
  )
}

/* ── Filters Modal ── */
function FilterModal({ open, onClose, filters, onChange }: {
  open: boolean
  onClose: () => void
  filters: Filters
  onChange: (f: Filters) => void
}) {
  const [local, setLocal] = useState<Filters>(filters)
  if (!open) return null

  const set = (patch: Partial<Filters>) => setLocal((prev) => ({ ...prev, ...patch }))

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-base font-bold text-foreground">Filters</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setLocal(DEFAULT_FILTERS); onChange(DEFAULT_FILTERS) }}
            className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            Clear all
          </button>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-secondary transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-h-[70vh] overflow-y-auto divide-y divide-border px-5">

        {/* Location — address + radius */}
        <div className="py-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Location</p>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Enter an address or area..."
              value={local.locationAddress}
              onChange={(e) => set({ locationAddress: e.target.value })}
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {local.locationAddress && (
              <button
                type="button"
                onClick={() => set({ locationAddress: "" })}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Search radius</p>
            <div className="flex gap-2 flex-wrap">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set({ locationRadius: r })}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all border ${
                    local.locationRadius === r
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {r} km
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Price range */}
        <div className="py-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Price range</p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">Min (€)</label>
              <input
                type="number" min={0} max={local.priceMax}
                value={local.priceMin}
                onChange={(e) => set({ priceMin: Number(e.target.value) })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <span className="mt-4 text-muted-foreground">—</span>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">Max (€)</label>
              <input
                type="number" min={local.priceMin} max={500}
                value={local.priceMax}
                onChange={(e) => set({ priceMax: Number(e.target.value) })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        </div>

        {/* Rating */}
        <div className="py-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Minimum rating</p>
          <div className="flex gap-2 flex-wrap">
            {[0, 3, 3.5, 4, 4.5, 5].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => set({ ratingMin: r })}
                className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  local.ratingMin === r ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {r === 0 ? "Any" : <><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{r}+</>}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="py-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Max duration</p>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 6, 8, 24].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => set({ durationMax: h })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  local.durationMax === h ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {h === 24 ? "Any" : `Up to ${h}h`}
              </button>
            ))}
          </div>
        </div>

        {/* Persons */}
        <div className="py-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Number of people</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => set({ persons: Math.max(1, local.persons - 1) })}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground hover:border-primary/40 transition-colors text-lg"
            >
              −
            </button>
            <span className="w-8 text-center text-base font-semibold text-foreground">{local.persons}</span>
            <button
              type="button"
              onClick={() => set({ persons: Math.min(20, local.persons + 1) })}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground hover:border-primary/40 transition-colors text-lg"
            >
              +
            </button>
            <span className="text-xs text-muted-foreground">{local.persons === 1 ? "1 person" : `${local.persons} people`}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-5 py-4">
        <button
          type="button"
          onClick={() => { onChange(local); onClose() }}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Show results
        </button>
      </div>
    </ModalShell>
  )
}

/* ── Category icon map ── */
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Food & Events": Utensils,
  "Sports & Nature": Bike,
  Culture: Landmark,
  Tours: Map,
  "Private Tours": Users,
  Dinnerhopping: Wine,
}

/* ── Compact Viator-style card ── */
function ExploreCard({ trip, priority = false }: { trip: Trip; priority?: boolean }) {
  const { addItem, isInCart } = useCart()
  const inCart = isInCart(trip.id)
  const goodWeather = useIsGoodWeatherForTrip(trip.category)

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
        <Link href={`/trip/${trip.slug ?? trip.id}`} className="absolute inset-0">
          <Image
            src={trip.image || "/placeholder.svg"}
            alt={trip.title}
            fill
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        </Link>
        {trip.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow">
            {trip.badge}
          </span>
        )}
        {trip.originalPrice && (
          <span className="absolute right-8 top-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
            -{Math.round((1 - trip.price / trip.originalPrice) * 100)}%
          </span>
        )}

        {/* Good for weather badge */}
        {goodWeather && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold text-amber-900 shadow backdrop-blur-sm">
            <Sun className="h-2.5 w-2.5" />
            Good for today
          </span>
        )}
        {/* Add to Triplist — shown on hover, always visible when in cart */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); addItem(trip) }}
          disabled={inCart}
          className={`absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-md backdrop-blur-sm transition-all duration-200 ${
            inCart
              ? "bg-primary text-primary-foreground opacity-100"
              : "bg-background/90 text-foreground opacity-0 group-hover:opacity-100 hover:bg-background"
          }`}
        >
          {inCart
            ? <><Check className="h-3 w-3" /> Added</>
            : <><Plus className="h-3 w-3" /> Add to Triplist</>
          }
        </button>
      </div>
      <Link href={`/trip/${trip.slug ?? trip.id}`} className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{trip.category}</p>
        <p className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors leading-snug">{trip.title}</p>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
          <span className="font-semibold text-foreground">{trip.rating}</span>
          <span>({trip.reviewCount.toLocaleString()})</span>
          <span className="mx-1">·</span>
          <Clock className="h-3 w-3 shrink-0" />
          <span>{trip.duration}</span>
        </div>
        <p className="mt-0.5 text-sm font-bold text-foreground">
          From <span className="text-primary">{trip.price.toFixed(2)} €</span>
          {trip.originalPrice && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">{trip.originalPrice.toFixed(2)} €</span>
          )}
        </p>
      </Link>
    </div>
  )
}

/* ── Timeslot chip component ── */
function TimeslotChip({ slot }: { slot: Timeslot }) {
  const pct = slot.spotsLeft / slot.spotsTotal
  // Color coding: green = plenty, amber = limited, red = almost full/sold out
  const colorClass = slot.spotsLeft === 0
    ? "bg-red-50 border-red-200 text-red-700"
    : pct <= 0.2
    ? "bg-amber-50 border-amber-200 text-amber-700"
    : "bg-emerald-50 border-emerald-200 text-emerald-700"
  
  const dotColor = slot.spotsLeft === 0
    ? "bg-red-500"
    : pct <= 0.2
    ? "bg-amber-500"
    : "bg-emerald-500"

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${colorClass}`}>
      <span className="font-semibold">{slot.time}</span>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className="text-[11px]">
        {slot.spotsLeft === 0 ? "Sold out" : `${slot.spotsLeft} left`}
      </span>
    </div>
  )
}

/* ── Trip List Card (list view) ── */
function TripListCard({ trip, priority = false }: { trip: Trip; priority?: boolean }) {
  const { addItem, isInCart } = useCart()
  const inCart = isInCart(trip.id)
  const goodWeather = useIsGoodWeatherForTrip(trip.category)
  const departures = getDummyDepartures(trip.id)

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md sm:flex-row">
      {/* Image */}
      <div className="relative aspect-[16/10] sm:aspect-auto sm:w-56 lg:w-64 shrink-0">
        <Link href={`/trip/${trip.slug ?? trip.id}`} className="absolute inset-0">
          <Image
            src={trip.image || "/placeholder.svg"}
            alt={trip.title}
            fill
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, 256px"
          />
        </Link>
        {trip.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow">
            {trip.badge}
          </span>
        )}
        {goodWeather && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold text-amber-900 shadow backdrop-blur-sm">
            <Sun className="h-2.5 w-2.5" />
            Good for today
          </span>
        )}
        {/* Add to Triplist */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); addItem(trip) }}
          disabled={inCart}
          className={`absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-md backdrop-blur-sm transition-all duration-200 ${
            inCart
              ? "bg-primary text-primary-foreground opacity-100"
              : "bg-background/90 text-foreground opacity-0 group-hover:opacity-100 hover:bg-background"
          }`}
        >
          {inCart
            ? <><Check className="h-3 w-3" /> Added</>
            : <><Plus className="h-3 w-3" /> Add to Triplist</>
          }
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Trip details row */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{trip.category}</p>
            <Link href={`/trip/${trip.slug ?? trip.id}`}>
              <h3 className="mt-0.5 text-base font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">{trip.title}</h3>
            </Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-foreground">{trip.rating}</span>
                <span>({trip.reviewCount.toLocaleString()})</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {trip.duration}
              </span>
              {trip.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {trip.city}
                </span>
              )}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-lg font-bold text-foreground">
              {trip.price.toFixed(2)} <span className="text-sm font-medium">€</span>
            </p>
            {trip.originalPrice && (
              <p className="text-xs text-muted-foreground line-through">{trip.originalPrice.toFixed(2)} €</p>
            )}
            <p className="text-[10px] text-muted-foreground">per person</p>
          </div>
        </div>

        {/* Departures / Timeslots section */}
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Available Timeslots</p>
          <div className="flex flex-col gap-3">
            {/* Today */}
            {departures.today.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-xs font-semibold text-foreground">Today</span>
                <div className="flex flex-wrap gap-2">
                  {departures.today.slice(0, 4).map((slot, i) => (
                    <TimeslotChip key={`today-${i}`} slot={slot} />
                  ))}
                  {departures.today.length > 4 && (
                    <Link
                      href={`/trip/${trip.slug ?? trip.id}#calendar`}
                      className="flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      +{departures.today.length - 4} more
                    </Link>
                  )}
                </div>
              </div>
            )}
            {/* Tomorrow */}
            {departures.tomorrow.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-xs font-semibold text-foreground">Tomorrow</span>
                <div className="flex flex-wrap gap-2">
                  {departures.tomorrow.slice(0, 4).map((slot, i) => (
                    <TimeslotChip key={`tomorrow-${i}`} slot={slot} />
                  ))}
                  {departures.tomorrow.length > 4 && (
                    <Link
                      href={`/trip/${trip.slug ?? trip.id}#calendar`}
                      className="flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      +{departures.tomorrow.length - 4} more
                    </Link>
                  )}
                </div>
              </div>
            )}
            {departures.today.length === 0 && departures.tomorrow.length === 0 && (
              <p className="text-xs text-muted-foreground">No timeslots available for the next 2 days</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── FAQ Item ── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-semibold text-foreground hover:text-primary transition-colors"
      >
        {q}
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>}
    </div>
  )
}

const FAQS = [
  { q: "What are the best things to do in Luxembourg?", a: "Luxembourg offers an incredible range of experiences — from exploring the UNESCO-listed Old Town and the Bock Casemates to tasting wines along the Moselle Valley, cycling through the Mullerthal 'Little Switzerland' region, or joining one of our famous Dinner Hopping evenings aboard a retro American School Bus." },
  { q: "What are the top tours to book in Luxembourg?", a: "The most popular tours are the Guided E-Bike Tour of Luxembourg City, the Nature and Castles 8-Hour Day Tour visiting Vianden and Beaufort, the City Train Old Town ride, and the Dinner Hopping Bus experiences. All can be booked directly on sightseeing.lu." },
  { q: "What are the best day trips from Luxembourg City?", a: "Top day trips include Vianden Castle, Echternach and the Mullerthal Trail, the Moselle wine villages of Grevenmacher and Remich, the Ardennes around Clervaux, and the cross-border experience to Trier (Germany) or Metz (France)." },
  { q: "What are the best outdoor activities in Luxembourg?", a: "Luxembourg is perfect for hiking, cycling, and e-biking. The Mullerthal Trail offers stunning rocky landscapes, the Our Valley is ideal for kayaking, and the national cycling network (Vëlorouten) connects cities and wine regions. Climbing at Echternach is great for families." },
  { q: "When is the best time to visit Luxembourg?", a: "Luxembourg is beautiful year-round. Spring (April–May) and autumn (September–October) offer mild weather and fewer crowds. Summer is peak season with outdoor concerts and festivals. Winter brings charming Christmas markets in Luxembourg City and Echternach." },
  { q: "What are the best indoor activities in Luxembourg for rainy days?", a: "On rainy days, visit the National Museum of History and Art (MNHA), the Mudam contemporary art museum, the underground Bock Casemates, the Slate Mine at Haut-Martelange, or enjoy a wine tasting in Grevenmacher." },
  { q: "Is Luxembourg easy to explore without a car?", a: "Yes — public transport in Luxembourg is entirely free, covering all buses, trains, and trams nationwide. Luxembourg City is compact and walkable. Most tours on sightseeing.lu include or offer public transport guidance to the meeting point." },
]

const TOP_SIGHTS = [
  { name: "Vianden Castle", image: "/images/trips/nature-castles-tour.jpg", desc: "A fairy-tale medieval fortress perched above the Our Valley." },
  { name: "Bock Casemates", image: "/images/trips/city-train.jpg", desc: "Underground fortifications carved into the sandstone cliffs." },
  { name: "Moselle Valley", image: "/images/trips/wine-tasting-grevenmacher.jpg", desc: "Luxembourg's wine country with award-winning Crémant and Riesling." },
  { name: "Mullerthal Region", image: "/images/trips/e-bike-nature.jpg", desc: "Known as 'Little Switzerland' — rocky trails and fairy-tale streams." },
  { name: "Old Town Luxembourg", image: "/images/trips/e-bike-tour.jpg", desc: "A UNESCO World Heritage Site with panoramic Alzette valley views." },
  { name: "Clervaux", image: "/images/trips/nature-castles-tour.jpg", desc: "Home to the famous Family of Man photography exhibition and a Benedictine abbey." },
]

const GUIDES = [
  { title: "5 incredible experiences to enjoy in Luxembourg in 2025", img: "/images/trips/e-bike-tour.jpg", tag: "Travel Guide" },
  { title: "How to spend the perfect weekend in Luxembourg City", img: "/images/trips/city-train.jpg", tag: "Weekend Break" },
  { title: "The best wine experiences along the Moselle Valley", img: "/images/trips/wine-tasting-grevenmacher.jpg", tag: "Food & Drink" },
  { title: "Luxembourg with kids: the top family-friendly activities", img: "/images/trips/climbing-echternach.jpg", tag: "Family Travel" },
]

const INSIDER_TIPS = [
  { heading: "Getting around", tip: "Public transport is free in Luxembourg — buses, trains, and trams all included. Use the 'mobiliteit.lu' app to plan journeys." },
  { heading: "When to book", tip: "Book popular experiences like Dinner Hopping and guided e-bike tours at least 48 hours in advance, especially on weekends." },
  { heading: "Currency & payments", tip: "Luxembourg uses the Euro. Credit cards are widely accepted everywhere, but small vendors may prefer cash." },
  { heading: "Language", tip: "Luxembourgish is the national language, but French, German, and English are all widely spoken and understood." },
  { heading: "Free museums", tip: "Many national museums are free on the first Sunday of the month. Check individual museum websites for current opening hours." },
  { heading: "Best photo spots", tip: "The Chemin de la Corniche (the 'most beautiful balcony in Europe') offers the best panoramic views over the Old Town and Alzette valley." },
]

/* ── Main component ── */
export default function ExplorePage({ initialTrips }: { initialTrips?: Trip[] }) {
  // Fail-closed: server always passes DB-backed publicOnly trips. Never fall
  // back to the static seed catalog (would resurface archived/draft trips).
  const tripList: Trip[] = initialTrips ?? []
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

  const filtered = tripList.filter((t) => {
    if (activeCategory && t.category !== activeCategory) return false
    if (t.price < activeFilters.priceMin || t.price > activeFilters.priceMax) return false
    if (t.rating < activeFilters.ratingMin) return false
    if (activeFilters.locationAddress && !t.title.toLowerCase().includes(activeFilters.locationAddress.toLowerCase()) &&
        !t.category.toLowerCase().includes(activeFilters.locationAddress.toLowerCase())) return false
    const dHours = parseFloat(t.duration?.replace(/[^\d.]/g, "") || "99")
    if (activeFilters.durationMax < 24 && dHours > activeFilters.durationMax) return false
    return true
  })

  const topRated = tripList.filter((t) => t.rating >= 4.7).slice(0, 8)
  const byCategory = categories.map((c) => ({
    ...c,
    trips: tripList.filter((t) => t.category === c.name).slice(0, 4),
  }))

  return (
    <div className="min-h-screen bg-background font-sans">
      <Navbar />

      <FilterModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={activeFilters}
        onChange={(f) => { setActiveFilters(f); setFiltersOpen(false) }}
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

            {/* Left: Filters + Dates — always visible, never scroll away */}
            <div className="flex shrink-0 items-center gap-2 pr-2">
              {/* Filters pill */}
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  activeFilterCount > 0
                    ? "bg-foreground text-background"
                    : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Dates pill */}
              <button
                type="button"
                onClick={() => setDateOpen(true)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  hasDate
                    ? "bg-foreground text-background"
                    : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {datePillLabel}
                {hasDate && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setActiveFilters(prev => ({ ...prev, dateFrom: "", dateTo: "", timeFrom: "", timeTo: "" })) }}
                    onKeyDown={(e) => e.key === "Enter" && setActiveFilters(prev => ({ ...prev, dateFrom: "", dateTo: "", timeFrom: "", timeTo: "" }))}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-background/20"
                    aria-label="Clear dates"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>

              {/* Divider */}
              <div className="h-5 w-px bg-border" />
            </div>

            {/* Center: scrollable category pills */}
            <div className="flex flex-1 gap-2 overflow-x-auto scrollbar-none">
              {categories.map((c) => {
                const isActive = activeCategory === c.name
                return (
                  <button
                    type="button"
                    key={c.name}
                    onClick={() => setActiveCategory(isActive ? null : c.name)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-foreground text-background"
                        : "bg-secondary text-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {c.name}
                  </button>
                )
              })}
            </div>

            {/* Right: chevron overflow indicator */}
            <div className="shrink-0 pl-1">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Main results ── */}
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{filtered.length}</span> experiences
            {activeCategory ? ` in ${activeCategory}` : " in Luxembourg"}
          </p>
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-semibold text-foreground">No experiences in this category yet</p>
            <button type="button" onClick={() => setActiveCategory(null)} className="text-sm text-primary underline">
              View all experiences
            </button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((t, i) => (
              <ExploreCard key={t.id} trip={t} priority={i < 8} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((t, i) => (
              <TripListCard key={t.id} trip={t} priority={i < 4} />
            ))}
          </div>
        )}
      </div>

      {/* ── SEO Content ── */}
      <div className="mx-auto max-w-7xl px-4 pb-16 lg:px-8">

        {/* Top sights */}
        <section className="border-t border-border pt-12">
          <h2 className="text-xl font-bold text-foreground">Top sights in Luxembourg</h2>
          <p className="mt-1 text-sm text-muted-foreground">The unmissable landmarks every visitor should explore.</p>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {TOP_SIGHTS.map((s) => (
              <div key={s.name} className="group flex flex-col items-center gap-2 text-center">
                <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-border group-hover:border-primary transition-colors">
                  <Image src={s.image} alt={s.name} fill className="object-cover" sizes="80px" />
                </div>
                <p className="text-xs font-semibold text-foreground">{s.name}</p>
                <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Travel guides */}
        <section className="border-t border-border pt-12 mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Essential Luxembourg travel guides</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Expert tips and curated itineraries from our local team.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {GUIDES.map((g) => (
              <div key={g.title} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card hover:border-primary/30 transition-colors cursor-pointer">
                <div className="relative aspect-[16/9] overflow-hidden">
                  <Image src={g.img} alt={g.title} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="(max-width: 640px) 100vw, 25vw" />
                  <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold text-foreground backdrop-blur-sm">{g.tag}</span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">{g.title}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Our most recommended */}
        <section className="border-t border-border pt-12 mt-12">
          <h2 className="text-xl font-bold text-foreground">Our most recommended things to do in Luxembourg</h2>
          <p className="mt-1 text-sm text-muted-foreground">Top-rated by travellers — these experiences consistently earn 5-star reviews.</p>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {topRated.map((t, i) => (
              <ExploreCard key={t.id} trip={t} priority={i < 4} />
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-border pt-12 mt-12">
          <h2 className="text-xl font-bold text-foreground">Frequently asked questions about Luxembourg</h2>
          <div className="mt-4 max-w-3xl">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </section>

        {/* Insider tips */}
        <section className="border-t border-border pt-12 mt-12">
          <h2 className="text-xl font-bold text-foreground">Insider tips: Planning a trip to Luxembourg</h2>
          <p className="mt-1 text-sm text-muted-foreground">Local knowledge to help you make the most of your visit.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INSIDER_TIPS.map((tip) => (
              <div key={tip.heading} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-bold text-foreground">{tip.heading}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{tip.tip}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Category sub-grids */}
        {byCategory.filter((c) => c.trips.length > 0).map((c) => (
          <section key={c.name} className="border-t border-border pt-10 mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{c.name} in Luxembourg</h2>
              <button
                type="button"
                onClick={() => { setActiveCategory(c.name); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                className="text-sm font-medium text-primary hover:underline"
              >
                See all {c.count}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {c.trips.map((t) => (
                <ExploreCard key={t.id} trip={t} />
              ))}
            </div>
          </section>
        ))}

        {/* What people say */}
        <section className="border-t border-border pt-12 mt-12">
          <h2 className="text-xl font-bold text-foreground">What travellers are saying about Luxembourg</h2>
          <p className="mt-1 text-sm text-muted-foreground">Real reviews from visitors who booked through sightseeing.lu.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              { name: "Sophie M.", rating: 5, text: "An absolutely magical experience! Our guide was incredibly knowledgeable and made the whole tour feel personal.", tour: "Guided E-Bike Tour" },
              { name: "Thomas K.", rating: 5, text: "One of the highlights of our Luxembourg trip. Perfect organisation, small group, and the local insights were priceless.", tour: "Nature and Castles Day Tour" },
              { name: "Lucia B.", rating: 5, text: "Superbe expérience — guide passionné et très professionnel. Je recommande vivement à tous ceux qui visitent le Luxembourg.", tour: "Dinner Hopping Bus" },
            ].map((r) => (
              <div key={r.name} className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5">
                <div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`} />
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-foreground">{r.text}</p>
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs font-bold text-foreground">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground">{r.tour}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Location links */}
        <section className="border-t border-border pt-12 mt-12">
          <h2 className="text-xl font-bold text-foreground">Explore by location</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {["Luxembourg City", "Grevenmacher", "Echternach", "Vianden", "Clervaux", "Remich", "Moselle Valley", "Mullerthal", "Esch-sur-Alzette", "Mersch"].map((city) => (
              <div key={city} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {city}
              </div>
            ))}
          </div>
        </section>

      </div>

      <SiteFooter />
    </div>
  )
}
