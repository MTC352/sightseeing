"use client"

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import type { Trip } from "./data"
import { trips as allTrips } from "./data"

const COOKIE_NAME = "sightseeing_cart"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export interface CartItem { trip: Trip; quantity: number }

interface CartContextType {
  items: CartItem[]; hydrated: boolean
  addItem: (trip: Trip) => void; removeItem: (tripId: string) => void
  updateQuantity: (tripId: string, quantity: number) => void; clearCart: () => void
  isInCart: (tripId: string) => boolean; totalPrice: number; totalItems: number
}

export const CartContext = createContext<CartContextType | undefined>(undefined)

function writeCookie(items: CartItem[]) {
  try {
    const payload = items.map((i) => ({ id: i.trip.id, qty: i.quantity }))
    const json = JSON.stringify(payload)
    // Skip write if the serialised string would exceed the 4096-byte cookie limit
    if (json.length > 3800) return
    const val = encodeURIComponent(json)
    document.cookie = `${COOKIE_NAME}=${val};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`
  } catch {
    // Silently skip cookie write on encode errors
  }
}

function readCookie(): CartItem[] {
  try {
    const match = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_NAME}=`))
    if (!match) return []
    const encoded = match.split("=").slice(1).join("=")
    if (!encoded) return []
    const raw = JSON.parse(decodeURIComponent(encoded))
    if (!Array.isArray(raw)) return []
    return raw
      .map(({ id, qty }: { id: string; qty: number }) => {
        const trip = allTrips.find((t) => t.id === id)
        return trip ? { trip, quantity: Math.max(1, Number(qty) || 1) } : null
      })
      .filter(Boolean) as CartItem[]
  } catch {
    // Clear corrupted cookie
    try { document.cookie = `${COOKIE_NAME}=;path=/;max-age=0` } catch { /* ignore */ }
    return []
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const skipSync = useRef(false)

  useEffect(() => {
    skipSync.current = true
    setItems(readCookie())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return }
    if (hydrated) writeCookie(items)
  }, [items, hydrated])

  const addItem = useCallback((trip: Trip) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.trip.id === trip.id)
      if (existing) return prev.map((i) => (i.trip.id === trip.id ? { ...i, quantity: i.quantity + 1 } : i))
      return [...prev, { trip, quantity: 1 }]
    })
  }, [])

  const removeItem = useCallback((tripId: string) => { setItems((prev) => prev.filter((i) => i.trip.id !== tripId)) }, [])

  const updateQuantity = useCallback((tripId: string, quantity: number) => {
    if (quantity <= 0) { setItems((prev) => prev.filter((i) => i.trip.id !== tripId)); return }
    setItems((prev) => prev.map((i) => (i.trip.id === tripId ? { ...i, quantity } : i)))
  }, [])

  const clearCart = useCallback(() => { setItems([]); document.cookie = `${COOKIE_NAME}=;path=/;max-age=0` }, [])
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
