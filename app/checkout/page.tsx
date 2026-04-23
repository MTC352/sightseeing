"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { useCart, type CartItem } from "@/lib/cart-context"
import { ShoppingBag, X, Minus, Plus, Trash2, Clock, Star, MapPin, Loader2, CreditCard, ExternalLink } from "lucide-react"

const PALISIS_BASE = "https://booking.sightseeing.lu"

function buildPalisisUrl(items: { id: string; quantity: number }[]): string {
  const params = new URLSearchParams()
  items.forEach(({ id, quantity }) => {
    params.append("offer[]", id)
    params.append("qty[]", String(quantity))
  })
  return `${PALISIS_BASE}/cart?${params.toString()}`
}

function CheckoutAllModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        aria-label="Close checkout"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      />
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
        {/* iframe */}
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
        {/* Footer */}
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
import { SmartItinerary } from "@/components/smart-itinerary"

export default function SavedTripsPage() {
  const { items, removeItem, updateQuantity, clearCart, totalPrice, totalItems, hydrated } = useCart()
  const [selectedItem, setSelectedItem] = useState<CartItem | null>(null)
  const [checkoutAllOpen, setCheckoutAllOpen] = useState(false)
  const checkoutAllUrl = buildPalisisUrl(items.map((i) => ({ id: i.trip.id, quantity: i.quantity })))

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center px-4 py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading your trips...</p>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <ShoppingBag className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-foreground">No saved trips yet</h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Browse our experiences or use the trip planner to find and save trips you love.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/planner" className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Plan My Trip</Link>
            <Link href="/explore" className="rounded-lg border border-border bg-transparent px-5 py-2.5 text-sm font-medium text-foreground">Browse Tours</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Saved Trips</h1>
            <p className="mt-1 text-sm text-muted-foreground">{totalItems} {totalItems === 1 ? "experience" : "experiences"} saved</p>
          </div>
          <button
            type="button"
            onClick={clearCart}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear All
          </button>
        </div>

        {/* Trip list */}
        <div className="mt-6 flex flex-col gap-4">
          {items.map((item, itemIdx) => (
            <div key={item.trip.id} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
              <button
                type="button"
                onClick={() => setSelectedItem(item)}
                className="flex w-full items-start gap-4 p-4 text-left"
              >
                <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-36">
                  <Image
                    src={item.trip.image || "/placeholder.svg"}
                    alt={item.trip.title}
                    fill
                    priority={itemIdx === 0}
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(max-width:640px) 128px, 144px"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5 overflow-hidden">
                  <p className="text-xs font-medium uppercase tracking-wide text-primary">{item.trip.category}</p>
                  <h3 className="text-base font-bold text-foreground leading-snug line-clamp-2">{item.trip.title}</h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {item.trip.rating > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {item.trip.rating}
                        {item.trip.reviewCount > 0 && <span className="text-muted-foreground/60">({item.trip.reviewCount})</span>}
                      </span>
                    )}
                    <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{item.trip.duration}</span>
                    {item.trip.city && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{item.trip.city}</span>}
                  </div>
                  <div className="mt-1">
                    <span className="text-lg font-bold text-primary">{item.trip.price.toFixed(2)} &euro;</span>
                    {item.trip.originalPrice && (
                      <span className="ml-2 text-xs text-muted-foreground line-through">{item.trip.originalPrice.toFixed(2)} &euro;</span>
                    )}
                    <span className="ml-1 text-xs text-muted-foreground">/ person</span>
                  </div>
                </div>
              </button>
              {/* Quantity + Remove controls */}
              <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Qty:</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.trip.id, item.quantity - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold text-foreground">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.trip.id, item.quantity + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-foreground">{(item.trip.price * item.quantity).toFixed(2)} &euro;</span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.trip.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Smart Itinerary */}
        <div className="mt-6">
          <SmartItinerary />
        </div>

        {/* Total + Checkout All */}
        <div className="mt-6 rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Estimated Total</span>
            <span className="text-2xl font-bold text-foreground">{totalPrice.toFixed(2)} &euro;</span>
          </div>
          <button
            type="button"
            onClick={() => setCheckoutAllOpen(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <CreditCard className="h-4 w-4" />
            Checkout All {totalItems > 1 ? `(${totalItems} experiences)` : ""}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Secure payment via Palisis — 256-bit SSL encrypted
          </p>
        </div>
      </div>

      {/* Individual booking modal */}
      {selectedItem && (
        <BookingModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}

      {/* Checkout All modal */}
      {checkoutAllOpen && (
        <CheckoutAllModal url={checkoutAllUrl} onClose={() => setCheckoutAllOpen(false)} />
      )}
    </div>
  )
}

/* ── Booking Modal ──────────────────────────────── */
function BookingModal({ item, onClose }: { item: CartItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === "Escape") onClose() }}
        role="button"
        tabIndex={0}
        aria-label="Close booking modal"
      />

      {/* Modal */}
      <div className="relative z-10 mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Trip hero */}
          <div className="relative h-48 sm:h-56">
            <Image
              src={item.trip.image || "/placeholder.svg"}
              alt={item.trip.title}
              fill
              className="object-cover"
              sizes="(max-width:672px) 100vw, 672px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
            <div className="absolute bottom-4 left-5 right-12">
              <p className="text-xs font-medium uppercase tracking-wide text-white/80">{item.trip.category}</p>
              <h2 className="mt-1 text-xl font-bold text-white leading-tight">{item.trip.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/80">
                {item.trip.rating > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {item.trip.rating}
                    {item.trip.reviewCount > 0 && ` (${item.trip.reviewCount})`}
                  </span>
                )}
                <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{item.trip.duration}</span>
                {item.trip.city && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{item.trip.city}</span>}
              </div>
            </div>
          </div>

          {/* Summary details */}
          <div className="px-5 py-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">{item.trip.price.toFixed(2)} &euro;</span>
              {item.trip.originalPrice && (
                <span className="text-sm text-muted-foreground line-through">{item.trip.originalPrice.toFixed(2)} &euro;</span>
              )}
              <span className="text-xs text-muted-foreground">/ person</span>
            </div>
            {item.trip.description && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">{item.trip.description}</p>
            )}
            {item.trip.highlights && item.trip.highlights.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.trip.highlights.slice(0, 5).map((h) => (
                  <span key={h} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">{h}</span>
                ))}
              </div>
            )}

            {/* View full details link */}
            <Link
              href={`/trip/${item.trip.id}`}
              className="mt-3 inline-flex text-xs font-medium text-primary hover:underline"
            >
              View full details
            </Link>
          </div>

          {/* Booking iframe */}
          <div className="border-t border-border">
            <div className="booking-iframe-wrap">
              <iframe
                src="https://sightseeingluxembourg.palisis.com/?book-direct=r-8146"
                title={`Book ${item.trip.title}`}
                className="booking-iframe"
                allow="payment"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
