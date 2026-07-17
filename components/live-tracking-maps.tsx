"use client"

import { useEffect } from "react"
import { Bus, TrainFront } from "lucide-react"

/**
 * Live tracking maps — GreatGuideMagic (GG) map widget.
 *
 * Both tour cards embed the GG map widget. The loader script scans the DOM
 * for `.gg-map-widget` elements and mounts a Leaflet map into each one, so
 * the widget divs must be rendered BEFORE the loader script executes — the
 * script is appended in an effect (after first paint) to guarantee that.
 *
 * To point a card at a different route later, change its `widget` config
 * below (token / center / zoom).
 */

const GG_LOADER_SRC = "https://remote.greatguidemagic.com/widget/map/loader.js"

type GgWidgetConfig = {
  token: string
  language: string
  zoom: string
  centerLat: string
  centerLng: string
}

const DEFAULT_WIDGET: GgWidgetConfig = {
  token: "QqZQdonBxy",
  language: "en",
  zoom: "13",
  centerLat: "49.6123327",
  centerLng: "6.1258432",
}

type TourMap = {
  key: string
  title: string
  icon: typeof Bus
  widget: GgWidgetConfig
}

const TOURS: TourMap[] = [
  { key: "bus", title: "Bus Tour", icon: Bus, widget: DEFAULT_WIDGET },
  { key: "train", title: "Train Tour", icon: TrainFront, widget: DEFAULT_WIDGET },
]

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      Live
    </span>
  )
}

function TourTrackingCard({ tour }: { tour: TourMap }) {
  const Icon = tour.icon
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-base font-bold text-foreground">{tour.title}</h2>
        </div>
        <LiveBadge />
      </div>

      {/* Live map (GG widget) */}
      <div className="relative aspect-[4/3]" data-no-edit>
        <div
          className="gg-map-widget absolute inset-0"
          style={{ height: "100%" }}
          data-token={tour.widget.token}
          data-language={tour.widget.language}
          data-zoom={tour.widget.zoom}
          data-center-lat={tour.widget.centerLat}
          data-center-lng={tour.widget.centerLng}
        />
      </div>
    </div>
  )
}

export function LiveTrackingMaps() {
  useEffect(() => {
    // Re-append the loader on every mount so client-side navigations
    // (where the previous script has already executed) still initialise
    // the freshly rendered widget divs.
    document
      .querySelectorAll(`script[src="${GG_LOADER_SRC}"]`)
      .forEach((el) => el.remove())
    const script = document.createElement("script")
    script.src = GG_LOADER_SRC
    script.defer = true
    document.body.appendChild(script)
    return () => {
      script.remove()
    }
  }, [])

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {TOURS.map((tour) => (
        <TourTrackingCard key={tour.key} tour={tour} />
      ))}
    </div>
  )
}
