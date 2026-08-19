"use client"

import { useState } from "react"
import Link from "next/link"
import { Pencil, ExternalLink } from "lucide-react"
import { TripSeoCell } from "@/components/admin/trip-seo-cell"
import { TripDeleteButton } from "./trip-delete-button"
import { TripToggleButton } from "./trip-toggle-button"
import { TripStatusButton } from "./trip-status-button"
import { TripArchiveButton } from "./trip-archive-button"
import { TripSyncButton } from "./trip-sync-button"
import { TripDeactivateButton } from "./trip-deactivate-button"

interface TripRowProps {
  trip: {
    id: string
    palisis_id: string | null
    title: string
    city: string
    category: string
    price: number
    originalPrice: number | null
    image: string
    featured: boolean
    status: string
    slug?: string | null
    seoScore?: number | null
  }
  isPalisis: boolean
  seoOptimized: boolean
  seoStale: boolean
}

export function TripRowClient({ trip, isPalisis, seoOptimized, seoStale }: TripRowProps) {
  const [status, setStatus] = useState(trip.status)
  const isDeactivated = status === "deactivated"

  return (
    <tr className={`group transition-colors hover:bg-secondary/40 ${isDeactivated ? "opacity-60" : ""}`}>
      {/* Trip info */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/trips/${trip.id}`}
            className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"
            title="Edit trip"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={trip.image} alt="" className="h-full w-full object-cover" />
          </Link>
          <div className="min-w-0">
            {isDeactivated ? (
              <span className="block truncate font-medium text-muted-foreground max-w-[220px] cursor-default" title="Reactivate trip to edit it">
                {trip.title}
              </span>
            ) : (
              <Link
                href={`/admin/trips/${trip.id}`}
                className="block truncate font-medium text-foreground max-w-[220px] hover:text-primary hover:underline underline-offset-2"
                title="Edit trip"
              >
                {trip.title}
              </Link>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-muted-foreground">{trip.city}</p>
              {isPalisis ? (
                <span className="inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold bg-blue-500/12 text-blue-600 ring-1 ring-inset ring-blue-500/20">
                  Palisis
                </span>
              ) : (
                <span className="inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold bg-slate-400/10 text-slate-500 ring-1 ring-inset ring-slate-400/20">
                  Manual
                </span>
              )}
              <TripSeoCell
                tripId={trip.id}
                tripTitle={trip.title}
                tripImage={trip.image}
                optimized={seoOptimized}
                stale={seoStale}
                seoScore={typeof trip.seoScore === "number" ? trip.seoScore : null}
              />
            </div>
          </div>
        </div>
      </td>

      {/* Category */}
      <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{trip.category}</td>

      {/* Price */}
      <td className="hidden px-4 py-3 text-foreground sm:table-cell">
        {trip.originalPrice && (
          <span className="mr-1.5 text-xs text-muted-foreground/60 line-through">€{trip.originalPrice}</span>
        )}
        €{trip.price}
      </td>

      {/* Featured toggle */}
      <td className="hidden px-4 py-3 text-center md:table-cell">
        <TripToggleButton tripId={trip.id} field="featured" value={trip.featured} disabled={isDeactivated} />
      </td>

      {/* Status badge */}
      <td className="px-4 py-3">
        <TripStatusButton tripId={trip.id} status={status} onStatusChange={setStatus} />
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {isDeactivated ? (
            <span className="rounded-lg p-2 text-muted-foreground/25 cursor-not-allowed" title="Trip is deactivated — not visible on site">
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
          ) : (
            <Link
              href={`/trip/${trip.slug ?? trip.id}`}
              target="_blank"
              className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
              title="View on site"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          {isDeactivated ? (
            <span className="rounded-lg p-2 text-muted-foreground/25 cursor-not-allowed" title="Reactivate trip to edit it">
              <Pencil className="h-3.5 w-3.5" />
            </span>
          ) : (
            <Link
              href={`/admin/trips/${trip.id}`}
              className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          )}
          <TripSyncButton palisisId={trip.palisis_id} disabled={isDeactivated} />
          <TripDeactivateButton tripId={trip.id} status={status} onStatusChange={setStatus} />
          <TripArchiveButton tripId={trip.id} isArchived={false} />
          <TripDeleteButton tripId={trip.id} tripTitle={trip.title} />
        </div>
      </td>
    </tr>
  )
}
