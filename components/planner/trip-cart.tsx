"use client"

import { useState, useCallback } from "react"
import { useCart } from "@/lib/cart-context"
import Image from "next/image"
import Link from "next/link"
import { ShoppingBag, X, Minus, Plus, Trash2, ChevronRight, Clock, CreditCard, Loader2, ExternalLink } from "lucide-react"

// Palisis widget base URL — swap domain when live credentials are provided
const PALISIS_BASE = "https://booking.sightseeing.lu"

function buildPalisisUrl(items: { id: string; quantity: number }[]): string {
  const params = new URLSearchParams()
  items.forEach(({ id, quantity }) => {
    params.append("offer[]", id)
    params.append("qty[]", String(quantity))
  })
  return `${PALISIS_BASE}/cart?${params.toString()}`
}

interface CheckoutModalProps {
  url: string
  onClose: () => void
}

function CheckoutModal({ url, onClose }: CheckoutModalProps) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        aria-label="Close checkout"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      />

      {/* Modal */}
      <div className="relative flex h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <CreditCard className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Secure Checkout</p>
              <p className="text-xs text-muted-foreground">Powered by Palisis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Open in tab <ExternalLink className="h-3 w-3" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* iframe area */}
        <div className="relative flex-1 overflow-hidden">
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading secure payment...</p>
            </div>
          )}
          <iframe
            src={url}
            title="Secure Checkout"
            className="h-full w-full border-0"
            onLoad={() => setLoaded(true)}
            allow="payment"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-top-navigation"
          />
        </div>

        {/* Security footer */}
        <div className="flex shrink-0 items-center justify-center gap-2 border-t border-border bg-muted/40 px-4 py-2.5">
          <svg className="h-3.5 w-3.5 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <p className="text-[11px] text-muted-foreground">256-bit SSL encrypted — your payment is secure</p>
        </div>
      </div>
    </div>
  )
}

export function TripCart() {
  const { items, removeItem, updateQuantity, clearCart, totalPrice, totalItems } = useCart()
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  const handleCheckoutAll = useCallback(() => {
    setCheckoutOpen(true)
  }, [])

  const checkoutUrl = buildPalisisUrl(
    items.map((i) => ({ id: i.trip.id, quantity: i.quantity }))
  )

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <ShoppingBag className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">Your trip is empty</p>
        <p className="mt-1 text-xs text-muted-foreground">Add experiences from the chat or browse to build your perfect day.</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col">
        {/* Item list header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">My Trip ({totalItems})</h3>
          <button
            type="button"
            onClick={clearCart}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        </div>

        {/* Items */}
        <div className="px-4 py-3">
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <div key={item.trip.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 shadow-sm">
                <Link href={`/trip/${item.trip.id}`} className="relative h-[72px] w-[88px] shrink-0 overflow-hidden rounded-xl">
                  <Image
                    src={item.trip.image || "/placeholder.svg"}
                    alt={item.trip.title}
                    fill
                    className="object-cover"
                    sizes="88px"
                  />
                </Link>
                <div className="flex flex-1 flex-col gap-1.5 overflow-hidden">
                  <Link
                    href={`/trip/${item.trip.id}`}
                    className="line-clamp-2 text-sm font-bold leading-tight text-card-foreground transition-colors hover:text-primary"
                  >
                    {item.trip.title}
                  </Link>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {item.trip.duration}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-primary">
                      {(item.trip.price * item.quantity).toFixed(2)}&nbsp;&euro;
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.trip.id, item.quantity - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center text-sm font-semibold text-foreground">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.trip.id, item.quantity + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.trip.id)}
                        className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="text-lg font-bold text-foreground">{totalPrice.toFixed(2)}&nbsp;&euro;</span>
          </div>

          {/* Checkout All — primary action */}
          <button
            type="button"
            onClick={handleCheckoutAll}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <CreditCard className="h-4 w-4" />
            Checkout All
          </button>

          {/* Secondary: browse saved trips */}
          <Link
            href="/checkout"
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            View Saved Trips <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Checkout modal */}
      {checkoutOpen && (
        <CheckoutModal url={checkoutUrl} onClose={() => setCheckoutOpen(false)} />
      )}
    </>
  )
}
