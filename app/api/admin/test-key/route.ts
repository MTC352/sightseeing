import { NextResponse } from "next/server"
import { pingTourCMS } from "@/lib/tourcms"
import { requireAdminSession } from "@/lib/auth-server"
import { logError } from "@/lib/error-log"

export const dynamic = "force-dynamic"

interface TestResult {
  ok: boolean
  service: string
  status?: number | string
  message: string
  details?: Record<string, unknown>
}

const TIMEOUT = 8000

interface TestRequest {
  service?: string
  key?: string
  placeId?: string
  channelId?: string
  marketplaceId?: string
}

// POST (not GET) so the API key travels in the request body, never in a URL
// query string — query strings leak into browser history, proxy/access logs
// and observability traces.
export async function POST(req: Request) {
  try {
    await requireAdminSession()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as TestRequest
  const service = body.service ?? ""
  const key = (body.key ?? "").trim()

  if (!key || key.length < 4) {
    return NextResponse.json({
      ok: false,
      service,
      message: "No key entered, or the key is too short. Paste the key above and try again.",
    } satisfies TestResult)
  }

  let result: TestResult
  try {
    result = await runTest(service, key, body)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed"
    result = { ok: false, service, message: msg }
  }

  // Persist failed connectivity tests so admins have an audit trail.
  // Fire-and-forget so a DB hiccup never delays or blocks the test response.
  if (!result.ok) {
    void logError({
      source: `test-key:${service || "unknown"}`,
      message: result.message,
      statusCode: typeof result.status === "number" ? result.status : null,
      context: { service, status: result.status, details: result.details },
    })
  }

  return NextResponse.json(result)
}

async function runTest(
  service: string,
  key: string,
  params: TestRequest
): Promise<TestResult> {
  switch (service) {
    case "openWeather": {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=Luxembourg&appid=${encodeURIComponent(key)}&units=metric`
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
      const data = (await r.json().catch(() => ({}))) as { cod?: number | string; message?: string; name?: string }
      const ok = r.ok && data.cod !== 401 && String(data.cod) !== "401"
      return {
        ok,
        service,
        status: r.status,
        message: ok
          ? `Valid — fetched live weather for ${data.name ?? "Luxembourg"}.`
          : `Rejected by OpenWeather: ${data.message ?? "invalid API key"}.`,
        details: { cod: data.cod },
      }
    }

    case "googleReviews": {
      const placeId = params.placeId?.trim() || "ChIJ85BI1wLFlEcRJpsBgCkl8gA"
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&key=${encodeURIComponent(key)}&fields=rating`
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
      const data = (await r.json().catch(() => ({}))) as { status?: string; error_message?: string }
      const ok = r.ok && data.status !== "REQUEST_DENIED" && data.status !== "INVALID_REQUEST"
      return {
        ok,
        service,
        status: data.status,
        message: ok
          ? "Valid — Google Places accepted the key."
          : `Rejected by Google: ${data.error_message ?? data.status ?? "request denied"}.`,
        details: { googleStatus: data.status },
      }
    }

    case "anthropic": {
      // /v1/models is a cheap authenticated GET — 200 if the key is valid,
      // 401 "invalid x-api-key" if not. No tokens are consumed.
      const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(TIMEOUT),
      })
      const data = (await r.json().catch(() => ({}))) as { error?: { message?: string }; data?: unknown[] }
      const ok = r.ok
      return {
        ok,
        service,
        status: r.status,
        message: ok
          ? "Valid — Anthropic accepted the key."
          : `Rejected by Anthropic (${r.status}): ${data.error?.message ?? "invalid API key"}.`,
        details: { error: data.error?.message },
      }
    }

    case "openai": {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(TIMEOUT),
      })
      const data = (await r.json().catch(() => ({}))) as { error?: { message?: string } }
      const ok = r.ok
      return {
        ok,
        service,
        status: r.status,
        message: ok
          ? "Valid — OpenAI accepted the key."
          : `Rejected by OpenAI (${r.status}): ${data.error?.message ?? "invalid API key"}.`,
        details: { error: data.error?.message },
      }
    }

    case "mapbox": {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/Luxembourg.json?access_token=${encodeURIComponent(key)}&limit=1`
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
      const data = (await r.json().catch(() => ({}))) as { message?: string; features?: unknown[] }
      const ok = r.ok && Array.isArray(data.features)
      return {
        ok,
        service,
        status: r.status,
        message: ok
          ? "Valid — Mapbox accepted the token."
          : `Rejected by Mapbox (${r.status}): ${data.message ?? "invalid token"}.`,
        details: { error: data.message },
      }
    }

    case "weglot": {
      const url = `https://api.weglot.com/projects/settings?api_key=${encodeURIComponent(key)}`
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
      const ok = r.status !== 401 && r.status !== 403 && r.status < 500
      return {
        ok,
        service,
        status: r.status,
        message: ok
          ? "Valid — Weglot accepted the key."
          : `Rejected by Weglot (${r.status}): invalid API key.`,
      }
    }

    case "palisis": {
      const paramChannelId = params.channelId
      const paramMarketplaceId = params.marketplaceId

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
        return {
          ok: false,
          service,
          status: "CHANNEL_ID_MISSING",
          message: "Enter a Channel ID above and try again.",
        }
      }

      const ping = await pingTourCMS({
        channelId,
        marketplaceId: isNaN(marketplaceId) ? 0 : marketplaceId,
        apiKey: key,
      })

      return {
        ok: ping.ok,
        service,
        message: ping.ok
          ? `Valid — TourCMS responded (API hits remaining: ${ping.remaining_hits ?? "n/a"}).`
          : `Rejected by TourCMS: ${ping.error ?? "authentication failed"}.`,
        details: {
          remaining_hits: ping.remaining_hits,
          remaining_hits_post: ping.remaining_hits_post,
        },
      }
    }

    default:
      return { ok: false, service, message: `Testing is not supported for "${service}".` }
  }
}
