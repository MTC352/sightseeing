// lib/data.ts
//
// TYPES ONLY + EMPTY STUBS.
//
// All trip / guide / review / photo-spot data was historically hardcoded here
// and seeded into Postgres. That made it impossible to keep the catalogue in
// sync with TourCMS/Palisis, which is the ONE-WAY upstream source of truth
// for every trip (see replit.md → "Palisis/TourCMS is ONE-WAY ONLY").
//
// As of 2026-05, all static trip data has been removed. The DB is the only
// source for trips, and TourCMS is the only source for the DB. Existing
// imports of `trips`, `tripSummaries`, `tripDetails`, `guides`, `reviews`,
// `photoSpots`, `getTripById`, `getTripDetail`, and `getGoogleReviews` still
// resolve — they now return empty data so callers degrade gracefully while
// the DB-backed code path serves the real values.
//
// `categories` and `weatherData` remain as static UI fallbacks: they are
// navigation labels and a weather placeholder, not trip records.

/* ── Types ─────────────────────────────────────────────────────────── */

export interface Trip {
  id: string
  /** WordPress-style URL slug for `/trip/{slug}`. Falls back to `id` when absent. */
  slug?: string
  title: string
  image: string
  gallery?: string[]
  price: number
  originalPrice?: number
  rating: number
  reviewCount: number
  duration: string
  category: string
  tags: string[]
  badge?: string
  city?: string
  description?: string
  permalink?: string
  provider?: string
  highlights?: string[]
  googleBusinessUrl?: string
}

export interface Guide {
  id: string; name: string; avatar: string; languages: string[]; bio: string; rating: number; reviewCount: number; verified: boolean
}

export interface ItineraryStep {
  title: string; description: string; duration?: string
}

export interface TripDetail {
  tripId: string; description: string; highlights: string[]; includes: string[]; notIncluded: string[]
  gallery: string[]; guides: Guide[]; itinerary: ItineraryStep[]
  cancellationPolicy: string[]; goodToKnow: { question: string; answer: string }[]
  reasons: string[]; maxGroupSize: number; languages: string[]
}

export interface GoogleReview {
  id: string
  author: string
  initial: string
  rating: number
  date: string
  text: string
  language: string
  platform: "google" | "viator" | "getyourguide" | "tripadvisor"
  tourName?: string
}

export interface PhotoSpot {
  id: string
  name: string
  description: string
  coords: [number, number] // [lng, lat]
}

/** Lightweight trip object safe to bundle in client components. */
export type TripSummary = Omit<Trip, "description" | "highlights" | "permalink" | "provider">

/* ── EMPTY data exports (kept to preserve import compatibility) ───── */

export const trips: Trip[] = []
export const tripSummaries: TripSummary[] = []
export const tripDetails: Record<string, TripDetail> = {}
export const guides: Guide[] = []
export const photoSpots: PhotoSpot[] = []
export const reviews: { id: string; author: string; rating: number; date: string; text: string; tripTitle: string }[] = []

/* ── Stub functions — return nothing so DB-backed paths are used ─── */

export function getTripDetail(_id: string): TripDetail | undefined {
  return undefined
}

export function getTripById(_id: string): Trip | undefined {
  return undefined
}

export function getGoogleReviews(_tripId: string): GoogleReview[] {
  return []
}

/* ── Static UI fallbacks (NOT trip data) ──────────────────────────── */

export const weatherData = {
  current: { temp: 12, condition: "Partly Cloudy" as const, humidity: 65, wind: 14, icon: "cloud-sun" as const },
  forecast: [
    { day: "Today", high: 14, low: 8, icon: "cloud-sun" as const },
    { day: "Tue", high: 11, low: 6, icon: "cloud-rain" as const },
    { day: "Wed", high: 9, low: 5, icon: "cloud-rain" as const },
    { day: "Thu", high: 13, low: 7, icon: "sun" as const },
  ],
}

export const categories = [
  { name: "Food & Events", icon: "utensils", count: 0 },
  { name: "Sports & Nature", icon: "bike", count: 0 },
  { name: "Culture", icon: "landmark", count: 0 },
  { name: "Tours", icon: "map", count: 0 },
  { name: "Dinnerhopping", icon: "wine", count: 0 },
  { name: "Private Tours", icon: "users", count: 0 },
]
