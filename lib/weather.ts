import { dbGetSettings } from "@/lib/db/queries"

// Luxembourg City coordinates — fixed for this site.
const LAT = 49.6116
const LON = 6.1319

// OpenWeather condition-code groups that mean "wet": 2xx thunderstorm,
// 3xx drizzle, 5xx rain, 6xx snow. We treat all of these as a rainy day.
function isWetCode(code: number): boolean {
  return (code >= 200 && code < 600) || (code >= 600 && code < 700)
}

let _rainCache: { set: Set<string>; expiresAt: number } | null = null

/**
 * Returns the set of upcoming YYYY-MM-DD dates (within OpenWeather's ~5-day
 * forecast window) that have rain/snow during daytime hours (09:00–18:00 local).
 *
 * Fail-soft: returns an EMPTY set on any error (no key, network, parse), so the
 * itinerary builder simply skips weather flagging rather than breaking.
 * Cached for 30 minutes — the itinerary route can call this on every build.
 */
export async function getRainyDateSet(): Promise<Set<string>> {
  if (_rainCache && Date.now() < _rainCache.expiresAt) return _rainCache.set

  // Admin panel (DB integrations) is the source of truth; env is a fallback.
  let apiKey = ""
  try {
    const settings = await dbGetSettings()
    apiKey = (settings?.apiKeys?.openWeather ?? "").trim()
  } catch {
    /* ignore — fall through to env */
  }
  if (!apiKey) apiKey = (process.env.OPENWEATHER_API_KEY || "").trim()
  if (!apiKey) {
    _rainCache = { set: new Set(), expiresAt: Date.now() + 30 * 60_000 }
    return _rainCache.set
  }

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${LAT}&lon=${LON}&units=metric&cnt=40&appid=${apiKey}`,
      { cache: "no-store" },
    )
    if (!res.ok) {
      _rainCache = { set: new Set(), expiresAt: Date.now() + 10 * 60_000 }
      return _rainCache.set
    }
    const data = (await res.json()) as {
      list?: Array<{ dt: number; weather?: Array<{ id?: number }> }>
    }
    const rainy = new Set<string>()
    for (const entry of data.list ?? []) {
      const d = new Date(entry.dt * 1000)
      const hour = d.getHours()
      if (hour < 9 || hour > 18) continue
      const code = entry.weather?.[0]?.id
      if (typeof code === "number" && isWetCode(code)) {
        rainy.add(d.toISOString().slice(0, 10))
      }
    }
    _rainCache = { set: rainy, expiresAt: Date.now() + 30 * 60_000 }
    return rainy
  } catch {
    _rainCache = { set: new Set(), expiresAt: Date.now() + 10 * 60_000 }
    return _rainCache.set
  }
}

// ── Current weather + forecast (shared by /api/weather and server routes) ──
// Server code must call getLuxembourgWeather() directly instead of fetching
// its own public /api/weather URL: that round-trips through Cloudflare and
// failed, leaving /api/outdoor-today to rank trips with placeholder weather.

// Server-side cache: keyed by "lu" (coordinates never change for this site)
const _weatherCache = new Map<string, { data: WeatherPayload; expiresAt: number }>()

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export type WeatherIcon = "sun" | "cloud-sun" | "cloud-rain"

export interface WeatherPayload {
  current: {
    temp: number
    feelsLike: number
    condition: string
    humidity: number
    wind: number
    icon: WeatherIcon
    city: string
    sunrise: number
    sunset: number
  }
  forecast: { day: string; high: number; low: number; icon: WeatherIcon; condition: string }[]
  isFallback?: boolean
}

function mapIcon(owIcon: string): WeatherIcon {
  if (owIcon.startsWith("01")) return "sun"
  if (owIcon.startsWith("09") || owIcon.startsWith("10") || owIcon.startsWith("11")) return "cloud-rain"
  return "cloud-sun"
}

function capitaliseSentence(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildFallback(reason?: string): WeatherPayload {
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

export async function getLuxembourgWeather(): Promise<WeatherPayload> {
  // cityOverride param is intentionally ignored — coordinates are fixed to Luxembourg City
  // and accepting caller-controlled city names would poison the shared server-side cache.

  // Serve from server-side cache (coordinates are fixed; one entry covers all callers)
  const CACHE_KEY = "lu"
  const cached = _weatherCache.get(CACHE_KEY)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }

  // Admin panel (DB integrations) is the source of truth; env is a fallback.
  let apiKey = ""
  try {
    const settings = await dbGetSettings()
    apiKey = settings?.apiKeys?.openWeather ?? ""
  } catch { /* ignore — fall through to env */ }
  if (!apiKey) apiKey = process.env.OPENWEATHER_API_KEY ?? ""
  if (!apiKey) {
    return buildFallback("OPENWEATHER_API_KEY not set")
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
    return buildFallback("network error")
  }

  // Non-OK response (401 invalid key, 429 rate limit, etc.) — return fallback, never throw
  if (!currentRes.ok || !forecastRes.ok) {
    const body = await currentRes.text().catch(() => "")
    console.warn(
      `[weather] OpenWeather ${currentRes.status}/${forecastRes.status} — serving fallback. ${body.slice(0, 160)}`
    )
    return buildFallback(`HTTP ${currentRes.status}`)
  }

  let current: any
  let forecast: any
  try {
    ;[current, forecast] = await Promise.all([currentRes.json(), forecastRes.json()])
  } catch (parseErr) {
    console.error("[weather] JSON parse error:", parseErr)
    return buildFallback("JSON parse error")
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
  return payload
}
