"use client"

import { useEffect, useRef, useState } from "react"
import { Bus, TrainFront, Navigation, Radio } from "lucide-react"

type TourMap = {
  key: string
  title: string
  subtitle: string
  icon: typeof Bus
  routeLabel: string
  /** Hex colour for the route line + vehicle marker. */
  color: string
  /** Ordered waypoints [lng, lat] describing the tour route. */
  waypoints: [number, number][]
  /** Inline SVG markup for the vehicle glyph rendered inside the marker. */
  glyph: string
}

const BUS_GLYPH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>'

const TRAIN_GLYPH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/></svg>'

const TOURS: TourMap[] = [
  {
    key: "bus",
    title: "Bus Tour",
    subtitle: "Hop-on hop-off city loop",
    icon: Bus,
    routeLabel: "City Centre → Kirchberg → Grund",
    color: "#0ea5e9",
    glyph: BUS_GLYPH,
    waypoints: [
      [6.1296, 49.6112], // Place d'Armes (City Centre)
      [6.1359, 49.6155], // towards the plateau
      [6.1497, 49.6235], // Pont Grande-Duchesse Charlotte
      [6.1667, 49.628], // Kirchberg
      [6.1432, 49.6133], // back over the valley
      [6.1378, 49.6097], // Grund
    ],
  },
  {
    key: "train",
    title: "Train Tour",
    subtitle: "Petrusse Express scenic line",
    icon: TrainFront,
    routeLabel: "Place de la Constitution → Casemates",
    color: "#10b981",
    glyph: TRAIN_GLYPH,
    waypoints: [
      [6.1275, 49.6097], // Place de la Constitution
      [6.1298, 49.6088], // along the Pétrusse
      [6.1331, 49.6101], // Bock promontory
      [6.1342, 49.6118], // Bock Casemates
    ],
  },
]

function DemoTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-950 shadow-sm">
      Demo
    </span>
  )
}

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

/** Cumulative-distance interpolation along a polyline. `t` in [0,1] returns the
 *  point that fraction of the way along the total route length. Simple planar
 *  math on lng/lat is accurate enough over a single city. */
function pointAlong(coords: [number, number][], t: number): [number, number] {
  if (coords.length === 0) return [0, 0]
  if (coords.length === 1) return coords[0]
  const segLens: number[] = []
  let total = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0]
    const dy = coords[i + 1][1] - coords[i][1]
    const len = Math.hypot(dx, dy)
    segLens.push(len)
    total += len
  }
  if (total === 0) return coords[0]
  let target = Math.min(Math.max(t, 0), 1) * total
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const f = segLens[i] === 0 ? 0 : target / segLens[i]
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * f,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * f,
      ]
    }
    target -= segLens[i]
  }
  return coords[coords.length - 1]
}

