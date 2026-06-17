import { generateText } from "ai"
import { resolveAi } from "@/lib/ai/provider"
import { requirePermission } from "@/lib/auth-server"
import { dbGetTrip, dbGetSeoPrompts } from "@/lib/db/queries"
import { logError, logCaughtError, requestMeta } from "@/lib/error-log"
import {
  computeSeoSections,
  summarizeScore,
  scoreInputFromFields,
  ensureTitleChecks,
  ensureMeta,
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

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
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
    await requirePermission("trips")
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

    // Admin-editable creative prompt (Admin → AI Systems → SEO Optimizer),
    // falls back to the default when no override is stored.
    const { optimize: systemPrompt } = await dbGetSeoPrompts()

    const result = await generateText({
      model: ai.model,
      system: systemPrompt,
      prompt: `Optimise this trip page for SEO. Return ONLY the JSON object.\n\n${buildSource(trip)}`,
      temperature: 0.5,
      maxOutputTokens: 3000,
    })

    const parsed = extractJson(result.text)
    if (!parsed) {
      void logError({
        source: "ai:seo",
        level: "error",
        message: "SEO generate: AI returned an unparseable response.",
        statusCode: 502,
        context: { ...requestMeta(request), phase: "parse" },
      })
      return Response.json({ error: "The AI returned an unexpected response. Please try again." }, { status: 502 })
    }

    // ── Deterministic post-fix: guarantee the mechanical checks pass ──────────
    const keyword = String(parsed.keyword || "").trim() || String(trip.category || "Luxembourg tour")
    const image = String(trip.image || "")
    const slugFallback = String(trip.permalink || trip.id || "")

    const fields: SeoFields = {
      seoKeyword: keyword,
      seoTitle: ensureTitleChecks(String(parsed.title || trip.title || ""), keyword),
      seoMetaDescription: ensureMeta(String(parsed.metaDescription || ""), keyword, {
        city: String(trip.city || "Luxembourg"),
      }),
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
    if (isForbidden(err)) return Response.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[seo-generate] error:", err)
    void logCaughtError("ai:seo", err, { ...requestMeta(request), phase: "generate" })
    return Response.json({ error: "Failed to generate SEO suggestions." }, { status: 500 })
  }
}
