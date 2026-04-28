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

    const userMessage = `Analyze this trip/tour page for SEO optimization:

Title: ${tripData.title || "No title"}
Description: ${tripData.description || "No description"}
Category: ${tripData.category || "Unknown"}
City: ${tripData.city || "Luxembourg"}
Duration: ${tripData.duration || "Not specified"}
Price: €${tripData.price || 0}
Tags: ${(tripData.tags || []).join(", ") || "No tags"}
Highlights: ${(tripData.highlights || []).join("; ") || "No highlights"}

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
