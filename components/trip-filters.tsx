"use client"

import { useState, useMemo } from "react"
import { X, SlidersHorizontal, MapPin, Tag, Clock, Euro } from "lucide-react"
import { trips } from "@/lib/data"
import type { Trip } from "@/lib/data"

/* Derive unique filter options from real data */
const ALL_CATEGORIES = [...new Set(trips.map((t) => t.category))].sort()
const ALL_CITIES = [...new Set(trips.map((t) => t.city ?? "Luxembourg").filter(Boolean))].sort()
const DURATION_RANGES = [
  { label: "Under 2h", min: 0, max: 2 },
  { label: "2-4h", min: 2, max: 4 },
  { label: "Half day", min: 4, max: 6 },
  { label: "Full day", min: 6, max: 24 },
] as const
const PRICE_RANGES = [
  { label: "Free", min: 0, max: 0 },
  { label: "Under 20", min: 0.01, max: 20 },
  { label: "20 - 50", min: 20, max: 50 },
  { label: "50 - 100", min: 50, max: 100 },
  { label: "100+", min: 100, max: 9999 },
] as const

export type SortOption = "relevance" | "price-asc" | "price-desc" | "rating" | "duration"

export interface FilterState {
  categories: string[]
  cities: string[]
  durationRange: number | null
  priceRange: number | null
  sortBy: SortOption
}

const defaultFilters: FilterState = {
  categories: [],
  cities: [],
  durationRange: null,
  priceRange: null,
  sortBy: "relevance",
}

function parseDurationHours(dur: string): number {
  const lower = dur.toLowerCase()
  if (lower.includes("full day") || lower.includes("full-day")) return 8
  if (lower.includes("half day") || lower.includes("half-day")) return 4
  const hourMatch = lower.match(/([\d.]+)\s*h/)
  if (hourMatch) return parseFloat(hourMatch[1])
  const minMatch = lower.match(/(\d+)\s*min/)
  if (minMatch) return parseFloat(minMatch[1]) / 60
  return 2
}

export function useFilters(baseTrips: Trip[]) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters)

  const filtered = useMemo(() => {
    let result = [...baseTrips]

    if (filters.categories.length > 0) {
      result = result.filter((t) => filters.categories.includes(t.category))
    }
    if (filters.cities.length > 0) {
      result = result.filter((t) => filters.cities.includes(t.city ?? "Luxembourg"))
    }
    if (filters.durationRange !== null) {
      const range = DURATION_RANGES[filters.durationRange]
      result = result.filter((t) => {
        const h = parseDurationHours(t.duration)
        return h >= range.min && h <= range.max
      })
    }
    if (filters.priceRange !== null) {
      const range = PRICE_RANGES[filters.priceRange]
      result = result.filter((t) => t.price >= range.min && t.price <= range.max)
    }

    switch (filters.sortBy) {
      case "price-asc":
        result.sort((a, b) => a.price - b.price)
        break
      case "price-desc":
        result.sort((a, b) => b.price - a.price)
        break
      case "rating":
        result.sort((a, b) => b.rating - a.rating)
        break
      case "duration":
        result.sort((a, b) => parseDurationHours(a.duration) - parseDurationHours(b.duration))
        break
    }

    return result
  }, [baseTrips, filters])

  const activeCount = (filters.categories.length > 0 ? 1 : 0) + (filters.cities.length > 0 ? 1 : 0) + (filters.durationRange !== null ? 1 : 0) + (filters.priceRange !== null ? 1 : 0)

  return { filters, setFilters, filtered, activeCount }
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

interface TripFilterBarProps {
  filters: FilterState
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>
  activeCount: number
  resultCount: number
}

