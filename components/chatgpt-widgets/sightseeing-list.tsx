"use client"

import { useState } from "react"
import Image from "next/image"
import { Star, Clock, Heart, ExternalLink, MapPin, ShoppingBag, Check } from "lucide-react"
import type { Trip } from "@/lib/data"
import { useCart } from "@/lib/cart-context"

interface SightseeingListProps {
  trips: Trip[]
  onSelect?: (trip: Trip) => void
}

export function SightseeingList({ trips, onSelect }: SightseeingListProps) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const { addItem, isInCart } = useCart()

  const toggleFav = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 pb-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
          <MapPin className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Top Experiences in Luxembourg</h3>
        <span className="ml-auto text-xs text-muted-foreground">{trips.length} results</span>
      </div>

      {trips.map((trip, i) => (
        <div
          key={trip.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect?.(trip)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(trip) } }}
          className="group flex cursor-pointer gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/30 hover:shadow-sm"
        >
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
            <Image src={trip.image} alt={trip.title} fill className="object-cover" sizes="80px" />
            <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/80 text-[10px] font-bold text-background">
              {i + 1}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-primary">{trip.category}</p>
              <p className="truncate text-sm font-semibold text-foreground">{trip.title}</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {trip.rating}
              </span>
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {trip.duration}
              </span>
              {trip.city && (
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {trip.city}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end justify-between gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleFav(trip.id) }}
              className="rounded-full p-1 transition-colors hover:bg-secondary"
              aria-label={favorites.has(trip.id) ? "Remove from favorites" : "Add to favorites"}
            >
              <Heart className={`h-4 w-4 transition-colors ${favorites.has(trip.id) ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
            </button>
            <div className="text-right">
              {trip.originalPrice && (
                <span className="text-[10px] text-muted-foreground line-through">{trip.originalPrice.toFixed(0)}&euro;</span>
              )}
              <p className="text-sm font-bold text-foreground">{trip.price > 0 ? `${trip.price.toFixed(0)}\u20AC` : "Free"}</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); addItem(trip) }}
              disabled={isInCart(trip.id)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                isInCart(trip.id)
                  ? "bg-primary/10 text-primary"
                  : "border border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-primary"
              }`}
              aria-label={isInCart(trip.id) ? "Added to trip" : "Add to trip"}
            >
              {isInCart(trip.id) ? <Check className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
              {isInCart(trip.id) ? "Added" : "Add"}
            </button>
          </div>
        </div>
      ))}

      <div className="flex justify-center pt-1">
        <a href="/explore" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          View all on sightseeing.lu <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}
