import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const service = searchParams.get("service") ?? ""
  const key = searchParams.get("key") ?? ""

  if (!key || key.length < 4) {
    return NextResponse.json({ ok: false, error: "Key too short" })
  }

  try {
    if (service === "openWeather") {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=Luxembourg&appid=${encodeURIComponent(key)}&units=metric`
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
      const data = await r.json() as { cod?: number | string }
      const ok = r.ok && data.cod !== 401
      return NextResponse.json({ ok, status: r.status, service: "openWeather" })
    }

    if (service === "googleReviews") {
      const placeId = "ChIJ85BI1wLFlEcRJpsBgCkl8gA"
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${encodeURIComponent(key)}&fields=rating`
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
      const data = await r.json() as { status?: string }
      const ok = r.ok && data.status !== "REQUEST_DENIED" && data.status !== "INVALID_REQUEST"
      return NextResponse.json({ ok, status: data.status, service: "googleReviews" })
    }

    if (service === "palisis") {
      const url = `https://palisis.com/api/v1/products?apiKey=${encodeURIComponent(key)}`
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
      return NextResponse.json({ ok: r.ok, status: r.status, service: "palisis" })
    }

    return NextResponse.json({ ok: false, error: "Unknown service" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ ok: false, error: msg })
  }
}
