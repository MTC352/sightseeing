import { generateText } from "ai"
import { resolveAi } from "@/lib/ai/provider"
import { requireAdminSession } from "@/lib/auth-server"
import { dbGetTrip } from "@/lib/db/queries"
import {
  computeSeoSections,
  summarizeScore,
  scoreInputFromFields,
  ensureTitleChecks,
  ensureHighlights,
  ensureBody,
  slugifyWithKeyword,
  stripHtml,
  type SeoFields,
} from "@/lib/seo/score"

export const maxDuration = 45
export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

const SYSTEM_PROMPT = `You are an elite SEO copywriter for sightseeing.lu, a Luxembourg tourism & tour-booking site. You optimise a single trip page to score ~100/100 on a RankMath-style audit.

You will be given the trip's source content. Do TWO things:
1. Choose the single best FOCUS KEYWORD — a realistic, searchable phrase a tourist would type (e.g. "Luxembourg city tour", "wine tasting Moselle"). 2-4 words, lowercase.
2. Write fully-optimised SEO fields that satisfy ALL of these constraints:

FOCUS KEYWORD usage:
- Appears in the title, near the START.
- Appears in the meta description.
- Appears in the FIRST sentence of the body.
- Appears naturally 4-8 times across the body (keyword density ~1%).
- Appears in at least one highlight/subheading.

TITLE (catchy, click-worthy):
- Starts with (or very near) the focus keyword.
- Contains a POWER word (e.g. Ultimate, Best, Essential, Complete, Premium, Expert).
- Contains a SENTIMENT word (e.g. Unforgettable, Stunning, Breathtaking, Amazing, Scenic, Iconic).
- Contains a NUMBER (e.g. a year, hours, "Top 5").

META DESCRIPTION: 140-160 chars, compelling, includes the keyword and a call to action.

BODY: Valid HTML, 600+ words, written as engaging travel copy. Use multiple SHORT <p> paragraphs (each under 100 words) and a few <h3> subheadings. Include at least one external DoFollow link (e.g. to https://www.visitluxembourg.com) and at least one internal link to another site section (href must start with /trip/, /explore/, /departures/, /blog/ or /help/). Real, useful prose — no filler.

HIGHLIGHTS: 3-6 short bullet strings; at least one contains the focus keyword.

SLUG: short, hyphenated, lowercase, contains the keyword, max 75 chars.

Respond with ONLY a valid JSON object (no markdown, no code fences):
{
  "keyword": "...",
  "title": "...",
  "metaDescription": "...",
  "body": "<p>...</p>...",
  "highlights": ["...", "..."],
  "slug": "..."
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
    g("highlights") ? `Highlights: ${g("highlights")}` : "",
    g("included") ? `Includes: ${g("included")}` : "",
    g("itinerary") ? `Itinerary: ${stripHtml(g("itinerary"))}` : "",
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
      prompt: `Optimise this trip page for SEO. Return ONLY the JSON object.\n\n${buildSource(trip)}`,
      temperature: 0.5,
      maxOutputTokens: 3000,
    })

    const parsed = extractJson(result.text)
    if (!parsed) {
      return Response.json({ error: "The AI returned an unexpected response. Please try again." }, { status: 502 })
    }

    // ── Deterministic post-fix: guarantee the mechanical checks pass ──────────
    const keyword = String(parsed.keyword || "").trim() || String(trip.category || "Luxembourg tour")
    const image = String(trip.image || "")
    const slugFallback = String(trip.permalink || trip.id || "")

    const fields: SeoFields = {
      seoKeyword: keyword,
      seoTitle: ensureTitleChecks(String(parsed.title || trip.title || ""), keyword),
      seoMetaDescription: (() => {
        let m = String(parsed.metaDescription || "").trim()
        if (!m) m = `${keyword} — discover the best of Luxembourg. Book your unforgettable experience today.`
        if (!m.toLowerCase().includes(keyword.toLowerCase())) m = `${keyword}: ${m}`
        return m
      })(),
      seoBody: ensureBody(String(parsed.body || trip.description || ""), keyword, {
        city: String(trip.city || "Luxembourg"),
      }),
      seoHighlights: ensureHighlights(
        Array.isArray(parsed.highlights) ? parsed.highlights.map((h) => String(h)) : [],
        keyword,
      ),
      seoSlug: slugifyWithKeyword(String(parsed.slug || keyword), slugFallback),
    }

    const sections = computeSeoSections(scoreInputFromFields(fields, image))
    const summary = summarizeScore(sections)

    return Response.json({
      fields,
      score: summary.score,
      passingCount: summary.passingCount,
      totalCount: summary.totalCount,
      sections,
      hasImage: !!image,
    })
  } catch (err) {
    if (isUnauthorized(err)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[seo-generate] error:", err)
    return Response.json({ error: "Failed to generate SEO suggestions." }, { status: 500 })
  }
}
