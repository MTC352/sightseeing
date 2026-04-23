"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import Image from "next/image"
import { Star, Clock, X, Maximize2 } from "lucide-react"
import type { Trip } from "@/lib/data"
import { photoSpots, type PhotoSpot } from "@/lib/data"

const CITY_COORDS: Record<string, [number, number]> = {
  "Luxembourg":        [6.1319, 49.6117],
  "Echternach":        [6.4215, 49.8118],
  "Grevenmacher":      [6.4407, 49.6747],
  "Haut-Martelange":   [5.7437, 49.8320],
  "Bascharage":        [5.9075, 49.5650],
  "Beaufort":          [6.2893, 49.8362],
  "Remerschen":        [6.3658, 49.4912],
  "Wellenstein":       [6.3477, 49.5119],
  "Wormeldange":       [6.4050, 49.6090],
  "Ehnen":             [6.4100, 49.6300],
  "Diekirch":          [6.1597, 49.8683],
  "Esch-sur-Alzette":  [5.9806, 49.4958],
  "Bech-Kleinmacher":  [6.3640, 49.5250],
  "Losheim am See":    [6.7449, 49.5100],
  "Vianden":           [6.2087, 49.9352],
  "Clervaux":          [6.0287, 50.0545],
  "Ettelbruck":        [6.1042, 49.8473],
  "Mersch":            [6.1067, 49.7495],
  "Wiltz":             [5.9333, 49.9667],
  "Remich":            [6.3667, 49.5450],
  "Mondorf-les-Bains": [6.2800, 49.5050],
}

function tripToCoords(trip: Trip, index: number): [number, number] {
  const base = CITY_COORDS[trip.city ?? "Luxembourg"] ?? CITY_COORDS["Luxembourg"]
  const seed = parseInt(trip.id, 10) || index
  const jitterLng = ((seed * 7 + 3) % 20 - 10) * 0.002
  const jitterLat = ((seed * 11 + 5) % 20 - 10) * 0.002
  return [base[0] + jitterLng, base[1] + jitterLat]
}

const LUX_CENTER: [number, number] = [6.13, 49.61]

const CAMERA_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"',
  ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"',
  ' stroke-linejoin="round">',
  '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>',
  '<circle cx="12" cy="13" r="3"/>',
  "</svg>",
].join("")

interface SightseeingMapProps {
  trips: Trip[]
  onSelect?: (trip: Trip) => void
  visible?: boolean
}