function TourTrackingCard({ tour }: { tour: TourMap }) {
  const Icon = tour.icon
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let rafId = 0
    let marker: any = null
    const endpointMarkers: any[] = []

    async function init() {
      try {
        let token = ""
        try {
          const res = await fetch("/api/mapbox-token")
          const data = await res.json()
          token = data.token ?? ""
        } catch {
          /* ignore token fetch errors */
        }
        if (cancelled) return
        if (!token) {
          setMapError("Map unavailable — Mapbox key not configured.")
          return
        }

        const mapboxModule = await import("mapbox-gl")
        const mapboxgl: any = mapboxModule.default ?? mapboxModule
        if (cancelled || !containerRef.current) return

        mapboxgl.accessToken = token
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/light-v11",
          center: tour.waypoints[0],
          zoom: 12.5,
          attributionControl: false,
          interactive: true,
        })
        // Store the instance immediately (not just in the load handler) so an
        // early unmount — before `load` fires — still tears the map down.
        mapRef.current = map
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
        map.on("error", () => {})

        map.on("load", async () => {
          if (cancelled) return

          // Resolve a road-following route via the Directions API; fall back to
          // the straight waypoint polyline if the request fails.
          let routeCoords: [number, number][] = tour.waypoints
          try {
            const coordStr = tour.waypoints.map((w) => `${w[0]},${w[1]}`).join(";")
            const url =
              `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}` +
              `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`
            const r = await fetch(url)
            if (r.ok) {
              const d = await r.json()
              const g = d?.routes?.[0]?.geometry?.coordinates
              if (Array.isArray(g) && g.length > 1) routeCoords = g
            }
          } catch {
            /* keep straight-line fallback */
          }
          if (cancelled || !mapRef.current) return

          // Route line (casing + colour).
          map.addSource("route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: routeCoords } },
          })
          map.addLayer({
            id: "route-casing",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
          })
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": tour.color, "line-width": 4, "line-opacity": 0.95 },
          })

          // Static start/end dots.
          const makeDot = (cls: string) => {
            const el = document.createElement("div")
            el.className = cls
            return el
          }
          endpointMarkers.push(
            new mapboxgl.Marker({ element: makeDot("live-track-endpoint live-track-start") })
              .setLngLat(routeCoords[0])
              .addTo(map),
            new mapboxgl.Marker({ element: makeDot("live-track-endpoint live-track-end") })
              .setLngLat(routeCoords[routeCoords.length - 1])
              .addTo(map),
          )

          // Animated vehicle marker.
          const vehEl = document.createElement("div")
          vehEl.className = "live-track-vehicle"
          vehEl.style.setProperty("--veh-color", tour.color)
          vehEl.innerHTML = `<span class="live-track-vehicle-ping"></span><span class="live-track-vehicle-dot">${tour.glyph}</span>`
          marker = new mapboxgl.Marker({ element: vehEl })
            .setLngLat(routeCoords[0])
            .addTo(map)

          // Fit to the whole route.
          const bounds = new mapboxgl.LngLatBounds()
          routeCoords.forEach((c) => bounds.extend(c as [number, number]))
          map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 })

          setMapReady(true)

          // Drive the vehicle back and forth along the route to evoke live motion.
          const LOOP_MS = 16000
          let startTs = 0
          const tick = (ts: number) => {
            if (cancelled) return
            if (!startTs) startTs = ts
            const phase = ((ts - startTs) % LOOP_MS) / LOOP_MS
            const t = phase < 0.5 ? phase * 2 : (1 - phase) * 2 // 0→1→0 ping-pong
            marker.setLngLat(pointAlong(routeCoords as [number, number][], t))
            rafId = requestAnimationFrame(tick)
          }
          rafId = requestAnimationFrame(tick)
        })
      } catch (err: any) {
        if (!cancelled) setMapError(err?.message ?? "Failed to load map")
      }
    }

    init()

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      if (marker) marker.remove()
      endpointMarkers.forEach((m) => m.remove())
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [tour])

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{tour.title}</h2>
            <p className="text-xs text-muted-foreground">{tour.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveBadge />
          <DemoTag />
        </div>
      </div>

      {/* Live map */}
      <div className="relative aspect-[4/3]">
        <div ref={containerRef} className="absolute inset-0" />
        {!mapError && (
          <div
            className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-muted/40 transition-opacity duration-300 ${
              mapReady ? "opacity-0" : "opacity-100"
            }`}
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Loading map...</span>
            </div>
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 px-6 text-center">
            <p className="text-xs text-muted-foreground">{mapError}</p>
          </div>
        )}
      </div>

      {/* Footer / route info */}
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Navigation className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{tour.routeLabel}</span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">Updated just now</span>
      </div>
    </div>
  )
}

export function LiveTrackingMaps() {
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        {TOURS.map((tour) => (
          <TourTrackingCard key={tour.key} tour={tour} />
        ))}
      </div>

      <p className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 px-5 py-4 text-center text-xs text-muted-foreground">
        <Radio className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span>
          Routes shown are demo content. Real-time vehicle positions for the bus and train tours will
          replace the animated markers once live tracking is connected.
        </span>
      </p>
    </>
  )
}
