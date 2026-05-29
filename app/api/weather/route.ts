import { NextResponse } from "next/server"
import { dbGetSettings } from "@/lib/db/queries"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"

// Luxembourg City coordinates — fixed, so one server-side cache entry covers all callers
const LAT = 49.6116
const LON = 6.1319

// Server-side cache: keyed by "lu" (coordinates never change for this site)
const _weatherCache = new Map<string, { data: unknown; expiresAt: number }>()

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

type WeatherIcon = "sun" | "cloud-sun" | "cloud-rain"

function mapIcon(owIcon: string): WeatherIcon {
  if (owIcon.startsWith("01")) return "sun"
  if (owIcon.startsWith("09") || owIcon.startsWith("10") || owIcon.startsWith("11")) return "cloud-rain"
  return "cloud-sun"
}

function capitaliseSentence(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildFallback(reason?: string) {
  if (reason) console.warn(`[weather] Serving static fallback — ${reason}`)
  const today = new Date()
  return {
    current: {
      temp: 11,
      feelsLike: 9,
      condition: "Partly Cloudy",
      humidity: 72,
      wind: 18,
      icon: "cloud-sun" as WeatherIcon,
      city: "Luxembourg City",
      sunrise: 0,
      sunset: 0,
    },
    forecast: Array.from({ length: 4 }).map((_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() + i + 1)
      return {
        day: DAY_LABELS[d.getDay()],
        high: 12 + i,
        low: 6 + i,
        icon: (i % 2 === 0 ? "cloud-sun" : "sun") as WeatherIcon,
        condition: i % 2 === 0 ? "Partly Cloudy" : "Sunny",
      }
    }),
    isFallback: true,
  }
}

export async function GET(request: Request) {
  schedulePrune()
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000 })
  if (!rl.allowed) return rl.response

  // cityOverride param is intentionally ignored — coordinates are fixed to Luxembourg City
  // and accepting caller-controlled city names would poison the shared server-side cache.

  // Serve from server-side cache (coordinates are fixed; one entry covers all callers)
  const CACHE_KEY = "lu"
  const cached = _weatherCache.get(CACHE_KEY)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data)
  }

  let apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    try {
      const settings = await dbGetSettings()
      apiKey = settings?.apiKeys?.openWeather ?? ""
    } catch { /* ignore */ }
  }
  if (!apiKey) {
    return NextResponse.json(buildFallback("OPENWEATHER_API_KEY not set"))
  }

  let currentRes: Response
  let forecastRes: Response

  try {
    ;[currentRes, forecastRes] = await Promise.all([
      fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&units=metric&appid=${apiKey}`,
        { cache: "no-store" }
      ),
      fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${LAT}&lon=${LON}&units=metric&cnt=40&appid=${apiKey}`,
        { cache: "no-store" }
      ),
    ])
  } catch (networkErr) {
    console.error("[weather] Network error fetching OpenWeather:", networkErr)
    return NextResponse.json(buildFallback("network error"))
  }

  // Non-OK response (401 invalid key, 429 rate limit, etc.) — return fallback, never throw
  if (!currentRes.ok || !forecastRes.ok) {
    const body = await currentRes.text().catch(() => "")
    console.warn(
      `[weather] OpenWeather ${currentRes.status}/${forecastRes.status} — serving fallback. ${body.slice(0, 160)}`
    )
    return NextResponse.json(buildFallback(`HTTP ${currentRes.status}`))
  }

  let current: any
  let forecast: any
  try {
    ;[current, forecast] = await Promise.all([currentRes.json(), forecastRes.json()])
  } catch (parseErr) {
    console.error("[weather] JSON parse error:", parseErr)
    return NextResponse.json(buildFallback("JSON parse error"))
  }

  const currentData = {
    temp: Math.round(current.main.temp),
    feelsLike: Math.round(current.main.feels_like),
    condition: capitaliseSentence(current.weather[0].description),
    humidity: current.main.humidity,
    wind: Math.round(current.wind.speed * 3.6),
    icon: mapIcon(current.weather[0].icon),
    city: current.name ?? "Luxembourg City",
    sunrise: current.sys.sunrise,
    sunset: current.sys.sunset,
  }

  // Pick one representative entry per future day (prefer noon slot)
  const todayKey = new Date().toISOString().slice(0, 10)
  const seen = new Set<string>()
  const dailyForecasts: { day: string; high: number; low: number; icon: WeatherIcon; condition: string }[] = []

  for (const entry of forecast.list) {
    const d = new Date(entry.dt * 1000)
    const key = d.toISOString().slice(0, 10)
    if (key === todayKey || seen.has(key)) continue
    if (d.getHours() < 11 || d.getHours() > 14) continue
    seen.add(key)
    dailyForecasts.push({
      day: DAY_LABELS[d.getDay()],
      high: Math.round(entry.main.temp_max),
      low: Math.round(entry.main.temp_min),
      icon: mapIcon(entry.weather[0].icon),
      condition: capitaliseSentence(entry.weather[0].description),
    })
    if (dailyForecasts.length >= 4) break
  }

  // Fill gaps with first unseen slots if noon slots were sparse
  if (dailyForecasts.length < 4) {
    for (const entry of forecast.list) {
      const d = new Date(entry.dt * 1000)
      const key = d.toISOString().slice(0, 10)
      if (key === todayKey || seen.has(key)) continue
      seen.add(key)
      dailyForecasts.push({
        day: DAY_LABELS[d.getDay()],
        high: Math.round(entry.main.temp_max),
        low: Math.round(entry.main.temp_min),
        icon: mapIcon(entry.weather[0].icon),
        condition: capitaliseSentence(entry.weather[0].description),
      })
      if (dailyForecasts.length >= 4) break
    }
  }

  const payload = { current: currentData, forecast: dailyForecasts }
  _weatherCache.set(CACHE_KEY, { data: payload, expiresAt: Date.now() + 10 * 60_000 })
  return NextResponse.json(payload)
}