export function TripFilterBar({ filters, setFilters, activeCount, resultCount }: TripFilterBarProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  const toggleCategory = (cat: string) => {
    setFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat) ? prev.categories.filter((c) => c !== cat) : [...prev.categories, cat],
    }))
  }

  const toggleCity = (city: string) => {
    setFilters((prev) => ({
      ...prev,
      cities: prev.cities.includes(city) ? prev.cities.filter((c) => c !== city) : [...prev.cities, city],
    }))
  }

  const clearAll = () => setFilters(defaultFilters)

  return (
    <div className="flex flex-col gap-3">
      {/* Top row: filter groups + sort + count */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category chips toggle */}
        <button
          type="button"
          onClick={() => setExpandedGroup(expandedGroup === "category" ? null : "category")}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
            filters.categories.length > 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
          }`}
        >
          <Tag className="h-3 w-3" />
          Category{filters.categories.length > 0 && ` (${filters.categories.length})`}
        </button>

        {/* City chips toggle */}
        <button
          type="button"
          onClick={() => setExpandedGroup(expandedGroup === "city" ? null : "city")}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
            filters.cities.length > 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
          }`}
        >
          <MapPin className="h-3 w-3" />
          Location{filters.cities.length > 0 && ` (${filters.cities.length})`}
        </button>

        {/* Duration chips toggle */}
        <button
          type="button"
          onClick={() => setExpandedGroup(expandedGroup === "duration" ? null : "duration")}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
            filters.durationRange !== null
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
          }`}
        >
          <Clock className="h-3 w-3" />
          Duration{filters.durationRange !== null && `: ${DURATION_RANGES[filters.durationRange].label}`}
        </button>

        {/* Price chips toggle */}
        <button
          type="button"
          onClick={() => setExpandedGroup(expandedGroup === "price" ? null : "price")}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
            filters.priceRange !== null
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
          }`}
        >
          <Euro className="h-3 w-3" />
          {"Price"}{filters.priceRange !== null && `: ${PRICE_RANGES[filters.priceRange].label}`}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Sort */}
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
          <SlidersHorizontal className="h-3 w-3 text-muted-foreground" />
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters((prev) => ({ ...prev, sortBy: e.target.value as SortOption }))}
            className="bg-transparent text-xs font-medium text-foreground focus:outline-none"
          >
            <option value="relevance">Relevance</option>
            <option value="price-asc">{"Price: Low to High"}</option>
            <option value="price-desc">{"Price: High to Low"}</option>
            <option value="rating">{"Rating: Best First"}</option>
            <option value="duration">{"Duration: Short First"}</option>
          </select>
        </div>

        {/* Result count */}
        <span className="text-xs text-muted-foreground">{resultCount} results</span>

        {/* Clear all */}
        {activeCount > 0 && (
          <button type="button" onClick={clearAll} className="flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10">
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Expanded filter group */}
      {expandedGroup === "category" && (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-3">
          {ALL_CATEGORIES.map((cat) => (
            <ChipButton key={cat} active={filters.categories.includes(cat)} onClick={() => toggleCategory(cat)}>
              {cat}
            </ChipButton>
          ))}
        </div>
      )}

      {expandedGroup === "city" && (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-3">
          {ALL_CITIES.map((city) => (
            <ChipButton key={city} active={filters.cities.includes(city)} onClick={() => toggleCity(city)}>
              {city}
            </ChipButton>
          ))}
        </div>
      )}

      {expandedGroup === "duration" && (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-3">
          {DURATION_RANGES.map((range, i) => (
            <ChipButton key={range.label} active={filters.durationRange === i} onClick={() => setFilters((prev) => ({ ...prev, durationRange: prev.durationRange === i ? null : i }))}>
              {range.label}
            </ChipButton>
          ))}
        </div>
      )}

      {expandedGroup === "price" && (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-3">
          {PRICE_RANGES.map((range, i) => (
            <ChipButton key={range.label} active={filters.priceRange === i} onClick={() => setFilters((prev) => ({ ...prev, priceRange: prev.priceRange === i ? null : i }))}>
              {range.label === "Free" ? "Free" : `${range.label} \u20AC`}
            </ChipButton>
          ))}
        </div>
      )}
    </div>
  )
}
