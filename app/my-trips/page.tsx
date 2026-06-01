"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { useCart, type CartItem } from "@/lib/cart-context"
import { ShoppingBag, X, Trash2, Clock, Star, MapPin, Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export default function SavedTripsPage() {
  const { items, removeItem, clearCart, totalPrice, totalItems, hydrated } = useCart()
  const [selectedItem, setSelectedItem] = useState<CartItem | null>(null)

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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear All
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all saved trips?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {totalItems} {totalItems === 1 ? "experience" : "experiences"} from your saved trips. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={clearCart}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
              {/* Remove control */}
              <div className="flex items-center justify-end border-t border-border px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => removeItem(item.trip.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Estimated Total */}
        <div className="mt-6 rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Estimated Total</span>
            <span className="text-2xl font-bold text-foreground">{totalPrice.toFixed(2)} &euro;</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Tap a trip to book it securely via Palisis.
          </p>
        </div>
      </div>

      {/* Individual booking modal */}
      {selectedItem && (
        <BookingModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  )
}

/* ── Booking Modal ──────────────────────────────── */
function BookingModal({ item, onClose }: { item: CartItem; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-4">
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
      <div className="relative z-10 flex h-full max-h-screen w-full flex-col overflow-hidden border border-border bg-card shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl">
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
          <div className="relative h-44 sm:h-56">
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
            <div className="booking-iframe-wrap relative">
              {!loaded && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading booking options...</p>
                </div>
              )}
              <iframe
                src="https://sightseeingluxembourg.palisis.com/?book-direct=r-8146"
                title={`Book ${item.trip.title}`}
                className="booking-iframe"
                allow="payment"
                onLoad={() => setLoaded(true)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
