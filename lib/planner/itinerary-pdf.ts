/**
 * Client-side PDF export for the active Trip Planner itinerary.
 *
 * Produces a shareable PDF that mirrors the on-screen "Day Itinerary" canvas:
 *  - A static Mapbox map of the route. The route follows the real roads
 *    (Mapbox Directions geometry, green to match the canvas) with numbered
 *    pins. The whole map is a clickable link that opens the full route in the
 *    device's maps app (Google Maps directions — native app on mobile).
 *  - A numbered, timed schedule. Each stop carries the same rich detail the
 *    canvas shows: confirmed start–end time, duration, price, spaces left,
 *    "Things to do" highlights, the important-info note, and a "Book Now"
 *    link that opens the trip page with this slot pre-selected.
 *  - Coffee / meal breaks between stops (with a "find places" link).
 *  - A full "Travel to next stop" block per leg: distance, live/estimated
 *    badge, and by-car / by-transit / walking times with arrival ETAs.
 *  - "Good to know" tips.
 *
 * Everything runs in the browser (dynamic jsPDF import) so it works without any
 * server round-trip beyond fetching the public Mapbox token + route geometry.
 * Every external step is best-effort — the PDF always downloads even when the
 * map, route, or any single stop fails to render.
 */

import type { Itinerary } from "@/components/sidebar-itinerary"

type ItineraryStep = Itinerary["steps"][number]

// Palette — kept in lockstep with the canvas (primary = green #16a34a).
const INK = "#0f172a"
const MUTE = "#64748b"
const FAINT = "#94a3b8"
const LINE = "#e2e8f0"
const CARD_BG = "#f8fafc"
const GREEN = "#16a34a"
const GREEN_DK = "#15803d"
const GREEN_BG = "#dcfce7"
const GREEN_RAIL = "#bbf7d0"
const BADGE_BG = "#eef2f6"
const AMBER_BORDER = "#fcd34d"
const AMBER_BG = "#fffbeb"
const AMBER_TX = "#92400e"
const COFFEE_TX = "#b45309"
const ORANGE_BORDER = "#fdba74"
const ORANGE_BG = "#fff7ed"
const ORANGE_TX = "#ea580c"
const SKY_BORDER = "#bae6fd"
const SKY_BG = "#f0f9ff"
const SKY_TX = "#075985"

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

/** Deep-link to the trip page pre-loaded with this stop's day + time, so the
 *  booking calendar opens on the right month — mirrors the canvas "Book Now". */
function bookingHref(step: ItineraryStep, origin: string, visitDate?: string): string {
  const qs = new URLSearchParams()
  if (visitDate) qs.set("date", visitDate)
  if (step.time) qs.set("time", step.time)
  qs.set("from", "planner")
  return `${origin}/trip/${encodeURIComponent(step.tripId)}?${qs.toString()}#booking`
}

/** Fetch a road-following encoded polyline for the route (Mapbox Directions),
 *  so the PDF map matches the green driving route shown on the canvas. */
async function fetchRoutePolyline(coords: { lat: number; lng: number }[], token: string): Promise<string | null> {
  if (coords.length < 2 || !token) return null
  try {
    const path = coords.slice(0, 25).map((c) => `${c.lng},${c.lat}`).join(";")
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${path}?geometries=polyline&overview=full&access_token=${token}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const g = data?.routes?.[0]?.geometry
    return typeof g === "string" && g.length > 0 ? g : null
  } catch {
    return null
  }
}

/** Build a Mapbox Static Images API URL with numbered green pins + a green
 *  route line. Prefers the road-following polyline; falls back to a straight
 *  geojson line, then to bare markers if the URL would get too long. */
