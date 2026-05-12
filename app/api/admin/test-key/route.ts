import { NextResponse } from "next/server"
import { pingTourCMS } from "@/lib/tourcms"

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
      // Use the real TourCMS HMAC-signed ping endpoint.
      // The key param here is the API key; channel ID must come from env or DB.
      // We build a temporary config using the provided key so the admin can test
      // before saving — channel ID is read from env/DB as usual.
      const channelId = process.env.TOURCMS_CHANNEL_ID
        ? parseInt(process.env.TOURCMS_CHANNEL_ID, 10)
        : NaN

      if (isNaN(channelId)) {
        // No channel ID configured yet — fall back to a basic HTTP check
        // to confirm the key format is plausible (TourCMS keys are ~20 chars)
        return NextResponse.json({
          ok: key.length >= 10,
          status: "CHANNEL_ID_MISSING",
          service: "palisis",
          note: "Set TOURCMS_CHANNEL_ID in secrets to enable full connectivity test",
        })
      }

      const result = await pingTourCMS({
        channelId,
        marketplaceId: parseInt(process.env.TOURCMS_MARKETPLACE_ID ?? "0", 10) || 0,
        apiKey: key,
      })

      return NextResponse.json({
        ok: result.ok,
        service: "palisis",
        remaining_hits: result.remaining_hits,
        remaining_hits_post: result.remaining_hits_post,
        error: result.error,
      })
    }

    return NextResponse.json({ ok: false, error: "Unknown service" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ ok: false, error: msg })
  }
}
