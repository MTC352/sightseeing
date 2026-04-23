"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import Image from "next/image"
import { Star, Clock, ChevronLeft, ChevronRight, MapPin } from "lucide-react"
import type { Trip } from "@/lib/data"

interface SightseeingCarouselProps {
  trips: Trip[]
  onSelect?: (trip: Trip) => void
}

export function SightseeingCarousel({ trips, onSelect }: SightseeingCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)

  const check = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => { check() }, [check])

  const scroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 260, behavior: "smooth" })
    setTimeout(check, 350)
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
            <MapPin className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Discover Luxembourg</h3>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => scroll(-1)}
            disabled={!canLeft}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-secondary disabled:opacity-30"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            disabled={!canRight}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-secondary disabled:opacity-30"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={check}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {trips.map((trip) => (
          <button
            key={trip.id}
            type="button"
            onClick={() => onSelect?.(trip)}
            className="group w-[240px] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-primary/30 hover:shadow-sm"
          >
            <div className="relative h-[140px] w-full overflow-hidden">
              <Image src={trip.image} alt={trip.title} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="240px" />
              {trip.badge && (
                <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">{trip.badge}</span>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6">
                <p className="text-xs font-medium text-white/80">{trip.category}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 p-3">
              <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">{trip.title}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {trip.rating}
                </span>
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  {trip.duration}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-foreground">{trip.price > 0 ? `${trip.price.toFixed(0)}\u20AC` : "Free"}</span>
                {trip.originalPrice && (
                  <span className="text-[10px] text-muted-foreground line-through">{trip.originalPrice.toFixed(0)}&euro;</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
