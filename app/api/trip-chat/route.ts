import { convertToModelMessages, streamText, UIMessage, validateUIMessages } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { dbGetTrip, dbGetSettings, dbListTrips, dbListPosts, dbListJobs, dbTripStatus } from "@/lib/db/queries"
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
      // publicOnly: never expose archived/draft trip data to the AI concierge
      dbGetTrip(tripId, { publicOnly: true }).catch(() => null),
      dbGetSettings(),
      dbListTrips({ publicOnly: true }).catch(() => []),
      dbListPosts().catch(() => []),
      dbListJobs().catch(() => []),
    ])

    // Trip data: DB row is canonical; fall back to static lib/data.ts ONLY
    // when the trip does NOT exist in our DB at all. If it exists but is
    // archived/draft, dbRow is null but we must NOT leak static-seed content.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbTrip = dbRow as Record<string, any> | null
    let staticTrip = getTripById(tripId)
    let staticDetail = getTripDetail(tripId)

    if (!dbTrip) {
      // Alias-aware probe: matches id OR palisis_id so an archived
      // `tcms_<palisisId>` cannot be reached via the raw numeric id and
      // shadowed by static seed content.
      let anyStatus: string | null = null
      try {
        anyStatus = await dbTripStatus(tripId)
      } catch {
        // Fail-closed: if we can't verify status, refuse rather than risk
        // leaking archived/draft content via static seed.
        return new Response(JSON.stringify({ error: "Trip lookup failed" }), { status: 503 })
      }
      if (anyStatus !== null) {
        // Trip exists in our DB under either identifier but is not published
        // — refuse to expose any content. Treat as not-found.
        return new Response(JSON.stringify({ error: "Trip not found" }), { status: 404 })
      }
    }

    if (!dbTrip && !staticTrip) {
      return new Response(JSON.stringify({ error: "Trip not found" }), { status: 404 })
    }
    // When DB row is present, static seed must NOT shadow archive semantics —
    // but it's fine to use it for legacy enrichment alongside a published row.
    if (!dbTrip) {
      // Pure static fallback path: trip is unknown to our DB; keep static.
    } else {
      // DB-backed published trip: prefer DB; static is supplemental enrichment.
      staticTrip = staticTrip ?? undefined
      staticDetail = staticDetail ?? undefined
    }

    // Merge DB + static for richest context. DB row is canonical (Palisis-synced);
    // staticDetail is a legacy fallback for trips not yet in the DB.
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

    // Palisis-imported fields (prefer DB; fall back to legacy staticDetail where applicable)
    const included     = (Array.isArray(dbTrip?.included)  && dbTrip.included.length  > 0) ? dbTrip.included  : (staticDetail?.includes ?? [])
    const excluded     = (Array.isArray(dbTrip?.excluded)  && dbTrip.excluded.length  > 0) ? dbTrip.excluded  : (staticDetail?.notIncluded ?? [])
    const languagesArr = (Array.isArray(dbTrip?.languages) && dbTrip.languages.length > 0) ? dbTrip.languages : (staticDetail?.languages ?? [])
    const tripTags     = Array.isArray(dbTrip?.tripTags) ? dbTrip.tripTags : []

    const tourType            = dbTrip?.tourType ?? null
    const tourLeader          = dbTrip?.tourLeader ?? null
    const grade               = dbTrip?.grade ?? null
    const accommodationRating = dbTrip?.accommodationRating ?? null
    const country             = dbTrip?.country ?? null
    const departureLocation   = dbTrip?.departureLocation ?? null
    const endLocation         = dbTrip?.endLocation ?? null
    const shortDesc           = dbTrip?.shortDescription ?? null
    const longDesc            = dbTrip?.longDescription ?? null
    const itineraryText       = dbTrip?.itinerary ?? null
    const essentialInfo       = dbTrip?.essentialInformation ?? null
    const pickupInstr         = dbTrip?.hotelPickupInstructions ?? null
    const redemptionInstr     = dbTrip?.voucherRedemptionInstructions ?? null
    const restrictions        = dbTrip?.restrictions ?? null
    const extras              = dbTrip?.extras ?? null
    const cancellationPolicy  = dbTrip?.cancellationPolicy
      ?? (staticDetail?.cancellationPolicy?.length ? staticDetail.cancellationPolicy.join(". ") : null)
    const minBooking          = dbTrip?.minBookingSize ?? null
    const maxBooking          = dbTrip?.maxBookingSize ?? (staticDetail?.maxGroupSize ?? null)
    const nonRefundable       = dbTrip?.nonRefundable ?? null
    const nextBookableDate    = dbTrip?.nextBookableDate ?? null
    const lastBookableDate    = dbTrip?.lastBookableDate ?? null

    // Build the current-trip context block (Palisis-rich)
    const tripContext = [
      `Title: ${title}`,
      `Category: ${category}`,
      tourType ? `Tour Type: ${tourType}` : "",
      tourLeader ? `Tour Leader: ${tourLeader}` : "",
      grade ? `Difficulty / Grade: ${grade}` : "",
      accommodationRating ? `Accommodation Rating: ${accommodationRating}` : "",
      `City: ${city}`,
      country ? `Country: ${country}` : "",
      departureLocation ? `Departure Location: ${departureLocation}` : "",
      endLocation && endLocation !== departureLocation ? `End Location: ${endLocation}` : "",
      `Duration: ${duration}`,
      `Price: ${price > 0 ? price + " EUR per person" : "Free"}`,
      `Rating: ${rating}/5 (${reviews} reviews)`,
      shortDesc ? `Short Description: ${shortDesc}` : "",
      description ? `Description: ${description}` : "",
      longDesc && longDesc !== description ? `Long Description: ${longDesc}` : "",
      (highlights as string[]).length ? `Highlights: ${(highlights as string[]).join(", ")}` : "",
      (included as string[]).length ? `Includes: ${(included as string[]).join(", ")}` : "",
      (excluded as string[]).length ? `Not included: ${(excluded as string[]).join(", ")}` : "",
      itineraryText
        ? `Itinerary: ${itineraryText}`
        : (staticDetail?.itinerary?.length
            ? `Itinerary: ${staticDetail.itinerary.map(s => `${s.title}${s.duration ? " (" + s.duration + ")" : ""}`).join(" → ")}`
            : ""),
      essentialInfo ? `Essential Information: ${essentialInfo}` : "",
      pickupInstr ? `Hotel Pickup: ${pickupInstr}` : "",
      redemptionInstr ? `Voucher Redemption: ${redemptionInstr}` : "",
      restrictions ? `Restrictions: ${restrictions}` : "",
      extras ? `Extras / Upgrades: ${extras}` : "",
      cancellationPolicy ? `Cancellation Policy: ${cancellationPolicy}` : "",
      minBooking != null || maxBooking != null
        ? `Group Size: ${minBooking ?? "any"}–${maxBooking ?? "any"} people`
        : "",
      nonRefundable === true ? `Refundable: No (non-refundable)` : "",
      nextBookableDate ? `Next Bookable Date: ${nextBookableDate}` : "",
      lastBookableDate ? `Last Bookable Date: ${lastBookableDate}` : "",
      (languagesArr as string[]).length ? `Languages: ${(languagesArr as string[]).join(", ")}` : "",
      staticDetail?.goodToKnow?.length
        ? `FAQ:\n${staticDetail.goodToKnow.map(q => `  Q: ${q.question}\n  A: ${q.answer}`).join("\n")}`
        : "",
      tags.length ? `Tags: ${(tags as string[]).join(", ")}` : "",
      (tripTags as string[]).length ? `Trip Tags: ${(tripTags as string[]).join(", ")}` : "",
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
    const rawModel     = ((chatCfg.model as string) || "claude-sonnet-4-5").trim()
    // Strip any "anthropic/" prefix left over from the old Vercel AI Gateway config
    const modelId      = rawModel.startsWith("anthropic/") ? rawModel.slice("anthropic/".length) : rawModel
    const temperature  = typeof chatCfg.temperature === "number" ? chatCfg.temperature : 0.5
    const maxTokens    = typeof chatCfg.maxTokens  === "number" ? chatCfg.maxTokens  : 512

    // Resolve Anthropic API key: prefer DB-stored integration, fall back to env secret
    const apiKeys = (settings.apiKeys ?? {}) as Record<string, string>
    const dbAnthropicKey =
      apiKeys.anthropic ||
      apiKeys.anthropic_api_key ||
      apiKeys.anthropicApiKey ||
      ""
    const apiKey = (dbAnthropicKey || process.env.ANTHROPIC_API_KEY || "").trim()
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured. Set ANTHROPIC_API_KEY or add it under Admin → Integrations." }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      )
    }

    const anthropic = createAnthropic({ apiKey })

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
      model: anthropic(modelId),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      maxOutputTokens: maxTokens,
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
