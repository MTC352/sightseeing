"use client"

import Image from "next/image"
import Link from "next/link"
import { Star, Clock, ShoppingBag, Check, Plus, Sun } from "lucide-react"
import type { Trip } from "@/lib/data"
import { useCart } from "@/lib/cart-context"
import { useIsGoodWeatherForTrip } from "@/lib/weather-context"

export function TripCard({ trip, priority = false, variant = "default" }: { trip: Trip; priority?: boolean; variant?: "default" | "horizontal" | "small" }) {
  const { addItem, isInCart } = useCart()
  const inCart = isInCart(trip.id)
  const goodWeather = useIsGoodWeatherForTrip(trip.category)

  if (variant === "small") {
    return (
      <Link href={`/trip/${trip.slug ?? trip.id}`} className="group flex gap-3 rounded-lg border border-border bg-card p-2 transition-colors hover:border-primary/30">
        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md">
          <Image src={trip.image || "/placeholder.svg"} alt={`${trip.title} — ${trip.category} in ${trip.city ?? "Luxembourg"}`} fill priority={priority} className="object-cover" sizes="80px" />
        </div>
        <div className="flex flex-1 flex-col justify-center gap-0.5">
          <p className="text-xs font-semibold text-card-foreground line-clamp-2 group-hover:text-primary transition-colors">{trip.title}</p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{trip.rating}</span>
            <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{trip.duration}</span>
          </div>
          <p className="text-xs font-bold text-primary">From {trip.price.toFixed(2)} &euro;</p>
        </div>
      </Link>
    )
  }

  if (variant === "horizontal") {
    return (
      <div className="group flex overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
        <Link href={`/trip/${trip.slug ?? trip.id}`} className="relative h-36 w-40 shrink-0 overflow-hidden sm:w-48">
          <Image src={trip.image || "/placeholder.svg"} alt={`${trip.title} — ${trip.category} in ${trip.city ?? "Luxembourg"}`} fill priority={priority} className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="200px" />
          {trip.badge && <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">{trip.badge}</span>}
        </Link>
        <div className="flex flex-1 flex-col justify-between p-3">
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{trip.category}</span>
            <Link href={`/trip/${trip.slug ?? trip.id}`} className="mt-0.5 block text-sm font-semibold text-card-foreground line-clamp-2 group-hover:text-primary transition-colors">{trip.title}</Link>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{trip.rating} ({trip.reviewCount})</span>
              <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{trip.duration}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-foreground">From {trip.price.toFixed(2)} &euro;</span>
            <Link href={`/trip/${trip.slug ?? trip.id}`} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">Buy Tickets</Link>
          </div>
        </div>
      </div>
    )
  }

  /* default card */
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Image — bottom corners are square so card body sits flush */}
      <Link href={`/trip/${trip.slug ?? trip.id}`} className="relative aspect-[4/3] overflow-hidden rounded-b-none">
        <Image src={trip.image || "/placeholder.svg"} alt={`${trip.title} — ${trip.category} in ${trip.city ?? "Luxembourg"}`} fill priority={priority} className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
        {trip.badge && <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-sm">{trip.badge}</span>}
        {trip.originalPrice && <span className="absolute right-3 top-3 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">-{Math.round((1 - trip.price / trip.originalPrice) * 100)}%</span>}
        {/* Good for weather badge */}
        {goodWeather && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold text-amber-900 shadow backdrop-blur-sm">
            <Sun className="h-2.5 w-2.5" />
            Good for today
          </span>
        )}
        {/* Add to Triplist — appears on card hover */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); addItem(trip) }}
          disabled={inCart}
          className={`absolute bottom-2 right-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-md backdrop-blur-sm transition-all duration-200
            ${inCart
              ? "bg-primary text-primary-foreground opacity-100"
              : "bg-background/90 text-foreground opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-primary-foreground"
            }`}
        >
          {inCart ? <><Check className="h-3 w-3" /> Added</> : <><Plus className="h-3 w-3" /> Add to Triplist</>}
        </button>
      </Link>

      {/* Card body — 10px padding as requested */}
      <div className="flex flex-1 flex-col p-[10px]">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{trip.category}</span>
        <Link href={`/trip/${trip.slug ?? trip.id}`} className="mt-1 block text-sm font-semibold text-card-foreground line-clamp-2 group-hover:text-primary transition-colors">{trip.title}</Link>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{trip.rating} ({trip.reviewCount})</span>
          <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{trip.duration}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            {trip.originalPrice && <span className="text-xs text-muted-foreground line-through">{trip.originalPrice.toFixed(2)} &euro;</span>}
            <span className="block text-base font-bold text-foreground">From {trip.price.toFixed(2)} &euro;</span>
          </div>
          <Link href={`/trip/${trip.slug ?? trip.id}`} className="rounded-xl bg-primary px-5 py-2 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">Buy Tickets</Link>
        </div>
      </div>
    </div>
  )
}

/** Compact skeleton matching the "small" TripCard variant — used by the
 *  homepage "Recently Viewed" rail. */
export function TripCardSmallSkeleton() {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-2">
      <div className="h-16 w-20 shrink-0 animate-pulse rounded-md bg-muted" />
      <div className="flex flex-1 flex-col justify-center gap-1.5">
        <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-3/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

/**
 * Skeleton placeholder matching the default <TripCard /> layout exactly,
 * so loading the homepage Trending section (and other grids that use this)
 * doesn't cause layout shift when the real cards swap in.
 */
export function TripCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="relative aspect-[4/3] animate-pulse bg-muted" />
      <div className="flex flex-1 flex-col p-[10px]">
        <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-muted" />
        <div className="mt-1.5 h-4 w-3/5 animate-pulse rounded bg-muted" />
        <div className="mt-2 flex items-center gap-3">
          <div className="h-3 w-12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="h-5 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-24 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  )
}
