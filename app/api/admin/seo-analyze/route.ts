import { generateText } from "ai"
import { resolveAi } from "@/lib/ai/provider"
import { requireAdminSession } from "@/lib/auth-server"
import { dbGetSeoPrompts } from "@/lib/db/queries"

export const maxDuration = 30
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    const { tripData } = await request.json()

    // Build the SEO input from BOTH the basic fields and the Palisis-imported
    // classification + long-form fields so suggestions can reference real
    // catalog data (tour type, leader style, included items, itinerary, etc.).
    const lines: string[] = [
      `Title: ${tripData.title || "No title"}`,
      `Short Description: ${tripData.shortDescription || "—"}`,
      `Description: ${tripData.description || "No description"}`,
      tripData.longDescription ? `Long Description: ${tripData.longDescription}` : "",
      `Category: ${tripData.category || "Unknown"}`,
      tripData.tourType ? `Tour Type: ${tripData.tourType}` : "",
      tripData.tourLeader ? `Tour Leader: ${tripData.tourLeader}` : "",
      tripData.grade ? `Difficulty / Grade: ${tripData.grade}` : "",
      tripData.accommodationRating ? `Accommodation Rating: ${tripData.accommodationRating}` : "",
      `City: ${tripData.city || "Luxembourg"}`,
      tripData.country ? `Country: ${tripData.country}` : "",
      tripData.departureLocation ? `Departure Location: ${tripData.departureLocation}` : "",
      tripData.endLocation ? `End Location: ${tripData.endLocation}` : "",
      `Duration: ${tripData.duration || "Not specified"}`,
      `Price: €${tripData.price || 0}`,
      `Tags: ${(tripData.tags || []).join(", ") || "No tags"}`,
      Array.isArray(tripData.tripTags) && tripData.tripTags.length
        ? `Trip Tags (Palisis): ${tripData.tripTags.join(", ")}` : "",
      Array.isArray(tripData.languages) && tripData.languages.length
        ? `Languages: ${tripData.languages.join(", ")}` : "",
      `Highlights: ${(tripData.highlights || []).join("; ") || "No highlights"}`,
      Array.isArray(tripData.included) && tripData.included.length
        ? `Includes: ${tripData.included.join("; ")}` : "",
      Array.isArray(tripData.excluded) && tripData.excluded.length
        ? `Excludes: ${tripData.excluded.join("; ")}` : "",
      tripData.itinerary ? `Itinerary: ${tripData.itinerary}` : "",
      tripData.essentialInformation ? `Essential Information: ${tripData.essentialInformation}` : "",
      tripData.hotelPickupInstructions ? `Hotel Pickup: ${tripData.hotelPickupInstructions}` : "",
      tripData.voucherRedemptionInstructions ? `Voucher Redemption: ${tripData.voucherRedemptionInstructions}` : "",
      tripData.restrictions ? `Restrictions: ${tripData.restrictions}` : "",
      tripData.extras ? `Extras / Upgrades: ${tripData.extras}` : "",
      tripData.cancellationPolicy ? `Cancellation Policy: ${tripData.cancellationPolicy}` : "",
      tripData.minBookingSize != null || tripData.maxBookingSize != null
        ? `Group Size: ${tripData.minBookingSize ?? "any"}–${tripData.maxBookingSize ?? "any"}` : "",
      tripData.nonRefundable === true ? `Refundable: No (non-refundable)` : "",
      tripData.nextBookableDate ? `Next Bookable Date: ${tripData.nextBookableDate}` : "",
      tripData.lastBookableDate ? `Last Bookable Date: ${tripData.lastBookableDate}` : "",
    ].filter(Boolean)

    const userMessage = `Analyze this trip/tour page for SEO optimization:

${lines.join("\n")}

Provide SEO analysis and optimization suggestions. Return ONLY the JSON object, nothing else.`

    // Task #15 — route through the active provider's fast model.
    const ai = await resolveAi({ defaultTier: "fast" })
    if (!ai.model) {
      return Response.json(
        { error: "AI is not configured. Add an Anthropic or OpenAI API key in Admin → Integrations." },
        { status: 503 },
      )
    }

    // Admin-editable creative prompt (Admin → AI Systems → SEO Optimizer),
    // falls back to the default when no override is stored.
    const { analyze: systemPrompt } = await dbGetSeoPrompts()

    const result = await generateText({
      model: ai.model,
      system: systemPrompt,
      prompt: userMessage,
      temperature: 0.3,
      maxOutputTokens: 2000,
    })

    // Extract the text and try to parse as JSON
    let analysisText = result.text.trim()
    
    // Remove markdown code blocks if present
    if (analysisText.startsWith("```")) {
      analysisText = analysisText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
    }

    // Parse and validate JSON
    const analysis = JSON.parse(analysisText)
    
    return Response.json(analysis)
  } catch (error) {
    if (error instanceof Error && (error as { status?: number }).status === 401) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[seo-analyze] POST error:", error)
    return Response.json({ error: "Analysis failed. Please try again." }, { status: 500 })
  }
}
