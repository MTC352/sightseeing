import { generateText } from "ai"
import { resolveAi } from "@/lib/ai/provider"
import { requireAdminSession } from "@/lib/auth-server"
import { dbGetTrip, dbGetSettings } from "@/lib/db/queries"

export const maxDuration = 45
export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

const SYSTEM_PROMPT = `You are a Luxembourg travel expert writing the step-by-step itinerary for a single tour/experience page on sightseeing.lu.

Produce a realistic, well-ordered list of itinerary steps a guest follows during THIS experience — the places they visit and stops they make, in chronological order. Base it strictly on the trip details provided; never invent attractions that wouldn't plausibly be part of this tour.

Each step must have:
- "name": the stop / place / activity title — short (2-7 words), specific (e.g. "Vianden Castle", "Old Town walking tour", "Moselle wine tasting").
- "description": 1-2 engaging sentences (max ~45 words) describing what happens at this stop and why it's worth it. Plain travel prose, no marketing fluff, no emojis.
- "location" (OPTIONAL): a real, geocodable place name to pin on a map — ONLY when the step refers to a specific, searchable physical place (a named museum, castle, landmark, square, restaurant, town center). Make it precise and unambiguous by including the town and country, e.g. "European Schengen Museum, Schengen, Luxembourg" or "Vianden Castle, Luxembourg". OMIT "location" entirely for vague or non-mappable stops such as "Lunch break", "Free time", "Return journey", or generic activities that have no single fixed place.

Return 3-8 steps. Order matters — first step = start of the experience, last step = end.

Respond with ONLY a valid JSON object (no markdown, no code fences):
{
  "steps": [
    { "name": "...", "description": "...", "location": "Optional Place, Town, Country" }
  ]
}`

function buildSource(trip: Record<string, unknown>): string {
  const g = (k: string) => {
    const v = trip[k]
    if (v == null) return ""
    if (Array.isArray(v)) return v.join("; ")
    return String(v)
  }
  return [
    `Title: ${g("title") || "—"}`,
    `Short Description: ${g("shortDescription") || "—"}`,
    `Description: ${stripHtml(g("description")) || "—"}`,
    g("longDescription") ? `Long Description: ${stripHtml(g("longDescription"))}` : "",
    `Category: ${g("category") || "—"}`,
    `City: ${g("city") || "Luxembourg"}`,
    g("country") ? `Country: ${g("country")}` : "",
    g("tourType") ? `Tour Type: ${g("tourType")}` : "",
    g("duration") ? `Duration: ${g("duration")}` : "",
    g("departureLocation") ? `Departure: ${g("departureLocation")}` : "",
    g("endLocation") ? `End: ${g("endLocation")}` : "",
    g("highlights") ? `Highlights: ${g("highlights")}` : "",
    g("included") ? `Includes: ${g("included")}` : "",
    g("itinerary") ? `Existing itinerary notes: ${stripHtml(g("itinerary"))}` : "",
    g("tags") ? `Tags: ${g("tags")}` : "",
  ].filter(Boolean).join("\n")
}

function extractJson(text: string): Record<string, unknown> | null {
  let t = text.trim()
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
  const start = t.indexOf("{")
  const end = t.lastIndexOf("}")
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}

type Step = {
  name: string
  description: string
  /** Raw geocode query the AI proposed (resolved to lat/lng later). */
  locationQuery?: string
  lat?: number
  lng?: number
  placeName?: string
}

function normalizeSteps(raw: unknown): Step[] {
  if (!Array.isArray(raw)) return []
  const out: Step[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const name = stripHtml(String(r.name ?? r.title ?? "")).trim()
    const description = stripHtml(String(r.description ?? r.desc ?? "")).trim()
    // Each step requires BOTH a name and a description — skip incomplete rows.
    if (!name || !description) continue
    const locRaw = r.location ?? r.place ?? r.placeName
    const locationQuery =
      typeof locRaw === "string" && locRaw.trim() ? stripHtml(locRaw).trim().slice(0, 200) : undefined
    out.push({ name: name.slice(0, 200), description: description.slice(0, 1000), locationQuery })
    if (out.length >= 12) break
  }
  return out
}

