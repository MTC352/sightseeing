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
  Users, Minus, CalendarClock,
} from "lucide-react"
import { DateTimeModal } from "@/components/date-time-modal"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { AvTimeslot, AvSlotGroup, AvTripAvailability, AvailabilityMap } from "@/app/api/availability/route"
import {
  type SearchFiltersConfig,
  DEFAULT_SEARCH_FILTERS_CONFIG,
} from "@/lib/search-filters-config"
import { parseDurationHoursMin } from "@/lib/duration-parser"
import { haversineKm, parseGeocode, geocodeAddress } from "@/lib/geo-distance"

/** Extended trip shape used on the search page (includes Palisis-rich fields
 *  needed for the new location/tags/type filters). */
export interface SearchTrip extends Trip {
  tourType?: string
  tripTags?: string[]
  departureGeocode?: string
}

interface Filters {
  priceMin: number; priceMax: number; ratingMin: number; durationMax: number
  persons: number; locationAddress: string; locationRadius: number
  dateFrom: string; dateTo: string; timeFrom: string; timeTo: string
  tags: string[]; types: string[]
}
const DEFAULT_FILTERS: Filters = {
  priceMin: 0, priceMax: 500, ratingMin: 0, durationMax: 24, persons: 1,
  locationAddress: "", locationRadius: 10, dateFrom: "", dateTo: "", timeFrom: "", timeTo: "",
  tags: [], types: [],
}

const RADIUS_OPTIONS = [1, 2, 5, 10, 20, 50] as const
const RATING_OPTIONS = [0, 3, 3.5, 4, 4.5, 5] as const
const DURATION_OPTIONS = [1, 2, 3, 4, 6, 8, 24] as const // 24 = "Any"

/** Tags imported from Palisis include internal flags like `operator-direct-product`
 *  that aren't meaningful to end users. Hide them from the filter UI. */
const HIDDEN_TRIP_TAGS = new Set(["operator-direct-product"])
function isVisibleTripTag(t: string): boolean {
  return Boolean(t) && !HIDDEN_TRIP_TAGS.has(t.toLowerCase())
}

