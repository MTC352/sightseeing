import { NextResponse } from "next/server"
import { pingTourCMS } from "@/lib/tourcms"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    await requireAdminSession()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
      // Accept channelId + marketplaceId from query params so the admin can test
      // with what they've typed in the form before saving.
      // Fall back to env vars if not provided.
      const paramChannelId    = searchParams.get("channelId")
      const paramMarketplaceId = searchParams.get("marketplaceId")

      const channelId = paramChannelId
        ? parseInt(paramChannelId, 10)
        : process.env.TOURCMS_CHANNEL_ID
          ? parseInt(process.env.TOURCMS_CHANNEL_ID, 10)
          : NaN

      const marketplaceId = paramMarketplaceId
        ? parseInt(paramMarketplaceId, 10)
        : process.env.TOURCMS_MARKETPLACE_ID
          ? parseInt(process.env.TOURCMS_MARKETPLACE_ID, 10)
          : 0

      if (isNaN(channelId)) {
        return NextResponse.json({
          ok: false,
          status: "CHANNEL_ID_MISSING",
          service: "palisis",
          note: "Enter a Channel ID above and try again",
        })
      }

      const result = await pingTourCMS({
        channelId,
        marketplaceId: isNaN(marketplaceId) ? 0 : marketplaceId,
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
