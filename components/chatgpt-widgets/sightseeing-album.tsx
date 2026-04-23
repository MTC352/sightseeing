"use client"

import { useState } from "react"
import Image from "next/image"
import { Star, Clock, MapPin, ChevronLeft, ChevronRight, Heart, ExternalLink, Users, Globe } from "lucide-react"
import type { Trip } from "@/lib/data"
import { getTripDetail } from "@/lib/data"

interface SightseeingAlbumProps {
  trip: Trip
  onBook?: () => void
}

export function SightseeingAlbum({ trip, onBook }: SightseeingAlbumProps) {
  const detail = getTripDetail(trip.id)
  const gallery = detail?.gallery?.length ? detail.gallery : [trip.image]
  const [photoIdx, setPhotoIdx] = useState(0)
  const [liked, setLiked] = useState(false)

  const prev = () => setPhotoIdx((i) => (i > 0 ? i - 1 : gallery.length - 1))
  const next = () => setPhotoIdx((i) => (i < gallery.length - 1 ? i + 1 : 0))

  return (
    <div className="flex flex-col">
      {/* Hero gallery */}
      <div className="relative h-[260px] w-full overflow-hidden bg-muted">
        <Image
          src={gallery[photoIdx]}
          alt={`${trip.title} - photo ${photoIdx + 1}`}
          fill
          className="object-cover transition-opacity duration-300"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />

        {/* Nav arrows */}
        {gallery.length > 1 && (
          <>
            <button type="button" onClick={prev} className="absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60" aria-label="Previous photo">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={next} className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60" aria-label="Next photo">
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Indicators */}
        {gallery.length > 1 && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1">
            {gallery.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === photoIdx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />
            ))}
          </div>
        )}

        {/* Like button */}
        <button
          type="button"
          onClick={() => setLiked(!liked)}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          aria-label={liked ? "Unlike" : "Like"}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-red-500 text-red-500" : ""}`} />
        </button>

        {/* Category badge */}
        <span className="absolute left-3 top-3 rounded-full bg-primary/90 px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground backdrop-blur-sm">
          {trip.category}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-4 p-4">
        {/* Title & rating */}
        <div>
          <h3 className="text-lg font-bold leading-tight text-foreground text-balance">{trip.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /><b className="text-foreground">{trip.rating}</b> ({trip.reviewCount})</span>
            <span className="flex items-center gap-0.5"><Clock className="h-3.5 w-3.5" />{trip.duration}</span>
            {trip.city && <span className="flex items-center gap-0.5"><MapPin className="h-3.5 w-3.5" />{trip.city}</span>}
          </div>
        </div>

        {/* Description */}
        {detail?.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{detail.description}</p>
        )}

        {/* Highlights */}
        {detail?.highlights && detail.highlights.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {detail.highlights.map((h) => (
              <span key={h} className="rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-[11px] text-muted-foreground">{h}</span>
            ))}
          </div>
        )}

        {/* Quick info */}
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-secondary/30 p-3">
          <div className="flex flex-col items-center gap-0.5 text-center">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-[10px] text-muted-foreground">Group size</span>
            <span className="text-xs font-semibold text-foreground">Max {detail?.maxGroupSize ?? 20}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 text-center">
            <Globe className="h-4 w-4 text-primary" />
            <span className="text-[10px] text-muted-foreground">Languages</span>
            <span className="text-xs font-semibold text-foreground">{detail?.languages?.slice(0, 2).join(", ") ?? "EN, FR"}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 text-center">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-[10px] text-muted-foreground">Duration</span>
            <span className="text-xs font-semibold text-foreground">{trip.duration}</span>
          </div>
        </div>

        {/* Price & CTA */}
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div>
            <span className="text-xs text-muted-foreground">From</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-foreground">{trip.price > 0 ? `${trip.price.toFixed(2)}\u20AC` : "Free"}</span>
              {trip.originalPrice && <span className="text-sm text-muted-foreground line-through">{trip.originalPrice.toFixed(0)}&euro;</span>}
              <span className="text-xs text-muted-foreground">/ person</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onBook}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Save to Trip List
          </button>
        </div>

        <a href={`/trip/${trip.id}`} className="flex items-center justify-center gap-1 text-xs font-medium text-primary hover:underline">
          View full details on sightseeing.lu <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}
