"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, MapPin, Search, X } from "lucide-react"

export interface PickedLocation {
  lat: number
  lng: number
  placeName: string
}

interface LocationPickerProps {
  /** Initial selection to pre-load (when editing an existing location). */
  initial?: { lat?: number | null; lng?: number | null; placeName?: string | null }
  /** Title shown in the modal header (e.g. the step name). */
  title?: string
  onClose: () => void
  onConfirm: (loc: PickedLocation) => void
}

interface GeoResult {
  id: string
  placeName: string
  lat: number
  lng: number
}

// Luxembourg fallback center.
const LUX_CENTER: [number, number] = [6.1296, 49.6116]

export function LocationPicker({ initial, title, onClose, onConfirm }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const tokenRef = useRef<string>("")
  const mapboxRef = useRef<any>(null)

  const [mapError, setMapError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<PickedLocation | null>(
    typeof initial?.lat === "number" &&
      typeof initial?.lng === "number" &&
      Number.isFinite(initial.lat) &&
      Number.isFinite(initial.lng)
      ? { lat: initial.lat, lng: initial.lng, placeName: initial.placeName ?? "" }
      : null,
  )

  // Place / move the single marker and remember the selection.
  const placeMarker = useCallback((lng: number, lat: number, placeName: string) => {
    const mapboxgl = mapboxRef.current
    const map = mapRef.current
    if (!mapboxgl || !map) return
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat])
    } else {
      const el = document.createElement("div")
      el.style.cssText =
        "width:22px;height:22px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer;"
      markerRef.current = new mapboxgl.Marker({ element: el, draggable: true })
        .setLngLat([lng, lat])
        .addTo(map)
      markerRef.current.on("dragend", () => {
        const p = markerRef.current.getLngLat()
        setSelected((prev) => ({ lat: p.lat, lng: p.lng, placeName: prev?.placeName ?? "" }))
      })
    }
    setSelected({ lat, lng, placeName })
  }, [])

  // Initialise the map once.
  useEffect(() => {
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
        setMapError("Map unavailable — Mapbox key not configured in Integrations.")
        return
      }
      tokenRef.current = token

      const mod = await import("mapbox-gl")
      const mapboxgl: any = mod.default ?? mod
      if (cancelled || !containerRef.current) return
      mapboxRef.current = mapboxgl
      mapboxgl.accessToken = token

      const start: [number, number] =
        selected && Number.isFinite(selected.lng) && Number.isFinite(selected.lat)
          ? [selected.lng, selected.lat]
          : LUX_CENTER
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: start,
        zoom: selected ? 14 : 11,
        attributionControl: false,
      })
      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
      map.on("error", () => {})

      map.on("load", () => {
        if (cancelled) return
        if (selected) placeMarker(selected.lng, selected.lat, selected.placeName)
      })

      // Click anywhere to drop / move the pin.
      map.on("click", (e: any) => {
        placeMarker(e.lngLat.lng, e.lngLat.lat, "")
      })
    }
    init()
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Geocoding search via Mapbox Places API.
  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault()
    const q = query.trim()
    if (!q || !tokenRef.current) return
    setSearching(true)
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?limit=6&access_token=${encodeURIComponent(tokenRef.current)}`
      const r = await fetch(url)
      const d = await r.json()
      const feats: GeoResult[] = Array.isArray(d?.features)
        ? d.features
            .map((f: any) => {
              const c = f?.center
              if (!Array.isArray(c) || c.length < 2) return null
              return {
                id: String(f.id ?? `${c[0]},${c[1]}`),
                placeName: String(f.place_name ?? f.text ?? ""),
                lng: Number(c[0]),
                lat: Number(c[1]),
              }
            })
            .filter((x: GeoResult | null): x is GeoResult => x !== null)
        : []
      setResults(feats)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  function chooseResult(r: GeoResult) {
    setResults([])
    setQuery(r.placeName)
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [r.lng, r.lat], zoom: 14 })
    }
    placeMarker(r.lng, r.lat, r.placeName)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Set location{title ? ` — ${title}` : ""}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border px-5 py-3">
          <form onSubmit={runSearch} className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a place (e.g. European Schengen Museum)…"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Search
            </button>
          </form>

          {results.length > 0 && (
            <ul className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border bg-background">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => chooseResult(r)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-foreground transition hover:bg-muted"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{r.placeName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Search for a place, or click anywhere on the map to drop a pin. Drag the pin to fine-tune.
          </p>
        </div>

        <div className="relative flex-1 overflow-hidden">
          {mapError ? (
            <div className="flex h-72 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {mapError}
            </div>
          ) : (
            <div ref={containerRef} className="h-[50vh] min-h-[320px] w-full" />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            {selected ? (
              <span className="block truncate">
                <span className="font-medium text-foreground">{selected.placeName || "Custom point"}</span>
                {" — "}
                {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
              </span>
            ) : (
              "No location selected yet."
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={() => selected && onConfirm(selected)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              <MapPin className="h-3.5 w-3.5" /> Use this location
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
