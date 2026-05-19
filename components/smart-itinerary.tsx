"use client"

import { useState, useCallback } from "react"
import { useCart } from "@/lib/cart-context"
import Link from "next/link"
import Image from "next/image"
import { Route, Sparkles, Clock, MapPin, Lightbulb, ChevronDown, ChevronUp, Bus, Car, Building2, ArrowRight, Star } from "lucide-react"
import { ItineraryTimeslots } from "@/components/timeslot-chips"

interface ItineraryStep {
  time: string
  tripTitle: string
  tripId: string
  durationMinutes: number
  travelToNext: string | null
}

interface Listing {
  name: string
  category?: string
  area?: string
  price: number
  image: string
  provider?: string
  stars?: number
  badge: string | null
}

interface CrossSell {
  recommended: boolean
  reason: string
  area?: string
  listings?: Listing[]
}

interface Itinerary {
  steps: ItineraryStep[]
  summary: string
  tips: string[]
  carSuggestion?: CrossSell
  hotelSuggestion?: CrossSell
}

export function SmartItinerary() {
  const { items } = useCart()
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState(true)

  const generate = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const trips = items.map(i => ({
        id: i.trip.id,
        title: i.trip.title,
        city: i.trip.city,
        duration: i.trip.duration,
        category: i.trip.category,
      }))
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trips }),
      })
      if (!res.ok) throw new Error("Failed to generate")
      const data = await res.json()
      setItinerary(data)
    } catch {
      setError("Could not generate itinerary. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [items])

  if (items.length < 2) return null

  // Not yet generated
  if (!itinerary && !loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/5 shadow-sm">
        <div className="flex items-start gap-3 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Route className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-foreground">Smart Itinerary</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {"Let AI optimize your " + items.length + " saved trips into the perfect day plan -- sequenced by proximity with travel times."}
            </p>
            <button
              type="button"
              onClick={generate}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Build My Itinerary
            </button>
          </div>
        </div>
        {error && <p className="px-5 pb-3 text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 p-5">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-primary/10" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 animate-pulse rounded bg-muted" />
            <div className="h-3 w-48 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="border-t border-border px-5 py-4">
          <div className="ml-2 space-y-4 border-l-2 border-primary/20 pl-4">
            {Array.from({ length: items.length }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 pb-4 text-center">
          <p className="text-xs text-muted-foreground">Optimizing your day plan...</p>
        </div>
      </div>
    )
  }

  // Generated itinerary
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-secondary/30"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Route className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Your Day Itinerary</h3>
            <p className="text-xs text-muted-foreground">{itinerary!.steps.length} stops planned</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <>
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">{itinerary!.summary}</p>
          </div>

          {/* Timeline */}
          <div className="px-4 pb-4">
            <div className="relative ml-2 border-l-2 border-primary/20 pl-5">
              {itinerary!.steps.map((step, i) => (
                <div key={i} className="relative pb-5 last:pb-0">
                  {/* Timeline dot */}
                  <div className="absolute -left-[27px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-primary bg-background">
                    <span className="text-[7px] font-bold text-primary">{i + 1}</span>
                  </div>

                  {/* Step content */}
                  <div className="rounded-xl border border-border bg-secondary/30 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-primary">
                        <span className="text-[10px] font-medium text-muted-foreground">Suggested: </span>
                        {step.time}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {step.durationMinutes} min
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-foreground">{step.tripTitle}</p>
                    <ItineraryTimeslots tripId={step.tripId} suggestedTime={step.time} />
                  </div>

                  {/* Travel connector */}
                  {step.travelToNext && (
                    <div className="ml-1 mt-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                        <Bus className="h-3 w-3" />
                        <span>{step.travelToNext}</span>
                      </div>
                      <Link href="/cars" className="flex items-center gap-1.5 text-[10px] text-blue-500/70 transition-colors hover:text-blue-600">
                        <Car className="h-3 w-3" />
                        <span>{"or rent a car \u2014 from 39\u20AC/day"}</span>
                        <ArrowRight className="h-2.5 w-2.5" />
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          {itinerary!.tips && itinerary!.tips.length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                Tips
              </div>
              <ul className="mt-1.5 space-y-1">
                {itinerary!.tips.map((tip, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-relaxed">{"- " + tip}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Cross-sell: Car Rentals */}
          {itinerary!.carSuggestion?.recommended && (
            <div className="border-t border-border px-4 py-3">
              <div className="rounded-xl border border-blue-200/50 bg-blue-50/30 p-4 dark:border-blue-800/30 dark:bg-blue-900/10">
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <h4 className="text-sm font-semibold text-foreground">Rent a car</h4>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{itinerary!.carSuggestion.reason}</p>
                {itinerary!.carSuggestion.listings && (
                  <div className="mt-3 space-y-2">
                    {itinerary!.carSuggestion.listings.map((car) => (
                      <Link key={car.name} href="/cars" className="flex items-center gap-3 rounded-lg bg-background/80 p-2.5 transition-colors hover:bg-background">
                        <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg">
                          <Image src={car.image} alt={car.name} fill className="object-cover" sizes="80px" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-foreground">{car.name}</p>
                          <p className="text-[10px] text-muted-foreground">{car.category} &middot; {car.provider}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-foreground">{car.price}&euro;</span>
                          <p className="text-[10px] text-muted-foreground">per day</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                <Link href="/cars" className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-blue-100/50 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300">
                  Browse all car rentals <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}

          {/* Cross-sell: Hotels */}
          {itinerary!.hotelSuggestion?.recommended && (
            <div className="border-t border-border px-4 py-3">
              <div className="rounded-xl border border-amber-200/50 bg-amber-50/30 p-4 dark:border-amber-800/30 dark:bg-amber-900/10">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <h4 className="text-sm font-semibold text-foreground">{"Stay the night" + (itinerary!.hotelSuggestion.area ? ` near ${itinerary!.hotelSuggestion.area}` : "")}</h4>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{itinerary!.hotelSuggestion.reason}</p>
                {itinerary!.hotelSuggestion.listings && (
                  <div className="mt-3 space-y-2">
                    {itinerary!.hotelSuggestion.listings.map((hotel) => (
                      <Link key={hotel.name} href="/hotels" className="flex items-center gap-3 rounded-lg bg-background/80 p-2.5 transition-colors hover:bg-background">
                        <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg">
                          <Image src={hotel.image} alt={hotel.name} fill className="object-cover" sizes="80px" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-foreground">{hotel.name}</p>
                          <div className="flex items-center gap-1">
                            <div className="flex gap-0.5">
                              {Array.from({ length: hotel.stars || 3 }).map((_, i) => (
                                <Star key={i} className="h-2 w-2 fill-amber-400 text-amber-400" />
                              ))}
                            </div>
                            <span className="text-[10px] text-muted-foreground">{hotel.area}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-foreground">{hotel.price}&euro;</span>
                          <p className="text-[10px] text-muted-foreground">per night</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                <Link href="/hotels" className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-amber-100/50 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300">
                  Browse all hotels <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}


        </>
      )}
    </div>
  )
}
