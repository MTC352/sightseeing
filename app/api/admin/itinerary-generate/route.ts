import { generateText } from "ai"
import { resolveAi } from "@/lib/ai/provider"
import { requireAdminSession } from "@/lib/auth-server"
import { dbGetTrip } from "@/lib/db/queries"

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

Return 3-8 steps. Order matters — first step = start of the experience, last step = end.

Respond with ONLY a valid JSON object (no markdown, no code fences):
{
  "steps": [
    { "name": "...", "description": "..." }
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

type Step = { name: string; description: string }

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
    out.push({ name: name.slice(0, 200), description: description.slice(0, 1000) })
    if (out.length >= 12) break
  }
  return out
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

    return Response.json({ ok: true, steps })
  } catch (err) {
    if (isUnauthorized(err)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[itinerary-generate] error:", err)
    return Response.json({ error: "Failed to generate itinerary." }, { status: 500 })
  }
}
