"use client"

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import type { Trip } from "./data"

/**
 * Planner working-list persistence ("My Trip" on /planner).
 *
 * This is SEPARATE from the site-wide Saved Trips library (`lib/cart-context.tsx`).
 * The planner working list is the set of experiences the visitor is actively
 * planning a day around — the itinerary builder reads from THIS list. The Saved
 * Trips library (the bookmark button) is a long-lived collection the visitor
 * curates across the whole site.
 *
 * Like the cart, we store the FULL Trip object (not just an id) because most
 * trips come from the DB / Palisis (`tcms_*`) and aren't in the static catalog.
 *
 * Persists across refreshes in its own localStorage key by design.
 */
const STORAGE_KEY = "sightseeing_planner_list_v1"

// Planner preferences — used to price each line for the whole party.
const PREFS_COOKIE = "sightseeing_prefs"
const PREFS_LOCAL_KEY = "sightseeing_prefs_v1"
const PREFS_EVENT = "sightseeing:prefs"

/** Read the planner party size (adults + children); always at least 1. */
function readPersons(): number {
  if (typeof window === "undefined") return 1
  let raw: string | null = null
  try { raw = window.localStorage.getItem(PREFS_LOCAL_KEY) } catch { /* ignore */ }
  if (!raw && typeof document !== "undefined") {
    try {
      const m = document.cookie.split("; ").find((c) => c.startsWith(`${PREFS_COOKIE}=`))
      if (m) raw = decodeURIComponent(m.split("=").slice(1).join("="))
    } catch { /* ignore */ }
  }
  if (!raw) return 1
  try {
    const p = JSON.parse(raw) as { adults?: unknown; children?: unknown }
    const adults = Number(p.adults)
    const children = Number(p.children)
    const total =
      (Number.isFinite(adults) ? Math.max(0, adults) : 0) +
      (Number.isFinite(children) ? Math.max(0, children) : 0)
    return Math.max(1, Math.floor(total))
  } catch { return 1 }
}

export interface PlannerListItem { trip: Trip }

interface PlannerListContextType {
  items: PlannerListItem[]; hydrated: boolean
  addItem: (trip: Trip) => void; removeItem: (tripId: string) => void
  clearList: () => void; isInList: (tripId: string) => boolean
  /** Merge a batch of trips (e.g. the Saved Trips library) into the list,
   *  skipping any already present. Returns nothing — state updates async. */
  loadFromSaved: (trips: Trip[]) => void
  totalItems: number
  /** People per trip, sourced from the planner preferences (adults + children). */
  persons: number
}

export const PlannerListContext = createContext<PlannerListContextType | undefined>(undefined)

function writeStorage(items: PlannerListItem[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Quota or privacy-mode failure — silently skip.
  }
}

/** Coerce a possibly-corrupted persisted entry into a safe item, or null. */
function sanitizeItem(raw: unknown): PlannerListItem | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as { trip?: unknown }
  if (!o.trip || typeof o.trip !== "object") return null
  const t = o.trip as Record<string, unknown>
  if (typeof t.id !== "string" || !t.id) return null
  if (typeof t.title !== "string" || !t.title) return null
  const price = Number(t.price)
  if (!Number.isFinite(price) || price < 0) return null
  const safeTrip = {
    ...(t as object),
    id: t.id,
    title: t.title,
    price,
    rating: Number.isFinite(Number(t.rating)) ? Number(t.rating) : 0,
    image: typeof t.image === "string" ? t.image : "/placeholder.svg",
    duration: typeof t.duration === "string" ? t.duration : "",
    category: typeof t.category === "string" ? t.category : "",
  } as unknown as Trip
  return { trip: safeTrip }
}

function readStorage(): PlannerListItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(sanitizeItem)
      .filter((i): i is PlannerListItem => i !== null)
  } catch {
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    return []
  }
}

export function PlannerListProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<PlannerListItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [persons, setPersons] = useState(1)
  const skipSync = useRef(false)

  useEffect(() => {
    skipSync.current = true
    setItems(readStorage())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return }
    if (hydrated) writeStorage(items)
  }, [items, hydrated])

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      skipSync.current = true
      setItems(readStorage())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  // Keep party size in sync with planner preferences.
  useEffect(() => {
    if (typeof window === "undefined") return
    const sync = () => setPersons(readPersons())
    sync()
    const onStorage = (e: StorageEvent) => { if (e.key === PREFS_LOCAL_KEY) sync() }
    window.addEventListener(PREFS_EVENT, sync)
    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", sync)
    document.addEventListener("visibilitychange", sync)
    return () => {
      window.removeEventListener(PREFS_EVENT, sync)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", sync)
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])

  const addItem = useCallback((trip: Trip) => {
    setItems((prev) => {
      if (prev.some((i) => i.trip.id === trip.id)) return prev
      return [...prev, { trip }]
    })
  }, [])

  const removeItem = useCallback((tripId: string) => {
    setItems((prev) => prev.filter((i) => i.trip.id !== tripId))
  }, [])

  const clearList = useCallback(() => {
    setItems([])
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    }
  }, [])

  const loadFromSaved = useCallback((trips: Trip[]) => {
    setItems((prev) => {
      const seen = new Set(prev.map((i) => i.trip.id))
      const merged = [...prev]
      for (const trip of trips) {
        if (trip && trip.id && !seen.has(trip.id)) {
          seen.add(trip.id)
          merged.push({ trip })
        }
      }
      return merged
    })
  }, [])

  const isInList = useCallback((tripId: string) => items.some((i) => i.trip.id === tripId), [items])
  const totalItems = items.length

  return (
    <PlannerListContext.Provider value={{ items, hydrated, addItem, removeItem, clearList, isInList, loadFromSaved, totalItems, persons }}>
      {children}
    </PlannerListContext.Provider>
  )
}

const PLANNER_LIST_FALLBACK: PlannerListContextType = {
  items: [], hydrated: false,
  addItem: () => {}, removeItem: () => {}, clearList: () => {},
  isInList: () => false, loadFromSaved: () => {}, totalItems: 0, persons: 1,
}

export function usePlannerList() {
  const ctx = useContext(PlannerListContext)
  return ctx ?? PLANNER_LIST_FALLBACK
}
