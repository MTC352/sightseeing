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

  let apiKey = (process.env.OPENWEATHER_API_KEY || "").trim()
  if (!apiKey) {
    try {
      const settings = await dbGetSettings()
      apiKey = (settings?.apiKeys?.openWeather ?? "").trim()
    } catch {
      /* ignore */
    }
  }
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