type Timeslot = AvTimeslot
type SlotGroup = AvSlotGroup
type TripAvailability = AvTripAvailability

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
  const today    = pickSlots(hash, 1 + (hash % 4))
  const tomorrow = pickSlots(hash + 7, 1 + ((hash + 2) % 5))
  return {
    today,
    tomorrow,
    todayGroups:    today.length    ? [{ name: "", slots: today    }] : [],
    tomorrowGroups: tomorrow.length ? [{ name: "", slots: tomorrow }] : [],
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

/* ── Filter modal ──────────────────────────────────────────────────
 * Widget visibility is controlled per-section by `config` (admin panel).
 * Apply/Reset commit changes upstream; live editing stays local until then. */
function FilterModal({
  open, onClose, filters, onChange, config, tagOptions, typeOptions,
}: {
  open: boolean
  onClose: () => void
  filters: Filters
  onChange: (f: Filters) => void
  config: SearchFiltersConfig
  tagOptions: string[]
  typeOptions: string[]
}) {
  const [local, setLocal] = useState<Filters>(filters)
  useEffect(() => { if (open) setLocal(filters) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setLocal((p) => ({ ...p, [k]: v }))

  const toggleArr = (key: "tags" | "types", value: string) =>
    setLocal((p) => ({
      ...p,
      [key]: p[key].includes(value) ? p[key].filter((v) => v !== value) : [...p[key], value],
    }))

  const pill = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-border bg-background text-foreground hover:bg-secondary"
    }`

  // At least one widget enabled?
  const anyEnabled =
    config.location || config.price || config.rating || config.duration ||
    config.tags || config.type

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">Filters</h2>
          <div className="flex items-center gap-2">
            <button type="button"
              onClick={() => { setLocal(DEFAULT_FILTERS); onChange(DEFAULT_FILTERS) }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground">
              Clear all
            </button>
            <button type="button" onClick={onClose}
              className="rounded-full p-1 hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
          {/* Location + Radius */}
          {config.location && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Location</label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={local.locationAddress}
                  onChange={(e) => set("locationAddress", e.target.value)}
                  placeholder="Enter an address or area…"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              {config.radius && (
                <>
                  <p className="mb-1.5 mt-3 text-xs text-muted-foreground">Search radius</p>
                  <div className="flex flex-wrap gap-2">
                    {RADIUS_OPTIONS.map((r) => (
                      <button key={r} type="button"
                        onClick={() => set("locationRadius", r)}
                        disabled={!local.locationAddress.trim()}
                        className={`${pill(local.locationRadius === r && !!local.locationAddress.trim())} disabled:cursor-not-allowed disabled:opacity-50`}>
                        {r} km
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Price */}
          {config.price && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Price range</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="mb-1 block text-[11px] text-muted-foreground">Min (€)</span>
                  <input type="number" min={0} max={5000} value={local.priceMin}
                    onChange={(e) => set("priceMin", Math.max(0, +e.target.value || 0))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-muted-foreground">Max (€)</span>
                  <input type="number" min={0} max={5000} value={local.priceMax}
                    onChange={(e) => set("priceMax", Math.max(0, +e.target.value || 0))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
          )}

          {/* Rating */}
          {config.rating && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Minimum rating</label>
              <div className="flex flex-wrap gap-2">
                {RATING_OPTIONS.map((r) => (
                  <button key={r} type="button"
                    onClick={() => set("ratingMin", r)}
                    className={pill(local.ratingMin === r)}>
                    {r === 0 ? "Any" : (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{r}+
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Max duration */}
          {config.duration && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">Max duration</label>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((h) => (
                  <button key={h} type="button"
                    onClick={() => set("durationMax", h)}
                    className={pill(local.durationMax === h)}>
                    {h >= 24 ? "Any" : `Up to ${h}h`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {config.tags && tagOptions.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Tags {local.tags.length > 0 && (
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    ({local.tags.length} selected)
                  </span>
                )}
              </label>
              <div className="flex flex-wrap gap-2">
                {tagOptions.map((tag) => (
                  <button key={tag} type="button"
                    onClick={() => toggleArr("tags", tag)}
                    className={pill(local.tags.includes(tag))}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tour Type */}
          {config.type && typeOptions.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Type {local.types.length > 0 && (
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    ({local.types.length} selected)
                  </span>
                )}
              </label>
              <div className="flex flex-wrap gap-2">
                {typeOptions.map((t) => (
                  <button key={t} type="button"
                    onClick={() => toggleArr("types", t)}
                    className={`${pill(local.types.includes(t))} max-w-full text-left`}>
                    <span className="line-clamp-1">{t}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!anyEnabled && (
            <p className="text-center text-sm text-muted-foreground">
              No filters are currently enabled. An administrator can enable them
              in Admin → Integrations → Settings → Trip Search Filters.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-5 py-4">
          <button type="button"
            onClick={() => { setLocal(DEFAULT_FILTERS); onChange(DEFAULT_FILTERS) }}
            className="flex-1 rounded-full border border-border py-2 text-sm font-medium text-foreground hover:bg-secondary">
            Reset
          </button>
          <button type="button" onClick={() => { onChange(local); onClose() }}
            className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Show results
          </button>
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

/* ── Full list-card skeleton (replaces real card while availability is loading) ── */
function SearchListCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card sm:flex-row">
      {/* image area */}
      <div className="aspect-[16/10] animate-pulse bg-muted sm:aspect-auto sm:w-56 lg:w-64 shrink-0" />
      {/* content area */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-14 animate-pulse rounded bg-muted" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="h-6 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3 w-14 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <TimeslotSkeleton rows={2} />
      </div>
    </div>
  )
}

/* ── Full grid-card skeleton ── */
function SearchCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="aspect-[4/3] animate-pulse bg-muted" />
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div className="h-3 w-14 animate-pulse rounded bg-muted" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="mt-auto h-4 w-24 animate-pulse rounded bg-muted pt-1" />
      </div>
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

/* ── Slot row: label + up-to-4 chips + overflow button ── */
function SlotRow({
  label, slots, persons, timeFrom, timeTo, onShowAll,
}: {
  label: string; slots: Timeslot[]; persons: number; timeFrom: string; timeTo: string
  onShowAll: () => void
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
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShowAll() }}
            className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            +{overflow} more <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

/* ── All-timeslots modal ── */
function AllSlotsModal({
  open, onClose, tripTitle, dayGroups, persons, timeFrom, timeTo,
}: {
  open: boolean
  onClose: () => void
  tripTitle: string
  /** One entry per day (Today / Tomorrow / a specific date label). */
  dayGroups: { label: string; groups: SlotGroup[] }[]
  persons: number
  timeFrom: string
  timeTo: string
}) {
  /* Does any day have >1 variant with a real name? */
  const multiCat = dayGroups.some(({ groups }) =>
    groups.filter((g) => g.name).length > 1
  )

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        className="flex flex-col sm:max-w-2xl p-0 gap-0 overflow-hidden"
        style={{ maxHeight: "min(85vh, 680px)" }}
        aria-describedby={undefined}
      >
        {/* Fixed header */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="h-4 w-4 text-primary shrink-0" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Available Timeslots
            </p>
          </div>
          <DialogTitle className="text-base leading-snug">{tripTitle}</DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          <div className="flex flex-col gap-7">
            {dayGroups.map(({ label, groups }) => {
              const eligibleGroups = groups
                .map((g) => ({
                  ...g,
                  slots: g.slots.filter(
                    (s) => slotFitsPersons(s, persons) && slotFitsTime(s, timeFrom, timeTo),
                  ),
                }))
                .filter((g) => g.slots.length > 0)

              if (eligibleGroups.length === 0) return null

              return (
                <div key={label}>
                  {/* Day heading */}
                  <p className="mb-3 text-sm font-semibold text-foreground">{label}</p>

                  <div className="flex flex-col gap-4">
                    {eligibleGroups.map((group, gi) => (
                      <div key={gi}>
                        {/* Category heading — only shown when there are multiple named variants */}
                        {multiCat && group.name && (
                          <p className="mb-2 border-b border-border pb-1.5 text-xs font-medium text-muted-foreground">
                            {group.name}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {group.slots.map((s, si) => (
                            <TimeslotChip key={si} slot={s} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  const [allSlotsOpen, setAllSlotsOpen] = useState(false)
  const tripAvail = availability[trip.id]
  // Show skeleton for every card while ANY availability fetch is in progress.
  const showSkeleton = isLoading
  const departures   = tripAvail ?? getDummyDepartures(trip.id)

  // Build labeled slot rows (flat, deduplicated) — for card chip preview
  const todayLabel    = "Today"
  const tomorrowLabel = "Tomorrow"

  const slotRows: { label: string; slots: Timeslot[] }[] = []
  if (dateFilter?.date) {
    slotRows.push({ label: formatDate(dateFilter.date), slots: departures.today })
  } else {
    if (departures.today.length > 0)    slotRows.push({ label: todayLabel,    slots: departures.today })
    if (departures.tomorrow.length > 0) slotRows.push({ label: tomorrowLabel, slots: departures.tomorrow })
  }

  // Build grouped rows for the full-timeslot modal
  const dayGroups: { label: string; groups: SlotGroup[] }[] = []
  if (dateFilter?.date) {
    if (departures.todayGroups.length > 0)
      dayGroups.push({ label: formatDate(dateFilter.date), groups: departures.todayGroups })
  } else {
    if (departures.todayGroups.length > 0)
      dayGroups.push({ label: todayLabel,    groups: departures.todayGroups })
    if (departures.tomorrowGroups.length > 0)
      dayGroups.push({ label: tomorrowLabel, groups: departures.tomorrowGroups })
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
                <SlotRow
                  key={label}
                  label={label}
                  slots={slots}
                  persons={persons}
                  timeFrom={timeFrom}
                  timeTo={timeTo}
                  onShowAll={() => setAllSlotsOpen(true)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <AllSlotsModal
        open={allSlotsOpen}
        onClose={() => setAllSlotsOpen(false)}
        tripTitle={trip.title}
        dayGroups={dayGroups}
        persons={persons}
        timeFrom={timeFrom}
        timeTo={timeTo}
      />
    </div>
  )
}

/* ── Main component ── */
export function SearchContent({
  initialTrips,
  filtersConfig = DEFAULT_SEARCH_FILTERS_CONFIG,
}: {
  initialTrips: SearchTrip[]
  filtersConfig?: SearchFiltersConfig
}) {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const query        = searchParams.get("q") || ""

  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen]       = useState(false)
  const [dateOpen, setDateOpen]             = useState(false)
  const [personsOpen, setPersonsOpen]       = useState(false)
  const [viewMode, setViewMode]             = useState<"grid" | "list">("list")
  const [availability, setAvailability]     = useState<AvailabilityMap>({})

  // Geocoding state for the Location filter (resolved address → lat/lng).
  // Re-fetched whenever the address changes (debounced).
  const [userCoord, setUserCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [mapboxToken, setMapboxToken] = useState<string>("")
  // Start as true so skeleton shows on the very first render — prevents dummy
  // departure data from flashing before the initial availability fetch resolves.
  const [availLoading, setAvailLoading]     = useState(true)

  // Initialize filters from URL params (preserves hero search selections)
  const [activeFilters, setActiveFilters] = useState<Filters>(() => {
    // Support both ?tag=slug and ?tag=slug1,slug2 — used by the homepage
    // "Currently Trending Categories" cards to pre-select a tag filter.
    const tagParam = searchParams.get("tag") ?? ""
    const tagsFromUrl = tagParam
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
    return {
      ...DEFAULT_FILTERS,
      dateFrom: searchParams.get("date")     ?? "",
      timeFrom: searchParams.get("timeFrom") ?? "",
      timeTo:   searchParams.get("timeTo")   ?? "",
      persons:  Math.max(1, parseInt(searchParams.get("persons") ?? "1", 10) || 1),
      tags:     tagsFromUrl,
    }
  })

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
    if (activeFilters.tags.length > 0) params.set("tag", activeFilters.tags.join(","))
    router.replace(`/search?${params.toString()}`, { scroll: false })
  }, [activeFilters.dateFrom, activeFilters.timeFrom, activeFilters.timeTo, activeFilters.persons, activeFilters.tags]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Fetch availability — only re-fires when the DATE changes.
     Time + person filtering is fully client-side so those changes never
     trigger a network request and can't cause race conditions.
     AbortController cancels any stale in-flight request. */
  const fetchAvailability = useCallback((dateFrom: string, signal: AbortSignal) => {
    const params = new URLSearchParams()
    if (dateFrom) params.set("date", dateFrom)
    // Wipe stale data + show skeleton immediately so no old slots flash during transitions.
    setAvailability({})
    setAvailLoading(true)
    fetch(`/api/availability?${params}`, { signal })
      .then((r) => r.ok ? r.json() : {})
      .then((data: AvailabilityMap) => {
        // Only update state when this fetch was NOT aborted.
        setAvailability(data)
        setAvailLoading(false)
      })
      .catch((err) => {
        if (err?.name === "AbortError") return  // aborted — do NOT touch loading state
        console.error(err)
        setAvailLoading(false)
      })
      // NO .finally() — aborted fetches must never clear availLoading,
      // because the replacement fetch is already in flight and will clear it.
  }, [])

  // Single effect covers both initial mount AND date changes.
  // Returns a cleanup that aborts the in-flight request so React Strict Mode
  // double-invocation and fast date changes never leave a stale fetch running
  // that would prematurely flip availLoading back to false.
  useEffect(() => {
    const ctrl = new AbortController()
    fetchAvailability(activeFilters.dateFrom, ctrl.signal)
    return () => ctrl.abort()
  }, [activeFilters.dateFrom, fetchAvailability]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Category pills */
  const categories = useMemo(() => {
    const seen = new Set<string>()
    return initialTrips
      .map((t) => t.category)
      .filter((c) => { if (!c || seen.has(c)) return false; seen.add(c); return true })
      .sort()
  }, [initialTrips])

  /* Tag options (filtered: hide internal Palisis flags). */
  const tagOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const t of initialTrips) {
      for (const tg of t.tripTags ?? []) {
        if (isVisibleTripTag(tg)) seen.add(tg)
      }
    }
    return Array.from(seen).sort()
  }, [initialTrips])

  /* Tour-type options. */
  const typeOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const t of initialTrips) {
      if (t.tourType && t.tourType.trim()) seen.add(t.tourType.trim())
    }
    return Array.from(seen).sort()
  }, [initialTrips])

  /* Load Mapbox token once (used for forward geocoding of the address input). */
  useEffect(() => {
    if (!filtersConfig.location) return
    fetch("/api/mapbox-token")
      .then((r) => r.ok ? r.json() : { token: "" })
      .then((d: { token?: string }) => setMapboxToken(d.token ?? ""))
      .catch(() => setMapboxToken(""))
  }, [filtersConfig.location])

  const dateFilterActive = activeFilters.dateFrom !== ""
  const dateFilter = dateFilterActive
    ? { date: activeFilters.dateFrom, timeFrom: activeFilters.timeFrom, timeTo: activeFilters.timeTo }
    : null
  const persons = activeFilters.persons

  // Location only counts as an "active" filter when it can actually narrow
  // results: Radius widget must also be enabled AND the address must have
  // resolved to a coordinate (userCoord != null). Otherwise the input is a
  // no-op and would falsely inflate the badge count.
  const locationActive =
    filtersConfig.location &&
    filtersConfig.radius &&
    activeFilters.locationAddress !== "" &&
    userCoord !== null

  const activeFilterCount = [
    filtersConfig.price && (activeFilters.priceMin > 0 || activeFilters.priceMax < 500),
    filtersConfig.rating && activeFilters.ratingMin > 0,
    filtersConfig.duration && activeFilters.durationMax < 24,
    locationActive,
    filtersConfig.tags && activeFilters.tags.length > 0,
    filtersConfig.type && activeFilters.types.length > 0,
  ].filter(Boolean).length

  /* Debounced geocoding of the address input → user lat/lng for radius filter. */
  useEffect(() => {
    if (!filtersConfig.location || !filtersConfig.radius) { setUserCoord(null); return }
    const addr = activeFilters.locationAddress.trim()
    if (!addr) { setUserCoord(null); return }
    if (!mapboxToken) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      const res = await geocodeAddress(addr, mapboxToken, { signal: ctrl.signal })
      setUserCoord(res)
    }, 400)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [activeFilters.locationAddress, mapboxToken, filtersConfig.location, filtersConfig.radius])

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

  /* Full filter chain — each clause is gated by its config flag so disabled
     filters can't accidentally hide trips even if the URL or stale state
     contains a value. */
  const filtered = useMemo(() => {
    let result = keywordMatched.filter((t) => {
      if (activeCategory && t.category !== activeCategory) return false

      if (filtersConfig.price) {
        if (t.price < activeFilters.priceMin || t.price > activeFilters.priceMax) return false
      }
      if (filtersConfig.rating && activeFilters.ratingMin > 0) {
        if (t.rating < activeFilters.ratingMin) return false
      }
      if (filtersConfig.duration && activeFilters.durationMax < 24) {
        // Use the SHORTEST parsed option so multi-option trips
        // ("Full Day:7H / Half Day:4H") stay visible whenever ANY option
        // fits the user's cap. Unknown duration ("TBC", "check timetable")
        // → keep visible (don't hide trips we can't classify).
        const dHours = parseDurationHoursMin(t.duration)
        if (dHours != null && dHours > activeFilters.durationMax) return false
      }
      if (filtersConfig.location && filtersConfig.radius && userCoord) {
        const coord = parseGeocode(t.departureGeocode)
        if (!coord) return false // no geocode → can't be inside any radius
        if (haversineKm(userCoord.lat, userCoord.lng, coord.lat, coord.lng) > activeFilters.locationRadius) return false
      }
      if (filtersConfig.tags && activeFilters.tags.length > 0) {
        const have = new Set((t.tripTags ?? []).filter(isVisibleTripTag))
        if (!activeFilters.tags.some((tg) => have.has(tg))) return false
      }
      if (filtersConfig.type && activeFilters.types.length > 0) {
        if (!t.tourType || !activeFilters.types.includes(t.tourType.trim())) return false
      }
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
  }, [keywordMatched, activeCategory, activeFilters, dateFilterActive, availability, availLoading, persons, filtersConfig, userCoord])

  /* ── Smooth exit animation state ── */
  const [displayedTrips, setDisplayedTrips] = useState<SearchTrip[]>(filtered)
  const [exitingIds, setExitingIds]         = useState<Set<string>>(new Set())
  const displayedRef  = useRef<SearchTrip[]>(filtered)
  const filteredRef   = useRef<SearchTrip[]>(filtered)   // always latest — avoids stale closures in setTimeout
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
        config={filtersConfig}
        tagOptions={tagOptions}
        typeOptions={typeOptions}
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

        {availLoading ? (
          /* ── Full-card skeletons while availability is loading ── */
          viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <SearchCardSkeleton key={i} />)}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 5 }).map((_, i) => <SearchListCardSkeleton key={i} />)}
            </div>
          )
        ) : filtered.length === 0 ? (
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

