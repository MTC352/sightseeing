"use client"

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import type { Trip } from "./data"

/**
 * Cart persistence.
 *
 * We store the FULL Trip object (not just an id) in localStorage because most
 * real trips come from the DB / Palisis (ids like `tcms_*`) and are NOT
 * present in the static `lib/data.ts` seed catalogue. Looking them up by id
 * in the static array on rehydrate would silently drop every Palisis-sourced
 * cart item — which is exactly the bug we're fixing here.
 *
 * No server persistence by design — the user asked for client-only storage.
 */
const STORAGE_KEY = "sightseeing_cart_v2"
// Legacy id-only cookie left behind by the previous implementation. We clean
// it up on first load so it can't keep over-writing the new localStorage value
// or confuse future debugging.
const LEGACY_COOKIE = "sightseeing_cart"

export interface CartItem { trip: Trip; quantity: number }

interface CartContextType {
  items: CartItem[]; hydrated: boolean
  addItem: (trip: Trip) => void; removeItem: (tripId: string) => void
  updateQuantity: (tripId: string, quantity: number) => void; clearCart: () => void
  isInCart: (tripId: string) => boolean; totalPrice: number; totalItems: number
}

export const CartContext = createContext<CartContextType | undefined>(undefined)

function writeStorage(items: CartItem[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Quota or privacy-mode failure — silently skip.
  }
}

/** Coerce a possibly-corrupted persisted entry into a safe CartItem, or null
 *  if it can't be salvaged. Defensive about every numeric field used by the
 *  UI (price, rating, etc.) so a bad payload can never produce NaN totals. */
function sanitizeCartItem(raw: unknown): CartItem | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as { trip?: unknown; quantity?: unknown }
  if (!o.trip || typeof o.trip !== "object") return null
  const t = o.trip as Record<string, unknown>
  if (typeof t.id !== "string" || !t.id) return null
  if (typeof t.title !== "string" || !t.title) return null
  const price = Number(t.price)
  if (!Number.isFinite(price) || price < 0) return null
  // Quantity is always 1 per trip: the cart shows one line per experience and
  // the head-count comes from the planner preferences (persons), not a
  // per-item quantity. Coerce any legacy persisted value to 1.
  const quantity = 1
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
  return { trip: safeTrip, quantity }
}

function readStorage(): CartItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(sanitizeCartItem)
      .filter((i): i is CartItem => i !== null)
  } catch {
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    return []
  }
}

function clearLegacyCookie() {
  if (typeof document === "undefined") return
  try { document.cookie = `${LEGACY_COOKIE}=;path=/;max-age=0` } catch { /* ignore */ }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const skipSync = useRef(false)

  // Hydrate once on mount, then keep storage in sync with state.
  useEffect(() => {
    skipSync.current = true
    setItems(readStorage())
    setHydrated(true)
    clearLegacyCookie()
  }, [])

  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return }
    if (hydrated) writeStorage(items)
  }, [items, hydrated])

  // Cross-tab sync: if the user has the planner open in two tabs, edits in
  // one should be reflected in the other on next render.
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

  const addItem = useCallback((trip: Trip) => {
    // Idempotent: a trip is either in the cart or not — re-adding never bumps a
    // per-item quantity. The number of people is driven by planner preferences.
    setItems((prev) => {
      if (prev.some((i) => i.trip.id === trip.id)) return prev
      return [...prev, { trip, quantity: 1 }]
    })
  }, [])

  const removeItem = useCallback((tripId: string) => { setItems((prev) => prev.filter((i) => i.trip.id !== tripId)) }, [])

  const updateQuantity = useCallback((tripId: string, quantity: number) => {
    if (quantity <= 0) { setItems((prev) => prev.filter((i) => i.trip.id !== tripId)); return }
    setItems((prev) => prev.map((i) => (i.trip.id === tripId ? { ...i, quantity } : i)))
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    }
  }, [])
  const isInCart = useCallback((tripId: string) => items.some((i) => i.trip.id === tripId), [items])
  const totalPrice = items.reduce((sum, i) => sum + i.trip.price * i.quantity, 0)
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, hydrated, addItem, removeItem, updateQuantity, clearCart, isInCart, totalPrice, totalItems }}>
      {children}
    </CartContext.Provider>
  )
}

const CART_FALLBACK: CartContextType = {
  items: [], hydrated: false,
  addItem: () => {}, removeItem: () => {}, updateQuantity: () => {}, clearCart: () => {},
  isInCart: () => false, totalPrice: 0, totalItems: 0,
}

export function useCart() {
  const ctx = useContext(CartContext)
  return ctx ?? CART_FALLBACK
}
