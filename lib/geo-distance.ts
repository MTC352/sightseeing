/**
 * Haversine great-circle distance between two lat/lng points, in kilometres.
 * Inputs are degrees. Returns kilometres.
 */
export function haversineKm(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371 // Earth radius in km
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Parse a "lat,lng" string (Palisis departure_geocode format). */
export function parseGeocode(
  raw: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!raw) return null
  const m = String(raw).split(",").map((s) => parseFloat(s.trim()))
  if (m.length !== 2 || !isFinite(m[0]) || !isFinite(m[1])) return null
  return { lat: m[0], lng: m[1] }
}

/**
 * Forward-geocode an address using the Mapbox Geocoding API.
 * Returns null on failure (network, no results, no token).
 * Biased to Luxembourg by default.
 */
export async function geocodeAddress(
  address: string,
  token: string,
  opts: { country?: string; signal?: AbortSignal } = {},
): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim() || !token) return null
  const country = opts.country ?? "lu"
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
    `?access_token=${encodeURIComponent(token)}&limit=1&country=${country}`
  try {
    const res = await fetch(url, { signal: opts.signal })
    if (!res.ok) return null
    const data = (await res.json()) as { features?: { center?: [number, number] }[] }
    const c = data.features?.[0]?.center
    if (!c || c.length !== 2) return null
    return { lat: c[1], lng: c[0] } // mapbox = [lng, lat]
  } catch {
    return null
  }
}
