/**
 * Client-side PDF export for the active Trip Planner itinerary.
 *
 * Produces a shareable PDF of the LATEST built day itinerary so a visitor can
 * forward it to friends / fellow participants. The PDF is interactive:
 *  - A static Mapbox map of the route (best-effort — skipped if no token/coords)
 *    is a clickable link that opens the full route in the device's maps app
 *    (Google Maps directions URL — opens the native app on mobile, browser on
 *    desktop).
 *  - Each stop carries a "Book Now" link that opens the trip detail page
 *    (/trip/[id]) in a new tab / the user's browser.
 *
 * Everything runs in the browser (dynamic jsPDF import) so it works without any
 * server round-trip beyond fetching the public Mapbox token.
 */

import type { Itinerary } from "@/components/sidebar-itinerary"

type ItineraryStep = Itinerary["steps"][number]

const BRAND = "#2563eb"
const INK = "#0f172a"
const MUTE = "#64748b"
const LINE = "#e2e8f0"

function decodeEntities(s: string | null | undefined): string {
  if (!s) return ""
  return String(s)
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&euro;/g, "€").replace(/&pound;/g, "£")
}

/** A stop with real geocoded coordinates — required for map + maps-app link. */
function hasCoords(s: ItineraryStep): s is ItineraryStep & { lat: number; lng: number } {
  return typeof s.lat === "number" && typeof s.lng === "number"
}

/** Cross-platform "open the whole route" link. Google Maps directions deep-link
 *  opens the native maps app on mobile and the browser on desktop. */
function buildMapsLink(coords: { lat: number; lng: number }[]): string | null {
  if (coords.length === 0) return null
  if (coords.length === 1) {
    const { lat, lng } = coords[0]
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  }
  const origin = coords[0]
  const destination = coords[coords.length - 1]
  const waypoints = coords.slice(1, -1)
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
  })
  if (waypoints.length) {
    params.set("waypoints", waypoints.map((c) => `${c.lat},${c.lng}`).join("|"))
  }
  return `https://www.google.com/maps/dir/?api=1&${params.toString()}`
}

