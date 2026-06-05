"use client"

import { useEffect, useRef, useState } from "react"

export interface ItineraryStepView {
  name: string
  description: string
  lat?: number | null
  lng?: number | null
  placeName?: string | null
}

interface TripItineraryProps {
  steps: ItineraryStepView[]
}

function hasCoords(s: ItineraryStepView): s is ItineraryStepView & { lat: number; lng: number } {
  return typeof s.lat === "number" && typeof s.lng === "number" && Number.isFinite(s.lat) && Number.isFinite(s.lng)
}

function styleMarker(el: HTMLDivElement, isActive: boolean) {
  el.style.background = isActive ? "#2563eb" : "#94a3b8"
  el.style.transform = isActive ? "scale(1.25)" : "scale(1)"
  el.style.zIndex = isActive ? "2" : "1"
}

export function TripItinerary({ steps }: TripItineraryProps) {
  const mapSteps = steps
    .map((s, i) => ({ step: s, index: i }))
    .filter(({ step }) => hasCoords(step))

  const hasMap = mapSteps.length > 0
  const firstMappable = hasMap ? mapSteps[0].index : null
  // Signature of the mappable coordinates — rebuild the map only when they materially change.
  const mapSig = JSON.stringify(mapSteps.map(({ step, index }) => [index, step.lat, step.lng]))

  // Default the active step to the first mappable one (the "main" stop).
  const [active, setActive] = useState<number | null>(firstMappable)

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Record<number, { el: HTMLDivElement; marker: any }>>({})
  const activeRef = useRef<number | null>(active)
  const [mapError, setMapError] = useState<string | null>(null)

  // Keep activeRef current so the async map-init closure styles markers correctly.
  useEffect(() => {
    activeRef.current = active
  }, [active])

  // If the steps change such that the active index is no longer mappable, resync to the first stop.
  useEffect(() => {
    const mappableIndices = mapSteps.map((m) => m.index)
    if (active !== null && !mappableIndices.includes(active)) {
      setActive(firstMappable)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSig])

  // Build the map + markers once (only when at least one step is mappable).
  useEffect(() => {
    if (!hasMap) return
    let cancelled = false

    async function init() {
      let token = ""
      try {
        const res = await fetch("/api/mapbox-token")
        const data = await res.json()
        token = data.token ?? ""
      } catch {
        /* ignore */
      }
      if (cancelled) return
      if (!token) {
        setMapError("Map unavailable.")
        return
      }

      const mod = await import("mapbox-gl")
      const mapboxgl: any = mod.default ?? mod
      if (cancelled || !containerRef.current) return

      if (typeof mapboxgl.supported === "function" && !mapboxgl.supported()) {
        setMapError("Map preview isn't supported on this device.")
        return
      }

      mapboxgl.accessToken = token

      const first = mapSteps[0].step as ItineraryStepView & { lat: number; lng: number }
      let map: any
      try {
        map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/light-v11",
          center: [first.lng, first.lat],
          zoom: 12,
          attributionControl: false,
        })
      } catch {
        if (!cancelled) setMapError("Map preview isn't supported on this device.")
        return
      }
      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
      map.on("error", () => {})

      map.on("load", () => {
        if (cancelled) return
        const bounds = new mapboxgl.LngLatBounds()
        for (const { step, index } of mapSteps) {
          const sc = step as ItineraryStepView & { lat: number; lng: number }
          const el = document.createElement("div")
          el.className = "trip-itin-marker"
          el.textContent = String(index + 1)
          el.style.cssText =
            "display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;" +
            "font-size:12px;font-weight:700;color:#fff;border:2px solid #fff;cursor:pointer;" +
            "box-shadow:0 1px 4px rgba(0,0,0,.35);transition:transform .15s,background .15s;"
          el.addEventListener("click", () => setActive(index))
          styleMarker(el, index === activeRef.current)
          const marker = new mapboxgl.Marker({ element: el }).setLngLat([sc.lng, sc.lat]).addTo(map)
          markersRef.current[index] = { el, marker }
          bounds.extend([sc.lng, sc.lat])
        }
        if (mapSteps.length === 1) {
          map.setCenter([first.lng, first.lat])
          map.setZoom(13)
        } else {
          map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 })
        }
      })
    }

    init()
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markersRef.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSig])

  // Restyle markers + fly to the active step whenever it changes.
  useEffect(() => {
    const markers = markersRef.current
    for (const key of Object.keys(markers)) {
      const idx = Number(key)
      styleMarker(markers[idx].el, idx === active)
    }
    if (active !== null && markers[active] && mapRef.current) {
      const ll = markers[active].marker.getLngLat()
      mapRef.current.flyTo({ center: [ll.lng, ll.lat], zoom: 13.5, duration: 700 })
    }
  }, [active])

  const ListContent = (
    <div className="flex flex-col" data-testid="trip-itinerary-steps">
      {steps.map((step, i) => {
        const mappable = hasCoords(step)
        const isActive = i === active
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (mappable) setActive(i)
            }}
            className={`group flex gap-4 text-left transition ${mappable ? "cursor-pointer" : "cursor-default"}`}
            aria-pressed={mappable ? isActive : undefined}
          >
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                  isActive
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-primary text-primary-foreground group-hover:opacity-90"
                }`}
              >
                {i + 1}
              </div>
              {i < steps.length - 1 && <div className="flex-1 w-px bg-border" />}
            </div>
            <div className="pb-6">
              <p
                className={`text-sm font-semibold transition ${
                  isActive ? "text-primary" : "text-foreground group-hover:text-primary"
                }`}
              >
                {step.name}
              </p>
              {step.description && (
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              )}
              {mappable && (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-primary/80">
                  <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" />
                  </svg>
                  {step.placeName || "View on map"}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )

  if (!hasMap) {
    return <div className="mt-4">{ListContent}</div>
  }

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <div>{ListContent}</div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="overflow-hidden rounded-xl border border-border">
          {mapError ? (
            <div className="flex h-72 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {mapError}
            </div>
          ) : (
            <div ref={containerRef} className="h-[360px] w-full lg:h-[440px]" />
          )}
        </div>
        <div className="mt-2 flex items-center gap-4 px-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: "#2563eb" }} />
            Main stop
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: "#94a3b8" }} />
            Other stop
          </span>
        </div>
      </div>
    </div>
  )
}
