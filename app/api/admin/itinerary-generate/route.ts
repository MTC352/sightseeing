import { generateText } from "ai"
import { resolveAi } from "@/lib/ai/provider"
import { requirePermission } from "@/lib/auth-server"
import { dbGetTrip, dbGetSettings } from "@/lib/db/queries"
import { TRIP_ITINERARY_SYSTEM_PROMPT } from "@/lib/ai/trip-itinerary-prompt"
import { logError, logCaughtError, requestMeta } from "@/lib/error-log"

export const maxDuration = 45
export const dynamic = "force-dynamic"

/** AI System key — admin-managed prompt/model/temp/tokens for this tool. */
const SYSTEM_KEY = "trip_itinerary"

/** Default geocoding country: these experiences are in Luxembourg. */
const DEFAULT_COUNTRY = "lu"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

const SYSTEM_PROMPT = TRIP_ITINERARY_SYSTEM_PROMPT

/** Map a country name appearing in free text to its ISO-3166 alpha-2 code. */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  luxembourg: "lu",
  letzebuerg: "lu",
  germany: "de",
  deutschland: "de",
  france: "fr",
  belgium: "be",
  belgique: "be",
  belgie: "be",
  netherlands: "nl",
  holland: "nl",
  nederland: "nl",
}

/** Detect an explicitly-named country in free text; null when none is present. */
function countryCodeFromText(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.toLowerCase()
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) return code
  }
  return null
}

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
 *  `country` is an ISO-3166 alpha-2 filter (defaults to Luxembourg upstream).
 *  Returns null on any failure so location stays optional and fail-soft. */
async function geocode(
  query: string,
  token: string,
  country: string,
): Promise<{ lat: number; lng: number; placeName: string } | null> {
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?limit=1&country=${encodeURIComponent(country)}&access_token=${encodeURIComponent(token)}`
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
 *  with no query or a failed lookup keep no coordinates — locations are optional.
 *  `baseCountry` is the default geocoding country (Luxembourg unless the trip
 *  itself is elsewhere); a step's query may explicitly name another country to
 *  widen to it (a stated cross-border excursion). */
async function attachLocations(steps: Step[], token: string, baseCountry: string): Promise<void> {
  if (!token) return
  await Promise.all(
    steps.map(async (step) => {
      if (!step.locationQuery) return
      const explicit = countryCodeFromText(step.locationQuery)
      const country = explicit ?? baseCountry
      const hit = await geocode(step.locationQuery, token, country)
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
    await requirePermission("trips")
    const { tripId } = await request.json()
    if (!tripId || typeof tripId !== "string") {
      return Response.json({ error: "tripId is required." }, { status: 400 })
    }

    const trip = (await dbGetTrip(tripId)) as Record<string, unknown> | null
    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 })
    }

    // One settings round-trip feeds both the admin prompt and resolveAi.
    const settings = await dbGetSettings()
    const aiCfg = (settings.ai as Record<string, { systemPrompt?: unknown }> | undefined)?.[SYSTEM_KEY]
    const systemPrompt =
      typeof aiCfg?.systemPrompt === "string" && aiCfg.systemPrompt.trim()
        ? aiCfg.systemPrompt
        : SYSTEM_PROMPT

    // Active provider + this system's model/temp/tokens (provider switch remaps
    // the model tier automatically).
    const ai = await resolveAi({ systemKey: SYSTEM_KEY, defaultTier: "fast", settings })
    if (!ai.model) {
      return Response.json(
        { error: "AI is not configured. Add an Anthropic or OpenAI API key in Admin → Integrations." },
        { status: 503 },
      )
    }

    const result = await generateText({
      model: ai.model,
      system: systemPrompt,
      prompt: `Write the step-by-step itinerary for this experience. Return ONLY the JSON object.\n\n${buildSource(trip)}`,
      temperature: typeof ai.temperature === "number" ? ai.temperature : 0.6,
      maxOutputTokens: typeof ai.maxTokens === "number" ? ai.maxTokens : 1500,
    })

    const parsed = extractJson(result.text)
    const steps = normalizeSteps(parsed?.steps)
    if (steps.length === 0) {
      void logError({
        source: "ai:itinerary-generate",
        level: "error",
        message: "Trip itinerary generation: AI returned no usable steps.",
        statusCode: 502,
        context: { ...requestMeta(request), phase: "parse" },
      })
      return Response.json({ error: "The AI returned an unexpected response. Please try again." }, { status: 502 })
    }

    // Resolve the optional per-step locations to coordinates (fail-soft — a
    // missing Mapbox key or geocode miss simply leaves the step un-pinned).
    // Default to Luxembourg; honor a trip explicitly set in another country.
    const mapboxToken = await getMapboxToken()
    const baseCountry = countryCodeFromText(String(trip.country ?? "")) ?? DEFAULT_COUNTRY
    await attachLocations(steps, mapboxToken, baseCountry)

    return Response.json({ ok: true, steps })
  } catch (err) {
    if (isForbidden(err)) return Response.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[itinerary-generate] error:", err)
    void logCaughtError("ai:itinerary-generate", err, { ...requestMeta(request), phase: "generate" })
    return Response.json({ error: "Failed to generate itinerary." }, { status: 500 })
  }
}
