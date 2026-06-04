"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import Image from "next/image"
import { Star, Clock, X, Maximize2 } from "lucide-react"
import type { Trip } from "@/lib/data"
import type { TravelMethod } from "@/components/sidebar-itinerary"

/** Map a chosen travel mode to the matching Mapbox Directions profile so the
 *  canvas route follows the SAME roads the PDF + deep link will use. */
function methodToMapboxProfile(m: TravelMethod | undefined): "driving" | "walking" | "cycling" {
  return m === "walk" ? "walking" : m === "cycle" ? "cycling" : "driving"
}

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

/** Stops that genuinely share a location keep the SAME coordinate (so every pin
 *  points to the exact same spot) but each pin in the group leans by a different
 *  angle, fanning out like a bouquet so they sit side-by-side and all stay
 *  individually clickable. Returns a lean angle (deg) per coordinate, symmetric
 *  about vertical (e.g. two pins → -13°/+13°, three → -26°/0°/+26°). */
function computeTilts(coords: [number, number][]): number[] {
  const groups = new Map<string, number[]>()
  coords.forEach(([lng, lat], i) => {
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`
    const arr = groups.get(key) ?? []
    arr.push(i)
    groups.set(key, arr)
  })
  const tilts = new Array<number>(coords.length).fill(0)
  groups.forEach((idxs) => {
    const n = idxs.length
    if (n <= 1) return
    const stepDeg = Math.min(26, 70 / (n - 1))
    idxs.forEach((markerIdx, k) => {
      tilts[markerIdx] = (k - (n - 1) / 2) * stepDeg
    })
  })
  return tilts
}

const LUX_CENTER: [number, number] = [6.13, 49.61]

interface SightseeingMapProps {
  trips: Trip[]
  onSelect?: (trip: Trip) => void
  visible?: boolean
  /** When true, forces the map to exit fullscreen so a sibling overlay (e.g. the itinerary panel) is not obscured. */
  suppressFullscreen?: boolean
  /**
   * Ordered list of trips making up the user's day itinerary. When present:
   *   - Replaces the generic price pins with numbered 1..N pins in stop order.
   *   - Draws a connecting route polyline between stops (Mapbox driving directions).
   *   - Auto-fits bounds to the itinerary instead of the search results.
   * Pass [] or undefined to fall back to normal trips-mode rendering.
   */
  itineraryTrips?: Trip[]
  /** Real per-stop coordinates [lng, lat] aligned 1:1 with itineraryTrips. A
   *  null entry falls back to the city-derived approximation. Drives accurate
   *  marker placement so identical locations land on the same spot. */
  itineraryCoords?: ([number, number] | null)[]
  /** Full-step index that each rendered marker maps back to, aligned 1:1 with
   *  itineraryTrips. Lets the map speak the SAME index space as the itinerary
   *  panel (which indexes by full itinerary.steps) even when some steps are
   *  skipped here. Defaults to the identity [0,1,2,…] when omitted. */
  itineraryStepIndices?: number[]
  /** Index (full-step space) of the currently-focused stop (from the itinerary
   *  list). Highlights that numbered pin and recentres the map on it. */
  activeStopIndex?: number | null
  /** Index of the currently-focused travel leg (stop i → i+1). Highlights that
   *  route segment. */
  activeLegIndex?: number | null
  /** Fired when the user clicks a numbered stop pin — lets the parent scroll the
   *  matching itinerary card into view. */
  onStopClick?: (index: number) => void
  /** Fired when the user clicks a route segment — lets the parent scroll the
   *  matching "Travel to next stop" block into view. */
  onLegClick?: (index: number) => void
  /** Selected travel mode per leg, keyed by the FROM-step (full) index — the
   *  same index space as itineraryStepIndices. Each leg's route is fetched with
   *  the matching Mapbox profile so the canvas matches the PDF + deep link.
   *  Undefined entries default to driving. */
  legMethods?: Record<number, TravelMethod>
}

export function SightseeingMap({ trips, onSelect, visible = true, suppressFullscreen = false, itineraryTrips, itineraryCoords, itineraryStepIndices, activeStopIndex = null, activeLegIndex = null, onStopClick, onLegClick, legMethods }: SightseeingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const mapboxRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const itineraryMarkersRef = useRef<any[]>([])
  const itineraryMarkerElsRef = useRef<HTMLButtonElement[]>([])
  const itineraryCoordsRef = useRef<[number, number][]>([])
  // Full-step index for each rendered marker (parallel to itineraryCoordsRef).
  // Lets the active-stop effect find the local marker for a full-step index.
  const itineraryStepIndicesRef = useRef<number[]>([])
  const tokenRef = useRef<string>("")
  // Mirror callbacks + active indices into refs so the heavy marker/route effect
  // doesn't need them in its dependency array (which would tear down and rebuild
  // the whole route on every parent re-render).
  const onStopClickRef = useRef<typeof onStopClick>(onStopClick)
  const onLegClickRef = useRef<typeof onLegClick>(onLegClick)
  const activeStopIndexRef = useRef<number | null>(activeStopIndex)
  const activeLegIndexRef = useRef<number | null>(activeLegIndex)
  useEffect(() => { onStopClickRef.current = onStopClick }, [onStopClick])
  useEffect(() => { onLegClickRef.current = onLegClick }, [onLegClick])
  const itineraryMode = !!(itineraryTrips && itineraryTrips.length > 0)

  // Stable route-layer event handlers (so on/off use the same reference).
  const handleRouteClick = useCallback((e: any) => {
    const li = e?.features?.[0]?.properties?.legIndex
    if (typeof li === "number") onLegClickRef.current?.(li)
  }, [])
  const handleRouteEnter = useCallback(() => {
    const m = mapRef.current
    if (m) m.getCanvas().style.cursor = "pointer"
  }, [])
  const handleRouteLeave = useCallback(() => {
    const m = mapRef.current
    if (m) m.getCanvas().style.cursor = ""
  }, [])

  const [selected, setSelected] = useState<Trip | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  // Auto-exit fullscreen whenever the parent flags a higher-priority overlay (e.g. the itinerary panel)
  useEffect(() => {
    if (suppressFullscreen && isFullscreen) setIsFullscreen(false)
  }, [suppressFullscreen, isFullscreen])

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
        tokenRef.current = token

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
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      setMapReady(false)
    }
  }, [])

  // Sync trip markers when the underlying SET of trips (or map readiness)
  // changes. Keying the effect on a string signature of trip ids — not
  // the array reference — stops Mapbox from tearing down and recreating
  // every pin on every parent re-render. That was the source of the
  // "pins blink / camera jitters" feel during typing or chat streaming.
  // In itinerary-mode we hide these generic price pins so the numbered
  // itinerary pins (rendered by the effect below) own the visual.
  const tripsSig = trips.map((t) => `${t.id}:${t.price}`).join("|")
  useEffect(() => {
    const map = mapRef.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl || !mapReady) return

    if (itineraryMode) {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      return
    }

    // Build the new markers up-front, then swap them in one paint to
    // avoid the "icons popping in one by one" effect.
    const newMarkers: any[] = []
    trips.forEach((trip, i) => {
      const [lng, lat] = tripToCoords(trip, i)
      const el = document.createElement("button")
      el.className = "sightseeing-map-pin"
      el.setAttribute("aria-label", trip.title)
      el.innerHTML = `<span class="sightseeing-map-pin-label">${trip.price > 0 ? trip.price.toFixed(0) + "\u20AC" : "Free"}</span>`
      el.addEventListener("click", () => {
        setSelected((prev) => (prev?.id === trip.id ? null : trip))
      })
      newMarkers.push(new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map))
    })
    // Swap atomically so the user never sees a half-empty map.
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = newMarkers

    if (trips.length > 1) {
      const bounds = new mapboxgl.LngLatBounds()
      trips.forEach((t, i) => { const [lng, lat] = tripToCoords(t, i); bounds.extend([lng, lat]) })
      map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 600 })
    } else if (trips.length === 1) {
      const [lng, lat] = tripToCoords(trips[0], 0)
      map.flyTo({ center: [lng, lat], zoom: 13, duration: 600 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripsSig, mapReady, itineraryMode])

  // ─── Itinerary markers + route polyline ────────────────────────────────
  // Draws numbered stop pins (1..N) and a driving route polyline between
  // them whenever `itineraryTrips` is provided. Re-runs when the plan
  // changes. Uses the Mapbox Directions API client-side (the public token
  // is already loaded) so we don't need a new backend endpoint.
  useEffect(() => {
    const map = mapRef.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl || !mapReady) return

    // Clear any prior itinerary markers / route + detach route handlers
    itineraryMarkersRef.current.forEach((m) => m.remove())
    itineraryMarkersRef.current = []
    itineraryMarkerElsRef.current = []
    if (map.getLayer("itinerary-route-line")) {
      map.off("click", "itinerary-route-line", handleRouteClick)
      map.off("mouseenter", "itinerary-route-line", handleRouteEnter)
      map.off("mouseleave", "itinerary-route-line", handleRouteLeave)
    }
    if (map.getLayer("itinerary-route-highlight")) map.removeLayer("itinerary-route-highlight")
    if (map.getLayer("itinerary-route-line")) map.removeLayer("itinerary-route-line")
    if (map.getLayer("itinerary-route-casing")) map.removeLayer("itinerary-route-casing")
    if (map.getSource("itinerary-route")) map.removeSource("itinerary-route")

    if (!itineraryTrips || itineraryTrips.length === 0) {
      itineraryCoordsRef.current = []
      return
    }

    // Prefer REAL per-stop coordinates; fall back to the city approximation
    // only when a stop has no geocode. Stops that share a location keep the
    // SAME coordinate and instead lean apart visually (see computeTilts).
    const coords: [number, number][] = itineraryTrips.map((t, i) => {
      const real = itineraryCoords?.[i]
      return (real ?? tripToCoords(t, i)) as [number, number]
    })
    const tilts = computeTilts(coords)
    itineraryCoordsRef.current = coords
    // Full-step index per rendered marker (identity when not provided).
    const stepIndices = itineraryTrips.map((_, i) => itineraryStepIndices?.[i] ?? i)
    itineraryStepIndicesRef.current = stepIndices

    // ROUTE points are only the stops with a REAL geocode — never the city
    // jitter fallback. This keeps the green line honest (no fake detours) AND
    // makes the canvas route identical to the PDF map + maps deep link, which
    // also drop non-geocoded stops. Each point carries its FROM-stop full-step
    // index so leg identity / mode keying matches every surface. In the common
    // case (all stops geocoded) this equals every marker, so the line is
    // unchanged; it only diverges in the degraded non-geocoded case.
    const routePoints: { coord: [number, number]; stepIdx: number }[] = []
    itineraryTrips.forEach((_, i) => {
      const real = itineraryCoords?.[i]
      if (real) routePoints.push({ coord: real as [number, number], stepIdx: stepIndices[i] })
    })

    // Numbered pins
    itineraryTrips.forEach((trip, i) => {
      const [lng, lat] = coords[i]
      const stepIdx = stepIndices[i]
      const el = document.createElement("button")
      el.className = "sightseeing-map-itinerary-pin"
      if (stepIdx === activeStopIndexRef.current) el.classList.add("is-active")
      el.setAttribute("aria-label", `Stop ${i + 1}: ${trip.title}`)
      const tilt = tilts[i] ?? 0
      el.innerHTML =
        `<span class="sightseeing-pin-lean" style="transform: rotate(${tilt}deg)">` +
          `<span class="sightseeing-pin-shape">` +
            `<span class="sightseeing-pin-num" style="transform: rotate(${-tilt}deg)">${i + 1}</span>` +
          `</span>` +
        `</span>`
      el.addEventListener("click", (ev) => {
        ev.stopPropagation()
        setSelected((prev) => (prev?.id === trip.id ? null : trip))
        onStopClickRef.current?.(stepIdx)
      })
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([lng, lat])
        .addTo(map)
      itineraryMarkersRef.current.push(marker)
      itineraryMarkerElsRef.current.push(el)
    })

    // Fit bounds to the itinerary
    if (coords.length > 1) {
      const bounds = new mapboxgl.LngLatBounds()
      coords.forEach((c) => bounds.extend(c))
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 })
    } else {
      map.flyTo({ center: coords[0], zoom: 13, duration: 600 })
    }

    // Per-leg route segments. Each consecutive pair becomes its own LineString
    // feature tagged with `legIndex` so the list↔map sync can highlight and
    // click individual legs. Best-effort Mapbox Directions per leg; falls back
    // to a straight line so users always see the sequence.
    let cancelled = false
    const buildRoutes = async () => {
      const features: GeoJSON.Feature[] = []
      for (let i = 0; i < routePoints.length - 1; i++) {
        const a = routePoints[i].coord
        const b = routePoints[i + 1].coord
        const fromStepIdx = routePoints[i].stepIdx
        let geometry: GeoJSON.Geometry = { type: "LineString", coordinates: [a, b] }
        if (tokenRef.current) {
          try {
            // Route THIS leg with the visitor's selected mode (keyed by the
            // FROM-stop's full-step index) so the green line on the canvas
            // matches the PDF map + maps deep link exactly.
            const profile = methodToMapboxProfile(legMethods?.[fromStepIdx])
            const url =
              `https://api.mapbox.com/directions/v5/mapbox/${profile}/${a[0]},${a[1]};${b[0]},${b[1]}` +
              `?geometries=geojson&overview=full&access_token=${encodeURIComponent(tokenRef.current)}`
            const r = await fetch(url)
            if (r.ok) {
              const d = await r.json()
              const g = d?.routes?.[0]?.geometry
              if (g) geometry = g
            }
          } catch { /* keep straight-line fallback */ }
        }
        // Tag the leg with the FROM-stop's full-step index so the panel (which
        // indexes travel boxes by from-step) and the map agree on leg identity.
        features.push({ type: "Feature", properties: { legIndex: fromStepIdx }, geometry })
      }
      // Re-check AFTER the await chain so two rapid plan-rebuilds can't both
      // reach addSource and crash Mapbox with "Source already exists".
      if (cancelled || !mapRef.current || !mapReady) return
      const m = mapRef.current
      if (m.getSource("itinerary-route")) return
      m.addSource("itinerary-route", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      })
      m.addLayer({
        id: "itinerary-route-casing",
        type: "line",
        source: "itinerary-route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
      })
      m.addLayer({
        id: "itinerary-route-line",
        type: "line",
        source: "itinerary-route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#16a34a", "line-width": 3.5, "line-opacity": 0.95 },
      })
      m.addLayer({
        id: "itinerary-route-highlight",
        type: "line",
        source: "itinerary-route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#f97316", "line-width": 6, "line-opacity": 0.95 },
        filter: ["==", ["get", "legIndex"], activeLegIndexRef.current ?? -1],
      })
      m.on("click", "itinerary-route-line", handleRouteClick)
      m.on("mouseenter", "itinerary-route-line", handleRouteEnter)
      m.on("mouseleave", "itinerary-route-line", handleRouteLeave)
    }
    void buildRoutes()

    return () => {
      cancelled = true
      const m = mapRef.current
      if (m && m.getLayer && m.getLayer("itinerary-route-line")) {
        m.off("click", "itinerary-route-line", handleRouteClick)
        m.off("mouseenter", "itinerary-route-line", handleRouteEnter)
        m.off("mouseleave", "itinerary-route-line", handleRouteLeave)
      }
    }
  }, [itineraryTrips, itineraryCoords, itineraryStepIndices, legMethods, mapReady, handleRouteClick, handleRouteEnter, handleRouteLeave])

  // Active stop → toggle the `is-active` pin class + recentre on it. The
  // incoming index is in FULL-STEP space, so we match it against each marker's
  // mapped step index rather than its local position.
  useEffect(() => {
    activeStopIndexRef.current = activeStopIndex
    const stepIndices = itineraryStepIndicesRef.current
    itineraryMarkerElsRef.current.forEach((el, i) => {
      if (el) el.classList.toggle("is-active", stepIndices[i] === activeStopIndex)
    })
    const map = mapRef.current
    const coords = itineraryCoordsRef.current
    const localIdx = activeStopIndex == null ? -1 : stepIndices.indexOf(activeStopIndex)
    if (map && mapReady && localIdx >= 0 && coords[localIdx]) {
      map.flyTo({ center: coords[localIdx], zoom: Math.max(map.getZoom?.() ?? 13, 13), duration: 500 })
    }
  }, [activeStopIndex, mapReady])

  // Active leg → update the highlight layer filter.
  useEffect(() => {
    activeLegIndexRef.current = activeLegIndex
    const map = mapRef.current
    if (map && mapReady && map.getLayer && map.getLayer("itinerary-route-highlight")) {
      map.setFilter("itinerary-route-highlight", ["==", ["get", "legIndex"], activeLegIndex ?? -1])
    }
  }, [activeLegIndex, mapReady])

  // Resize whenever the panel becomes visible or goes fullscreen. We
  // deliberately do NOT re-fit camera here — that's owned by the marker
  // effect above and re-running it on every visibility flip caused the
  // map to "jump" each time the user expanded/collapsed the section.
  useEffect(() => {
    const timer = setTimeout(() => {
      const map = mapRef.current
      if (map) map.resize()
    }, 150)
    return () => clearTimeout(timer)
  }, [isFullscreen, visible])

  const handleCardClick = useCallback(() => {
    if (selected && onSelect) onSelect(selected)
  }, [selected, onSelect])

  return (
    <div className={`relative flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-background" : ""}`}>

      {/* Controls header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="ml-auto flex items-center gap-1.5">
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
        <div
          ref={containerRef}
          className={`absolute inset-0 transition-opacity duration-300 ${mapReady ? "opacity-100" : "opacity-0"}`}
        />
        {/* Skeleton — fades out smoothly once the map's first paint
            completes so the user never sees a hard pop-in. */}
        {!mapError && (
          <div
            className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-muted/40 transition-opacity duration-300 ${mapReady ? "opacity-0" : "opacity-100"}`}
          >
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