/** Build a Mapbox Static Images API URL with numbered pins + a route line. */
function buildStaticMapUrl(coords: { lat: number; lng: number }[], token: string, w: number, h: number): string | null {
  if (!token || coords.length === 0) return null
  const color = "2563eb"
  const markers = coords
    .slice(0, 15)
    .map((c, i) => {
      const label = i + 1 <= 99 ? String(i + 1) : ""
      return `pin-s-${label}+${color}(${c.lng.toFixed(5)},${c.lat.toFixed(5)})`
    })
    .join(",")
  let overlay = markers
  if (coords.length > 1) {
    const geojson = {
      type: "Feature",
      properties: { stroke: `#${color}`, "stroke-width": 3, "stroke-opacity": 0.8 },
      geometry: { type: "LineString", coordinates: coords.map((c) => [c.lng, c.lat]) },
    }
    overlay = `geojson(${encodeURIComponent(JSON.stringify(geojson))}),${markers}`
  }
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}/auto/${w}x${h}@2x?padding=40&access_token=${token}`
}

async function fetchMapboxToken(): Promise<string> {
  try {
    const res = await fetch("/api/mapbox-token", { cache: "no-store" })
    if (!res.ok) return ""
    const data = await res.json()
    const token = typeof data?.token === "string" ? data.token : ""
    return token.startsWith("pk.") ? token : ""
  } catch {
    return ""
  }
}

async function fetchImageAsDataUrl(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const dims: { width: number; height: number } = await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => resolve({ width: 0, height: 0 })
      img.src = dataUrl
    })
    return { dataUrl, width: dims.width, height: dims.height }
  } catch {
    return null
  }
}

function prettyDate(ymd: string | undefined): string {
  if (!ymd) return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

/**
 * Generate + trigger download of a PDF for the given itinerary.
 * Returns false if the itinerary is empty (nothing to export).
 */
export async function downloadItineraryPdf(itinerary: Itinerary | null | undefined): Promise<boolean> {
  if (!itinerary || !Array.isArray(itinerary.steps) || itinerary.steps.length === 0) {
    return false
  }

  const { jsPDF } = await import("jspdf")
  const origin = typeof window !== "undefined" ? window.location.origin : ""

  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentW = pageW - margin * 2
  let y = margin

  const ensure = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage()
      y = margin
    }
  }

  // ---- Header ------------------------------------------------------------
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(BRAND)
  doc.text("sightseeing.lu", margin, y + 4)

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(MUTE)
  doc.text("Luxembourg day itinerary", pageW - margin, y + 4, { align: "right" })
  y += 22

  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.setTextColor(INK)
  doc.text("Your Day Itinerary", margin, y + 6)
  y += 22

  const dateStr = prettyDate(itinerary.visitDate)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  doc.setTextColor(MUTE)
  const stopLbl = `${itinerary.steps.length} stop${itinerary.steps.length === 1 ? "" : "s"} planned`
  doc.text(dateStr ? `${dateStr}  ·  ${stopLbl}` : stopLbl, margin, y + 4)
  y += 18

  doc.setDrawColor(LINE)
  doc.setLineWidth(1)
  doc.line(margin, y, pageW - margin, y)
  y += 16

  // ---- Summary -----------------------------------------------------------
  const summary = decodeEntities(itinerary.summary)
  if (summary) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10.5)
    doc.setTextColor(INK)
    const lines = doc.splitTextToSize(summary, contentW) as string[]
    ensure(lines.length * 14)
    doc.text(lines, margin, y)
    y += lines.length * 14 + 12
  }

  // ---- Map (best-effort) -------------------------------------------------
  const coords = itinerary.steps.filter(hasCoords).map((s) => ({ lat: s.lat, lng: s.lng }))
  const mapsLink = buildMapsLink(coords)
  if (coords.length > 0) {
    const token = await fetchMapboxToken()
    const mapH = 200
    const mapUrl = buildStaticMapUrl(coords, token, 1000, 400)
    let drewMap = false
    if (mapUrl) {
      const img = await fetchImageAsDataUrl(mapUrl)
      if (img && img.dataUrl) {
        ensure(mapH + 26)
        const fmt = img.dataUrl.includes("image/jpeg") ? "JPEG" : "PNG"
        try {
          doc.addImage(img.dataUrl, fmt, margin, y, contentW, mapH)
          doc.setDrawColor(LINE)
          doc.rect(margin, y, contentW, mapH)
          if (mapsLink) doc.link(margin, y, contentW, mapH, { url: mapsLink })
          y += mapH + 6
          drewMap = true
        } catch {
          /* image embed failed — fall through to text link */
        }
      }
    }
    if (mapsLink) {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9.5)
      doc.setTextColor(BRAND)
      const label = drewMap ? "↗  Open route in your maps app" : "↗  Open the full route in your maps app"
      doc.textWithLink(label, margin, y + 10, { url: mapsLink })
      y += 22
    }
  }

  // ---- Steps -------------------------------------------------------------
  ensure(20)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(INK)
  doc.text("Schedule", margin, y)
  y += 16

  itinerary.steps.forEach((step, i) => {
    const title = decodeEntities(step.tripTitle)
    const titleLines = doc.splitTextToSize(title, contentW - 70) as string[]
    const blockH = 18 + titleLines.length * 14 + 14 + (step.travelToNext ? 14 : 0) + 22
    ensure(blockH + 8)

    const blockTop = y
    // time chip
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10.5)
    doc.setTextColor(BRAND)
    doc.text(step.time || `Stop ${i + 1}`, margin, y + 4)

    // title
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(INK)
    doc.text(titleLines, margin + 62, y + 4)
    y += titleLines.length * 14

    // duration + location + price
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(MUTE)
    const meta: string[] = []
    if (step.durationMinutes) meta.push(`${step.durationMinutes} min`)
    const loc = decodeEntities(step.tripLocation || step.tripCity || "")
    if (loc) meta.push(loc)
    if (step.priceFrom) meta.push(`from ${decodeEntities(step.priceFrom)}`)
    if (meta.length) {
      doc.text(meta.join("  ·  "), margin + 62, y + 6)
      y += 14
    }

    // Book Now link → trip detail page (new tab)
    if (step.tripId && origin) {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9.5)
      doc.setTextColor(BRAND)
      doc.textWithLink("Book Now ↗", margin + 62, y + 8, {
        url: `${origin}/trip/${encodeURIComponent(step.tripId)}`,
      })
      y += 16
    }

    // travel-to-next line
    if (step.travelToNext) {
      doc.setFont("helvetica", "italic")
      doc.setFontSize(9)
      doc.setTextColor(MUTE)
      const t = doc.splitTextToSize(`→ ${decodeEntities(step.travelToNext)}`, contentW - 62) as string[]
      ensure(t.length * 12)
      doc.text(t, margin + 62, y + 6)
      y += t.length * 12 + 4
    }

    // marker dot + connector on the left rail
    doc.setFillColor(BRAND)
    doc.circle(margin + 52, blockTop, 2.5, "F")

    y += 10
  })

  // ---- Tips --------------------------------------------------------------
  const tips = (itinerary.tips || []).map((t) => decodeEntities(t)).filter(Boolean)
  if (tips.length) {
    ensure(24)
    y += 4
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.setTextColor(INK)
    doc.text("Good to know", margin, y)
    y += 16
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(INK)
    tips.forEach((tip) => {
      const lines = doc.splitTextToSize(`•  ${tip}`, contentW - 8) as string[]
      ensure(lines.length * 13 + 2)
      doc.text(lines, margin + 4, y)
      y += lines.length * 13 + 4
    })
  }

  // ---- Footer on every page ---------------------------------------------
  const pageCount = doc.getNumberOfPages()
  const generated = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(MUTE)
    doc.text(`Generated ${generated} · sightseeing.lu`, margin, pageH - 20)
    doc.text(`${p} / ${pageCount}`, pageW - margin, pageH - 20, { align: "right" })
  }

  const fileDate = itinerary.visitDate || new Date().toISOString().slice(0, 10)
  doc.save(`sightseeing-itinerary-${fileDate}.pdf`)
  return true
}
