import { generateText } from "ai"

export const maxDuration = 30
export const dynamic = "force-dynamic"

const SYSTEM_PROMPT = `You are an expert SEO analyst specializing in Luxembourg tourism and travel industry. Your goal is to help optimize trip/tour pages to rank #1 on Google and AI search engines for Luxembourg-related tourism searches.

Analyze the provided trip content and respond ONLY with a valid JSON object (no markdown, no code blocks, no explanation) with this exact structure:
{
  "overallScore": <number 0-100>,
  "keywordOpportunities": [
    {
      "keyword": "<search term>",
      "searchVolume": "<high/medium/low>",
      "difficulty": "<easy/medium/hard>",
      "currentRelevance": <number 0-100>,
      "potentialRank": "<1-3/4-10/11-20/20+>"
    }
  ],
  "improvements": [
    {
      "field": "<title/description/highlights/tags>",
      "issue": "<brief issue description>",
      "suggestion": "<specific improvement suggestion>",
      "impact": "<high/medium/low>",
      "optimizedText": "<the fully optimized replacement text>"
    }
  ],
  "strengths": ["<strength 1>", "<strength 2>"],
  "missingKeywords": ["<keyword 1>", "<keyword 2>"],
  "aiSearchOptimization": {
    "score": <number 0-100>,
    "suggestions": ["<suggestion for AI search engines>"]
  }
}

Focus on:
- Luxembourg tourism keywords (Luxembourg City tours, things to do in Luxembourg, Luxembourg sightseeing, etc.)
- Local landmarks and attractions
- Multilingual considerations (French, German, Luxembourgish)
- Long-tail keywords for specific experiences
- AI search optimization (structured content, clear answers to potential questions)

Be specific and actionable. Provide actual optimized text that can be applied with one click. Return 3-5 keyword opportunities, 2-4 improvements, and 2-3 strengths.`

export async function POST(request: Request) {
  try {
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

    const result = await generateText({
      model: "openai/gpt-4o-mini",
      system: SYSTEM_PROMPT,
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
    console.error("[seo-analyze] POST error:", error)
    return Response.json({ error: "Analysis failed. Please try again." }, { status: 500 })
  }
}