/** Server-side Mapbox token: admin DB key wins, env is the fallback. */
async function getMapboxToken(): Promise<string> {
  let token = ""
  try {
    const settings = await dbGetSettings()
    token = settings?.apiKeys?.mapbox ?? ""
  } catch {
    /* fall through to env */
  }
  if (!token) {
    token =
      process.env.mapbox ??
      process.env.MAPBOX ??
      process.env.MAPBOX_TOKEN ??
      process.env.MAPBOX_ACCESS_TOKEN ??
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
      ""
  }
  return typeof token === "string" && token.startsWith("pk.") ? token : ""
}

/** Resolve a place-name query into coordinates via the Mapbox Geocoding API.
 *  Returns null on any failure so location stays optional and fail-soft. */
async function geocode(
  query: string,
  token: string,
): Promise<{ lat: number; lng: number; placeName: string } | null> {
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?limit=1&country=lu,de,fr,be&access_token=${encodeURIComponent(token)}`
    const r = await fetch(url)
    if (!r.ok) return null
    const d = await r.json()
    const feat = Array.isArray(d?.features) ? d.features[0] : null
    const c = feat?.center
    if (!Array.isArray(c) || c.length < 2) return null
    const lng = Number(c[0])
    const lat = Number(c[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng, placeName: String(feat.place_name ?? query) }
  } catch {
    return null
  }
}

/** Geocode each step's optional location query (bounded, in parallel). Steps
 *  with no query or a failed lookup keep no coordinates — locations are optional. */
async function attachLocations(steps: Step[], token: string): Promise<void> {
  if (!token) return
  await Promise.all(
    steps.map(async (step) => {
      if (!step.locationQuery) return
      const hit = await geocode(step.locationQuery, token)
      if (hit) {
        step.lat = hit.lat
        step.lng = hit.lng
        step.placeName = hit.placeName
      }
    }),
  )
  // Drop the raw query from the response — only resolved coords matter to the client.
  for (const s of steps) delete s.locationQuery
}

/**
 * Generate a structured, ordered itinerary (array of { name, description })
 * for a single trip using the admin-configured AI provider. The result is
 * returned to the client for review/editing — it is NOT persisted here (the
 * admin saves it with the normal trip Save). Entirely separate from the
 * /planner Trip Planner engine.
 */
export async function POST(request: Request) {
  try {
    await requireAdminSession()
    const { tripId } = await request.json()
    if (!tripId || typeof tripId !== "string") {
      return Response.json({ error: "tripId is required." }, { status: 400 })
    }

    const trip = (await dbGetTrip(tripId)) as Record<string, unknown> | null
    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 })
    }

    const ai = await resolveAi({ defaultTier: "fast" })
    if (!ai.model) {
      return Response.json(
        { error: "AI is not configured. Add an Anthropic or OpenAI API key in Admin → Integrations." },
        { status: 503 },
      )
    }

    const result = await generateText({
      model: ai.model,
      system: SYSTEM_PROMPT,
      prompt: `Write the step-by-step itinerary for this experience. Return ONLY the JSON object.\n\n${buildSource(trip)}`,
      temperature: 0.6,
      maxOutputTokens: 1500,
    })

    const parsed = extractJson(result.text)
    const steps = normalizeSteps(parsed?.steps)
    if (steps.length === 0) {
      return Response.json({ error: "The AI returned an unexpected response. Please try again." }, { status: 502 })
    }

    // Resolve the optional per-step locations to coordinates (fail-soft — a
    // missing Mapbox key or geocode miss simply leaves the step un-pinned).
    const mapboxToken = await getMapboxToken()
    await attachLocations(steps, mapboxToken)

    return Response.json({ ok: true, steps })
  } catch (err) {
    if (isUnauthorized(err)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[itinerary-generate] error:", err)
    return Response.json({ error: "Failed to generate itinerary." }, { status: 500 })
  }
}