export function SightseeingMap({ trips, onSelect, visible = true }: SightseeingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const mapboxRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const photoMarkersRef = useRef<any[]>([])

  const [selected, setSelected] = useState<Trip | null>(null)
  const [selectedSpot, setSelectedSpot] = useState<PhotoSpot | null>(null)
  const [showPhotoSpots, setShowPhotoSpots] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  // Init map once
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        let token = ""
        try {
          const res = await fetch("/api/mapbox-token")
          const data = await res.json()
          token = data.token ?? ""
        } catch { /* ignore token fetch errors */ }
        if (!token) { setMapError("Mapbox token not configured"); return }
        if (cancelled || !containerRef.current) return

        const mapboxModule = await import("mapbox-gl")
        const mapboxgl = mapboxModule.default ?? mapboxModule
        if (cancelled || !containerRef.current) return

        mapboxgl.accessToken = token
        mapboxRef.current = mapboxgl

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/light-v11",
          center: LUX_CENTER,
          zoom: 8.5,
          attributionControl: false,
        })

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
        map.on("load", () => { if (!cancelled) { mapRef.current = map; setMapReady(true) } })
        map.on("error", () => {})
      } catch (err: any) {
        if (!cancelled) setMapError(err?.message ?? "Failed to load map")
      }
    }

    init()

    return () => {
      cancelled = true
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      photoMarkersRef.current.forEach((m) => m.remove())
      photoMarkersRef.current = []
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      setMapReady(false)
    }
  }, [])

  // Sync trip markers when trips or map readiness changes
  useEffect(() => {
    const map = mapRef.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl || !mapReady) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    trips.forEach((trip, i) => {
      const [lng, lat] = tripToCoords(trip, i)
      const el = document.createElement("button")
      el.className = "sightseeing-map-pin"
      el.setAttribute("aria-label", trip.title)
      el.innerHTML = `<span class="sightseeing-map-pin-label">${trip.price > 0 ? trip.price.toFixed(0) + "\u20AC" : "Free"}</span>`
      el.addEventListener("click", () => {
        setSelected((prev) => (prev?.id === trip.id ? null : trip))
        setSelectedSpot(null)
      })
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map)
      markersRef.current.push(marker)
    })

    if (trips.length > 1) {
      const bounds = new mapboxgl.LngLatBounds()
      trips.forEach((t, i) => { const [lng, lat] = tripToCoords(t, i); bounds.extend([lng, lat]) })
      map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 600 })
    } else if (trips.length === 1) {
      const [lng, lat] = tripToCoords(trips[0], 0)
      map.flyTo({ center: [lng, lat], zoom: 13, duration: 600 })
    }
  }, [trips, mapReady])

  // Sync photo spot markers
  useEffect(() => {
    const map = mapRef.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl || !mapReady) return

    photoMarkersRef.current.forEach((m) => m.remove())
    photoMarkersRef.current = []

    if (!showPhotoSpots || trips.length === 0) return

    photoSpots.forEach((spot) => {
      const el = document.createElement("button")
      el.className = "sightseeing-photo-pin"
      el.setAttribute("aria-label", spot.name)
      el.innerHTML = CAMERA_SVG
      el.addEventListener("click", () => {
        setSelectedSpot((prev) => (prev?.id === spot.id ? null : spot))
        setSelected(null)
      })
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(spot.coords).addTo(map)
      photoMarkersRef.current.push(marker)
    })

    return () => {
      photoMarkersRef.current.forEach((m) => m.remove())
      photoMarkersRef.current = []
    }
  }, [trips, mapReady, showPhotoSpots])

  // Resize + refit whenever the panel becomes visible or goes fullscreen
  useEffect(() => {
    const timer = setTimeout(() => {
      const map = mapRef.current
      const mapboxgl = mapboxRef.current
      if (!map) return
      map.resize()
      if (!mapboxgl || trips.length === 0) return
      if (trips.length > 1) {
        const bounds = new mapboxgl.LngLatBounds()
        trips.forEach((t, i) => { const [lng, lat] = tripToCoords(t, i); bounds.extend([lng, lat]) })
        map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 400 })
      } else {
        const [lng, lat] = tripToCoords(trips[0], 0)
        map.flyTo({ center: [lng, lat], zoom: 13, duration: 400 })
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [isFullscreen, visible, trips])

  const handleCardClick = useCallback(() => {
    if (selected && onSelect) onSelect(selected)
  }, [selected, onSelect])

  return (
    <div className={`relative flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-background" : ""}`}>

      {/* Controls header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowPhotoSpots(!showPhotoSpots)}
            className={`flex h-7 items-center gap-1 rounded-full border px-2 text-[10px] font-medium transition-colors ${
              showPhotoSpots
                ? "border-amber-400/50 bg-amber-50 text-amber-700"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            <span dangerouslySetInnerHTML={{ __html: CAMERA_SVG }} />
            Photo spots
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border transition-colors hover:bg-secondary"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Map canvas */}
      <div className={`relative ${isFullscreen ? "flex-1" : "h-[320px]"}`}>
        <div ref={containerRef} className="absolute inset-0" />
        {!mapReady && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Loading map...</span>
            </div>
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <p className="text-xs text-destructive">{mapError}</p>
          </div>
        )}
      </div>

      {/* Photo spot popup */}
      {selectedSpot && (
        <div className="border-t border-border p-3">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <span dangerouslySetInnerHTML={{ __html: CAMERA_SVG }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">{selectedSpot.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{selectedSpot.description}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSpot(null)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Trip popup */}
      {selected && (
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={handleCardClick}
            className="-m-2 flex w-full gap-3 rounded-xl p-2 text-left transition-colors hover:bg-secondary/50"
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
              <Image
                src={selected.image}
                alt={selected.title}
                fill
                className="object-cover"
                sizes="64px"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-xs font-medium text-primary">{selected.category}</p>
              <p className="truncate text-sm font-semibold text-foreground">{selected.title}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {selected.rating}
                </span>
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  {selected.duration}
                </span>
              </div>
            </div>
            <span className="shrink-0 text-sm font-bold text-foreground">
              {selected.price > 0 ? `${selected.price.toFixed(0)}\u20AC` : "Free"}
            </span>
          </button>
        </div>
      )}

    </div>
  )
}
