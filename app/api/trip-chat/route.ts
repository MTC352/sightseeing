import { convertToModelMessages, streamText, UIMessage, validateUIMessages } from "ai"
import { dbGetTrip, dbGetSettings, dbListTrips, dbListPosts, dbListJobs } from "@/lib/db/queries"
import { getTripById, getTripDetail } from "@/lib/data"

export const maxDuration = 30
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { tripId } = body as { tripId: string }

    let messages: UIMessage[]
    try {
      messages = await validateUIMessages<UIMessage>({ messages: body.messages, tools: {} })
    } catch {
      messages = body.messages ?? []
    }

    // Load everything in parallel: DB trip, site-wide config, knowledge base
    const [dbRow, settings, allTrips, allPosts, allJobs] = await Promise.all([
      dbGetTrip(tripId).catch(() => null),
      dbGetSettings(),
      dbListTrips({ publicOnly: true }).catch(() => []),
      dbListPosts().catch(() => []),
      dbListJobs().catch(() => []),
    ])

    // Trip data: DB row is canonical; fall back to static lib/data.ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbTrip = dbRow as Record<string, any> | null
    const staticTrip = getTripById(tripId)
    const staticDetail = getTripDetail(tripId)

    if (!dbTrip && !staticTrip) {
      return new Response(JSON.stringify({ error: "Trip not found" }), { status: 404 })
    }

    // Merge DB + static for richest context
    const title      = dbTrip?.title_override ?? dbTrip?.title ?? staticTrip?.title ?? ""
    const category   = dbTrip?.category ?? staticTrip?.category ?? "Tours"
    const city       = dbTrip?.city ?? staticTrip?.city ?? "Luxembourg"
    const duration   = dbTrip?.duration ?? staticTrip?.duration ?? ""
    const price      = Number(dbTrip?.price ?? staticTrip?.price ?? 0)
    const rating     = Number(dbTrip?.rating ?? staticTrip?.rating ?? 0)
    const reviews    = Number(dbTrip?.reviewCount ?? staticTrip?.reviewCount ?? 0)
    const description = dbTrip?.description || staticDetail?.description || staticTrip?.description || ""
    const highlights  = (Array.isArray(dbTrip?.highlights) && dbTrip.highlights.length > 0)
      ? dbTrip.highlights
      : (staticDetail?.highlights ?? staticTrip?.highlights ?? [])
    const tags        = (Array.isArray(dbTrip?.tags) && dbTrip.tags.length > 0)
      ? dbTrip.tags
      : (staticTrip?.tags ?? [])
    const permalink   = dbTrip?.permalink ?? staticTrip?.permalink ?? null

    // Build the current-trip context block
    const tripContext = [
      `Title: ${title}`,
      `Category: ${category}`,
      `City: ${city}`,
      `Duration: ${duration}`,
      `Price: ${price > 0 ? price + " EUR per person" : "Free"}`,
      `Rating: ${rating}/5 (${reviews} reviews)`,
      description ? `Description: ${description}` : "",
      (highlights as string[]).length ? `Highlights: ${(highlights as string[]).join(", ")}` : "",
      staticDetail?.includes?.length ? `Includes: ${staticDetail.includes.join(", ")}` : "",
      staticDetail?.notIncluded?.length ? `Not included: ${staticDetail.notIncluded.join(", ")}` : "",
      staticDetail?.itinerary?.length
        ? `Itinerary: ${staticDetail.itinerary.map(s => `${s.title}${s.duration ? " (" + s.duration + ")" : ""}`).join(" → ")}`
        : "",
      staticDetail?.goodToKnow?.length
        ? `FAQ:\n${staticDetail.goodToKnow.map(q => `  Q: ${q.question}\n  A: ${q.answer}`).join("\n")}`
        : "",
      staticDetail?.maxGroupSize ? `Max group size: ${staticDetail.maxGroupSize}` : "",
      staticDetail?.languages?.length ? `Languages: ${staticDetail.languages.join(", ")}` : "",
      staticDetail?.cancellationPolicy?.length
        ? `Cancellation policy: ${staticDetail.cancellationPolicy.join(". ")}`
        : "",
      tags.length ? `Tags: ${(tags as string[]).join(", ")}` : "",
      permalink ? `Booking URL: ${permalink}` : "",
    ].filter(Boolean).join("\n")

    // ── Site-wide knowledge base ─────────────────────────────────────────────
    // Published trips catalog (capped to avoid token bloat)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tripRows = allTrips as any[]
    const catalogLines = tripRows
      .filter(t => (t.status === "published" || t.status == null) && String(t.id) !== tripId)
      .slice(0, 60)
      .map(t =>
        `• ${t.title_override ?? t.title} | ${t.category} | ${t.city ?? "Luxembourg"} | ${Number(t.price) > 0 ? Number(t.price) + " EUR" : "Free"} | ${t.duration}`
      )
      .join("\n")

    // Published blog articles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postRows = allPosts as any[]
    const blogLines = postRows
      .filter(p => p.status === "published")
      .slice(0, 20)
      .map(p => `• ${p.title}${p.excerpt ? ": " + p.excerpt : ""}`)
      .join("\n")

    // Open job listings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobRows = allJobs as any[]
    const jobLines = jobRows
      .filter(j => j.status === "published" || j.status === "open" || j.status == null)
      .slice(0, 10)
      .map(j => `• ${j.title}${j.location ? " — " + j.location : ""}`)
      .join("\n")

    // ── Admin-configurable system prompt ─────────────────────────────────────
    const chatCfg = (settings.ai as Record<string, Record<string, unknown>>)?.chat ?? {}
    const adminPrompt  = (chatCfg.systemPrompt as string)?.trim() || ""
    const model        = (chatCfg.model as string) || "anthropic/claude-opus-4.6"
    const temperature  = typeof chatCfg.temperature === "number" ? chatCfg.temperature : 0.5
    const maxTokens    = typeof chatCfg.maxTokens  === "number" ? chatCfg.maxTokens  : 512

    // ── Compose full system prompt ────────────────────────────────────────────
    const systemPrompt = `You are the AI concierge for sightseeing.lu — a curated tourism platform for Luxembourg. You are embedded on the booking page for the following trip and should answer questions about it.

## CURRENT TRIP
${tripContext}

## SIGHTSEEING.LU CATALOG (other experiences)
${catalogLines || "(no other trips available)"}

## BLOG ARTICLES
${blogLines || "(no blog articles)"}

## OPEN POSITIONS
${jobLines || "(none)"}

## BEHAVIOUR RULES
1. Your primary focus is answering questions about the CURRENT TRIP above.
2. When relevant, you may reference other catalog trips (e.g. "You might also enjoy…").
3. For complex multi-day itinerary planning, combining multiple trips, or custom route optimisation → redirect the user to the AI Trip Planner: "For a personalised full-day or multi-day itinerary, try our AI Trip Planner at sightseeing.lu/planner — it can mix and sequence multiple experiences for you."
4. Keep answers concise: 2–4 sentences. No markdown. No bullet points.
5. Luxembourg has free nationwide public transport — mention it when travel or getting-there questions arise.
6. Be warm, enthusiastic, and helpful. Encourage booking.
7. If you do not know a specific detail, say so honestly and suggest contacting the provider directly.${adminPrompt ? `\n\n## OPERATOR INSTRUCTIONS\n${adminPrompt}` : ""}`

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      maxTokens,
      temperature,
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("[trip-chat] POST error:", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