function buildStaticMapUrl(
  coords: { lat: number; lng: number }[],
  token: string,
  w: number,
  h: number,
  polyline: string | null,
): string | null {
  if (!token || coords.length === 0) return null
  const color = "16a34a"
  const markers = coords
    .slice(0, 15)
    .map((c, i) => {
      const label = i + 1 <= 99 ? String(i + 1) : ""
      return `pin-s-${label}+${color}(${c.lng.toFixed(5)},${c.lat.toFixed(5)})`
    })
    .join(",")

  const base = (overlay: string) =>
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}/auto/${w}x${h}@2x?padding=44&access_token=${token}`

  if (polyline) {
    const url = base(`path-4+${color}-0.95(${encodeURIComponent(polyline)}),${markers}`)
    if (url.length <= 8000) return url
  }
  if (coords.length > 1) {
    const geojson = {
      type: "Feature",
      properties: { stroke: `#${color}`, "stroke-width": 4, "stroke-opacity": 0.9 },
      geometry: { type: "LineString", coordinates: coords.map((c) => [c.lng, c.lat]) },
    }
    const url = base(`geojson(${encodeURIComponent(JSON.stringify(geojson))}),${markers}`)
    if (url.length <= 8000) return url
  }
  return base(markers)
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
  const steps = itinerary.steps

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

  // The standard PDF Helvetica (WinAnsi) cannot render the "→" glyph (it prints
  // as garbage like "!'"), so we DRAW arrows instead of typing them.
  const drawArrow = (x: number, yMid: number, size: number, color: string) => {
    doc.setDrawColor(color)
    doc.setFillColor(color)
    doc.setLineWidth(Math.max(0.6, size * 0.16))
    doc.line(x, yMid, x + size, yMid)
    const hh = size * 0.34
    doc.triangle(x + size - 0.2, yMid - hh, x + size - 0.2, yMid + hh, x + size + size * 0.5, yMid, "F")
  }
  // Truncate text with an ellipsis so it fits maxW at the current font size.
  const ellipsize = (txt: string, maxW: number): string => {
    if (!txt) return ""
    if (doc.getTextWidth(txt) <= maxW) return txt
    let t = txt
    while (t.length > 1 && doc.getTextWidth(t + "…") > maxW) t = t.slice(0, -1)
    return t + "…"
  }
  // Small vector glyphs for the break cards. Helvetica can't render the lucide
  // icons (UtensilsCrossed / Coffee) used on the canvas, so we draw them.
  const drawUtensils = (cx: number, yMid: number, s: number, color: string) => {
    doc.setDrawColor(color)
    doc.setLineWidth(Math.max(0.6, s * 0.16))
    // fork (left): stem + three tines + crossbar
    const fx = cx - s * 0.5
    doc.line(fx, yMid - s * 0.25, fx, yMid + s)
    doc.line(fx - s * 0.3, yMid - s, fx - s * 0.3, yMid - s * 0.25)
    doc.line(fx, yMid - s, fx, yMid - s * 0.25)
    doc.line(fx + s * 0.3, yMid - s, fx + s * 0.3, yMid - s * 0.25)
    doc.line(fx - s * 0.3, yMid - s * 0.25, fx + s * 0.3, yMid - s * 0.25)
    // knife (right): spine + angled blade edge
    const kx = cx + s * 0.6
    doc.line(kx, yMid - s, kx, yMid + s)
    doc.line(kx, yMid - s, kx - s * 0.34, yMid - s * 0.1)
  }
  const drawCoffeeCup = (cx: number, yMid: number, s: number, color: string) => {
    doc.setDrawColor(color)
    doc.setLineWidth(Math.max(0.6, s * 0.16))
    doc.roundedRect(cx - s * 0.7, yMid - s * 0.45, s * 1.15, s * 1.25, s * 0.2, s * 0.2, "S")
    doc.circle(cx + s * 0.72, yMid + s * 0.15, s * 0.28, "S")
    doc.line(cx - s * 0.15, yMid - s * 0.95, cx - s * 0.15, yMid - s * 0.6)
    doc.line(cx + s * 0.25, yMid - s * 0.95, cx + s * 0.25, yMid - s * 0.6)
  }

  // ---- Header ------------------------------------------------------------
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(GREEN)
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
  const stopLbl = `${steps.length} stop${steps.length === 1 ? "" : "s"} planned`
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

  // ---- Map (best-effort, road-following green route) ---------------------
  // Wrapped whole — any unforeseen map error must never abort the export.
  try {
    const coords = steps.filter(hasCoords).map((s) => ({ lat: s.lat, lng: s.lng }))
    const mapsLink = buildMapsLink(coords)
    if (coords.length > 0) {
      const token = await fetchMapboxToken()
      const polyline = await fetchRoutePolyline(coords, token)
      const mapH = 200
      const mapUrl = buildStaticMapUrl(coords, token, 1000, 420, polyline)
      let drewMap = false
      if (mapUrl) {
        const img = await fetchImageAsDataUrl(mapUrl)
        if (img && img.dataUrl) {
          ensure(mapH + 26)
          const fmt = img.dataUrl.includes("image/jpeg") ? "JPEG" : "PNG"
          try {
            doc.addImage(img.dataUrl, fmt, margin, y, contentW, mapH)
            doc.setDrawColor(LINE)
            doc.setLineWidth(1)
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
        doc.setTextColor(GREEN)
        const label = drewMap ? "Open route in your maps app" : "Open the full route in your maps app"
        drawArrow(margin, y + 7, 8, GREEN)
        doc.textWithLink(label, margin + 14, y + 10, { url: mapsLink })
        y += 22
      }
    }
  } catch {
    /* map is best-effort — continue with the schedule regardless */
  }

  // ---- Schedule heading --------------------------------------------------
  ensure(22)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(INK)
  doc.text("Schedule", margin, y + 4)
  y += 18

  // Rail geometry — numbered circles + time labels live in a left gutter.
  const gutterTimeW = 38
  const railX = margin + 52
  const cardX = margin + 68
  const cardW = pageW - margin - cardX
  const pad = 11
  const innerW = cardW - pad * 2

  // Track every rail node (numbered stop circles AND break markers) so we can
  // connect them with a single continuous timeline that carries across pages.
  const circleMarks: { page: number; x: number; y: number; r: number }[] = []

  // ---- Steps -------------------------------------------------------------
  steps.forEach((step, i) => {
    try {
      const nextStep = steps[i + 1]
      const brk = step.breakAfter && step.breakAfter.type !== "none" ? step.breakAfter : null
      const hasLiveData = Boolean(step.endTime || step.priceFrom)

      // --- prepare wrapped text (measure once, reuse on draw) ---
      doc.setFont("helvetica", "bold")
      doc.setFontSize(12)
      const titleLines = doc.splitTextToSize(decodeEntities(step.tripTitle) || `Stop ${i + 1}`, innerW) as string[]

      const locationLabel = decodeEntities(step.tripLocation || step.tripCity || "")
      const priceTxt = step.priceFrom ? decodeEntities(step.priceFrom) : ""
      const spaces =
        step.spacesRemaining && step.spacesRemaining !== "UNLIMITED"
          ? `${step.spacesRemaining} spaces left`
          : step.spacesRemaining === "UNLIMITED"
            ? "Spaces available"
            : ""

      const highlights = (step.tripHighlights || []).map(decodeEntities).filter(Boolean).slice(0, 6)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9.5)
      const hlWrapped = highlights.map((h) => doc.splitTextToSize(h, innerW - 10) as string[])

      // Notes use "* " (or bullet) separators upstream — split them so the PDF
      // shows the same bulleted list the canvas does (not one run-on paragraph).
      const noteBullets = step.tripNotes
        ? decodeEntities(step.tripNotes)
            .split(/\s*[*•·]\s+/)
            .map((s) => s.replace(/\s+/g, " ").trim())
            .filter(Boolean)
        : []
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      const noteLineH = 12
      const noteWrapped = noteBullets.map((b) => doc.splitTextToSize(b, innerW - 34) as string[])
      // Single source of truth for the amber note-box height so measurement and
      // draw can never diverge — must be recomputed whenever noteWrapped changes
      // (e.g. after the clamp loop below drops trailing bullets).
      const computeNoteBoxH = (rows: string[][]) =>
        rows.length ? rows.reduce((a, w) => a + w.length * noteLineH, 0) + (rows.length - 1) * 3 + 16 : 0
      let noteBoxH = computeNoteBoxH(noteWrapped)

      // --- measure card height (mirror of the draw increments below) ---
      let m = pad + 6
      m += 16 // confirmed-time / duration / book-now row
      m += titleLines.length * 14
      if (locationLabel) m += 13
      if (hasLiveData && (priceTxt || spaces)) m += 16
      if (highlights.length) {
        m += 4 + 12
        hlWrapped.forEach((w) => { m += w.length * 12 + 2 })
      }
      if (noteWrapped.length) m += 6 + noteBoxH
      m += pad
      let cardH = m

      // A single card is drawn as one indivisible block, so it must fit within
      // one printable page. The only field that can grow unbounded is the note
      // list — drop trailing bullets so an extreme tripNotes never spills past
      // the bottom margin / clips.
      const maxCardH = pageH - margin * 2
      while (cardH > maxCardH && noteWrapped.length > 1) {
        const dropped = noteWrapped.pop()
        if (!dropped) break
        cardH -= dropped.length * noteLineH + 3
      }
      // Keep the drawn box height in sync with the (possibly clamped) bullet list.
      noteBoxH = computeNoteBoxH(noteWrapped)

      ensure(cardH + 8)
      const cardTop = y

      // card background + border
      doc.setFillColor(CARD_BG)
      doc.setDrawColor(LINE)
      doc.setLineWidth(1)
      doc.roundedRect(cardX, cardTop, cardW, cardH, 8, 8, "FD")

      let cy = cardTop + pad + 6

      // --- row 1: confirmed time (left) + duration badge + Book Now (right) ---
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(MUTE)
      const prefix = hasLiveData ? "Confirmed " : "Suggested "
      doc.text(prefix, cardX + pad, cy)
      const prefixW = doc.getTextWidth(prefix)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(10.5)
      doc.setTextColor(GREEN)
      const timeStr = step.time || ""
      doc.text(timeStr, cardX + pad + prefixW, cy + 0.5)
      if (step.endTime) {
        const tw = doc.getTextWidth(timeStr)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(9)
        doc.setTextColor(MUTE)
        doc.text(` – ${step.endTime}`, cardX + pad + prefixW + tw, cy + 0.5)
      }

      // Book Now — solid green pill with white label + arrow (matches canvas).
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8.5)
      const bnTxt = "Book Now"
      const bnTextW = doc.getTextWidth(bnTxt)
      const bnArrowW = 7
      const bnPadX = 9
      const bnW = bnPadX * 2 + bnTextW + 5 + bnArrowW
      const bnH = 16
      const bnX = cardX + cardW - pad - bnW
      const bnY = cy - 9
      doc.setFillColor(GREEN)
      doc.roundedRect(bnX, bnY, bnW, bnH, bnH / 2, bnH / 2, "F")
      doc.setTextColor("#ffffff")
      doc.text(bnTxt, bnX + bnPadX, bnY + 10.5)
      drawArrow(bnX + bnPadX + bnTextW + 5, bnY + bnH / 2, bnArrowW, "#ffffff")
      if (step.tripId && origin) {
        doc.link(bnX, bnY, bnW, bnH, { url: bookingHref(step, origin, itinerary.visitDate) })
      }
      // duration pill (with a small clock mark) to the left of Book Now
      if (step.durationMinutes) {
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8.5)
        const dt = `${step.durationMinutes} min`
        const dtW = doc.getTextWidth(dt) + 18
        const dx = bnX - 8 - dtW
        const dy = cy - 9
        doc.setFillColor(BADGE_BG)
        doc.roundedRect(dx, dy, dtW, bnH, bnH / 2, bnH / 2, "F")
        doc.setDrawColor(MUTE)
        doc.setLineWidth(0.7)
        doc.circle(dx + 8, dy + 8, 2.6, "S")
        doc.line(dx + 8, dy + 8, dx + 8, dy + 6.2)
        doc.line(dx + 8, dy + 8, dx + 9.3, dy + 8)
        doc.setTextColor(INK)
        doc.text(dt, dx + 14, dy + 10.5)
      }
      cy += 16

      // --- title ---
      doc.setFont("helvetica", "bold")
      doc.setFontSize(12)
      doc.setTextColor(INK)
      doc.text(titleLines, cardX + pad, cy + 4)
      cy += titleLines.length * 14

      // --- location ---
      if (locationLabel) {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(9)
        doc.setTextColor(MUTE)
        doc.setFillColor(GREEN)
        doc.circle(cardX + pad + 1.5, cy + 3, 1.4, "F")
        doc.text(locationLabel, cardX + pad + 8, cy + 6)
        cy += 13
      }

      // --- price + spaces ---
      if (hasLiveData && (priceTxt || spaces)) {
        let bx = cardX + pad
        if (priceTxt) {
          doc.setFont("helvetica", "bold")
          doc.setFontSize(8.5)
          const w = doc.getTextWidth(priceTxt) + 12
          doc.setFillColor(GREEN_BG)
          doc.roundedRect(bx, cy - 1, w, 13, 6, 6, "F")
          doc.setTextColor(GREEN_DK)
          doc.text(priceTxt, bx + 6, cy + 8)
          bx += w + 8
        }
        if (spaces) {
          doc.setFont("helvetica", "normal")
          doc.setFontSize(9)
          doc.setTextColor(MUTE)
          doc.text(spaces, bx, cy + 8)
        }
        cy += 16
      }

      // --- things to do ---
      if (highlights.length) {
        cy += 4
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.setTextColor(FAINT)
        doc.text("THINGS TO DO", cardX + pad, cy + 4)
        cy += 12
        doc.setFont("helvetica", "normal")
        doc.setFontSize(9.5)
        doc.setTextColor(INK)
        hlWrapped.forEach((w) => {
          doc.setFillColor(GREEN)
          doc.circle(cardX + pad + 2, cy + 2.5, 1.1, "F")
          doc.text(w, cardX + pad + 9, cy + 4)
          cy += w.length * 12 + 2
        })
      }

      // --- important note (amber box, bulleted to match the canvas) ---
      if (noteWrapped.length) {
        cy += 6
        const boxTop = cy
        doc.setFillColor(AMBER_BG)
        doc.setDrawColor(AMBER_BORDER)
        doc.setLineWidth(1)
        doc.roundedRect(cardX + pad, boxTop, innerW, noteBoxH, 6, 6, "FD")
        // (!) indicator circle
        doc.setFillColor("#f59e0b")
        doc.circle(cardX + pad + 11, boxTop + 11, 5.2, "F")
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.setTextColor("#ffffff")
        doc.text("!", cardX + pad + 11, boxTop + 14, { align: "center" })
        // bullet list (hanging indent)
        let ny = boxTop + 10
        doc.setFontSize(9)
        noteWrapped.forEach((w) => {
          doc.setFillColor(AMBER_TX)
          doc.circle(cardX + pad + 24, ny + 2.5, 1, "F")
          doc.setFont("helvetica", "normal")
          doc.setTextColor(AMBER_TX)
          doc.text(w, cardX + pad + 30, ny + 4)
          ny += w.length * noteLineH + 3
        })
        cy = boxTop + noteBoxH
      }

      // --- numbered circle + time label on the rail ---
      doc.setDrawColor(GREEN)
      doc.setFillColor("#ffffff")
      doc.setLineWidth(1.5)
      doc.circle(railX, cardTop + 12, 9, "FD")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      doc.setTextColor(GREEN)
      doc.text(String(i + 1), railX, cardTop + 15.5, { align: "center" })
      doc.text(step.time || "", margin + gutterTimeW, cardTop + 15.5, { align: "right" })
      circleMarks.push({ page: doc.getCurrentPageInfo().pageNumber, x: railX, y: cardTop + 12, r: 9 })

      y = cardTop + cardH + 6

      // --- coffee / meal break ---
      if (brk && brk.location) {
        const isCoffee = brk.type === "coffee"
        const tx = isCoffee ? COFFEE_TX : ORANGE_TX
        const bg = isCoffee ? AMBER_BG : ORANGE_BG
        const bd = isCoffee ? AMBER_BORDER : ORANGE_BORDER
        const label = decodeEntities(brk.label) || (isCoffee ? "Coffee break" : "Meal break")
        const nearLine = `Near ${decodeEntities(brk.location)}`
        const linkTxt = isCoffee
          ? `Find cafes in ${decodeEntities(brk.location)} on TripAdvisor`
          : `Find restaurants in ${decodeEntities(brk.location)} on TripAdvisor`
        const tripAdvisor = `https://www.tripadvisor.com/Search?q=${encodeURIComponent(
          (isCoffee ? "cafes in " : "restaurants in ") + brk.location,
        )}`
        const boxH = 16 + 13 + 14 + pad
        ensure(boxH + 6)
        const top = y
        doc.setFillColor(bg)
        doc.setDrawColor(bd)
        doc.setLineWidth(1.2)
        doc.roundedRect(cardX, top, cardW, boxH, 8, 8, "FD")
        let by = top + pad + 4
        // meal / coffee icon (mirrors the canvas UtensilsCrossed / Coffee)
        if (isCoffee) drawCoffeeCup(cardX + pad + 4, by - 3, 5, tx)
        else drawUtensils(cardX + pad + 4, by - 3, 5, tx)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(10.5)
        doc.setTextColor(tx)
        doc.text(label, cardX + pad + 16, by)
        // duration badge (right) with a small clock mark — matches canvas
        const dt = `${brk.durationMinutes} min`
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8.5)
        const dtW = doc.getTextWidth(dt) + 20
        const dbx = cardX + cardW - pad - dtW
        const dby = by - 10
        doc.setFillColor("#ffffff")
        doc.roundedRect(dbx, dby, dtW, 14, 7, 7, "F")
        doc.setDrawColor(MUTE)
        doc.setLineWidth(0.7)
        doc.circle(dbx + 8, dby + 7, 2.6, "S")
        doc.line(dbx + 8, dby + 7, dbx + 8, dby + 5.2)
        doc.line(dbx + 8, dby + 7, dbx + 9.3, dby + 7)
        doc.setTextColor(INK)
        doc.text(dt, dbx + 14, by)
        by += 14
        doc.setFont("helvetica", "normal")
        doc.setFontSize(9)
        doc.setTextColor(MUTE)
        doc.text(nearLine, cardX + pad, by)
        by += 14
        doc.setFont("helvetica", "bold")
        doc.setFontSize(9)
        doc.setTextColor(tx)
        drawArrow(cardX + pad, by - 2.5, 7, tx)
        doc.textWithLink(linkTxt, cardX + pad + 12, by, { url: tripAdvisor })

        // break marker on the rail (icon bubble) + start-time label
        doc.setDrawColor(tx)
        doc.setFillColor("#ffffff")
        doc.setLineWidth(1.5)
        doc.circle(railX, top + 12, 7, "FD")
        if (isCoffee) drawCoffeeCup(railX, top + 11, 3.4, tx)
        else drawUtensils(railX, top + 11, 3.4, tx)
        circleMarks.push({ page: doc.getCurrentPageInfo().pageNumber, x: railX, y: top + 12, r: 7 })
        if (step.endTime) {
          doc.setFont("helvetica", "bold")
          doc.setFontSize(9.5)
          doc.setTextColor(tx)
          doc.text(step.endTime, margin + gutterTimeW, top + 15, { align: "right" })
        }
        y = top + boxH + 6
      }

      // --- weather advisory ---
      if (step.weatherFlag) {
        const wText = decodeEntities(step.weatherFlag)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(9)
        const wLines = doc.splitTextToSize(wText, cardW - pad * 2) as string[]
        const boxH = wLines.length * 12 + 12
        ensure(boxH + 6)
        const top = y
        doc.setFillColor(SKY_BG)
        doc.setDrawColor(SKY_BORDER)
        doc.setLineWidth(1)
        doc.roundedRect(cardX, top, cardW, boxH, 6, 6, "FD")
        doc.setTextColor(SKY_TX)
        doc.text(wLines, cardX + pad, top + 14)
        y = top + boxH + 6
      }

      // --- travel to next stop ---
      if (nextStep) {
        const leg = step.travelLeg
        const has = Boolean(leg && (leg.driveMin !== null || leg.walkMin !== null))
        const fmt = (v: number | null | undefined, suffix: string) =>
          v === null || v === undefined ? "—" : `${v} ${suffix}`
        const fromLabel = decodeEntities(leg?.fromLabel || step.tripLocation || step.tripCity || step.tripTitle)
        const toLabel = decodeEntities(leg?.toLabel || nextStep.tripLocation || nextStep.tripCity || nextStep.tripTitle)
        const distanceKm = leg?.distanceKm ?? null
        const driveMin = leg?.driveMin ?? null
        const walkMin = leg?.walkMin ?? null
        const transitMin = leg?.transitMin ?? null
        const recommendWalk =
          has && walkMin !== null && ((distanceKm !== null && distanceKm <= 1.2) || (driveMin !== null && walkMin <= driveMin))
        const recommendDrive = has && !recommendWalk && driveMin !== null
        const isLive = leg?.reason === "ok"

        // arrival ETA per mode (mirrors the canvas)
        const breakMins = brk ? brk.durationMinutes ?? 0 : 0
        const baseDepart = (() => {
          if (!step.endTime) return null
          const mm = /^(\d{1,2}):(\d{2})/.exec(step.endTime)
          if (!mm) return null
          return parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) + breakMins
        })()
        const fmtClock = (total: number) => {
          const h = Math.floor(total / 60) % 24
          const mm = ((total % 60) + 60) % 60
          return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
        }
        const etaFor = (mins: number | null, lo = 0, hi = 0): string | null => {
          if (mins === null) return null
          if (baseDepart === null) return nextStep?.time ?? null
          const a = baseDepart + mins + lo
          const b = baseDepart + mins + hi
          return b > a ? `${fmtClock(a)}–${fmtClock(b)}` : fmtClock(a)
        }

        const fallbackTravel = !has && step.travelToNext ? decodeEntities(step.travelToNext) : ""
        const fbLines = fallbackTravel ? (doc.splitTextToSize(fallbackTravel, cardW - pad * 2) as string[]) : []
        // height: header(14) + from→to(12) + 3 mode lines(13 each) OR fallback lines
        const boxH = has
          ? 14 + 12 + 3 * 13 + pad
          : fallbackTravel
            ? 14 + 12 + fbLines.length * 12 + pad
            : 14 + 12 + 12 + pad
        ensure(boxH + 8)
        const top = y
        doc.setFillColor("#f1f5f9")
        doc.setDrawColor(LINE)
        doc.setLineWidth(1)
        doc.roundedRect(cardX, top, cardW, boxH, 8, 8, "FD")
        let by = top + pad + 2

        // header: TRAVEL TO NEXT STOP · {km} + live/estimated
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.setTextColor(FAINT)
        let hx = cardX + pad
        const head = "TRAVEL TO NEXT STOP"
        doc.text(head, hx, by)
        hx += doc.getTextWidth(head)
        if (distanceKm !== null && distanceKm !== undefined) {
          doc.setFont("helvetica", "normal")
          doc.setTextColor(MUTE)
          const km = `  ·  ${distanceKm} km`
          doc.text(km, hx, by)
          hx += doc.getTextWidth(km)
        }
        if (has) {
          const badge = isLive ? "live" : "estimated"
          doc.setFont("helvetica", "bold")
          doc.setFontSize(7.5)
          const bw = doc.getTextWidth(badge) + 8
          doc.setFillColor(isLive ? "#d1fae5" : "#e5e7eb")
          doc.roundedRect(hx + 6, by - 7, bw, 11, 3, 3, "F")
          doc.setTextColor(isLive ? "#047857" : MUTE)
          doc.text(badge, hx + 10, by + 1)
        }
        by += 14

        // from [arrow] to (drawn arrow — "→" doesn't render in WinAnsi Helvetica)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8.5)
        doc.setTextColor(MUTE)
        const arrowGap = 16
        const halfW = (cardW - pad * 2 - arrowGap) / 2
        const fromT = ellipsize(fromLabel, halfW)
        const toT = ellipsize(toLabel, halfW)
        doc.text(fromT, cardX + pad, by)
        const fW = doc.getTextWidth(fromT)
        drawArrow(cardX + pad + fW + 5, by - 2.5, 7, MUTE)
        doc.text(toT, cardX + pad + fW + arrowGap, by)
        by += 12

        if (has) {
          const modes: { label: string; mins: number | null; eta: string | null; rec: boolean }[] = [
            { label: "by car", mins: driveMin, eta: etaFor(driveMin, 2, 5), rec: !!recommendDrive },
            { label: "by transit", mins: transitMin, eta: etaFor(transitMin), rec: false },
            { label: "walking", mins: walkMin, eta: etaFor(walkMin), rec: !!recommendWalk },
          ]
          modes.forEach((mode) => {
            doc.setFont("helvetica", "bold")
            doc.setFontSize(9)
            doc.setTextColor(INK)
            let lx = cardX + pad
            const minTxt = fmt(mode.mins, "min")
            doc.text(minTxt, lx, by + 4)
            lx += doc.getTextWidth(minTxt) + 5
            doc.setFont("helvetica", "normal")
            doc.setFontSize(8.5)
            doc.setTextColor(MUTE)
            doc.text(mode.label, lx, by + 4)
            lx += doc.getTextWidth(mode.label) + 6
            if (mode.rec) {
              doc.setFont("helvetica", "bold")
              doc.setFontSize(7.5)
              const rw = doc.getTextWidth("Recommended") + 8
              doc.setFillColor(GREEN_BG)
              doc.roundedRect(lx, by - 4, rw, 11, 3, 3, "F")
              doc.setTextColor(GREEN_DK)
              doc.text("Recommended", lx + 4, by + 4)
            }
            if (mode.eta) {
              doc.setFont("helvetica", "normal")
              doc.setFontSize(8.5)
              doc.setTextColor(MUTE)
              const etaTxt = `ETA · ${mode.eta}`
              doc.text(etaTxt, cardX + cardW - pad, by + 4, { align: "right" })
            }
            by += 13
          })
        } else if (fallbackTravel) {
          doc.setFont("helvetica", "italic")
          doc.setFontSize(9)
          doc.setTextColor(MUTE)
          doc.text(fbLines, cardX + pad, by + 4)
        } else {
          doc.setFont("helvetica", "italic")
          doc.setFontSize(8.5)
          doc.setTextColor(MUTE)
          doc.text("Travel times unavailable — rebuild for live driving / walking times.", cardX + pad, by + 4)
        }

        y = top + boxH + 8
      } else {
        y += 4
      }
    } catch {
      /* a single bad stop must never abort the whole export */
    }
  })

  // ---- Rail connectors — one continuous green timeline through every node
  // (numbered stops AND break markers), carried across page boundaries. ------
  doc.setDrawColor(GREEN_RAIL)
  doc.setLineWidth(1.5)
  for (let k = 0; k < circleMarks.length - 1; k++) {
    const a = circleMarks[k]
    const b = circleMarks[k + 1]
    if (a.page === b.page) {
      doc.setPage(a.page)
      doc.line(a.x, a.y + a.r, b.x, b.y - b.r)
    } else {
      // span the page break: down to the bottom margin on a's page, full
      // segments on any pages in between, then top margin → b on b's page.
      doc.setPage(a.page)
      doc.line(a.x, a.y + a.r, a.x, pageH - margin)
      for (let p = a.page + 1; p < b.page; p++) {
        doc.setPage(p)
        doc.line(b.x, margin, b.x, pageH - margin)
      }
      doc.setPage(b.page)
      doc.line(b.x, margin, b.x, b.y - b.r)
    }
  }
  doc.setPage(doc.getNumberOfPages())

  // ---- Tips --------------------------------------------------------------
  const tips = (itinerary.tips || []).map((t) => decodeEntities(t)).filter(Boolean)
  if (tips.length) {
    ensure(24)
    y += 4
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
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
