/**
 * POST /api/admin/seo-fix
 *
 * AI-powered SEO fixer. Receives a fix type + current content and returns
 * an improved version powered by OpenAI via the Vercel AI Gateway.
 *
 * Fix types:
 *   title-sentiment    — add a sentiment word to the title
 *   title-power-word   — add a power word to the title
 *   title-number       — add a number to the title
 *   content-expand     — expand description to 600+ words
 *   short-paragraphs   — break long paragraphs into shorter ones
 *   meta-description   — write an optimised meta description
 */

import { generateText } from "ai"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const PROMPTS: Record<string, (p: { currentValue: string; focusKeyword: string; category?: string; city?: string }) => string> = {
  "title-sentiment": ({ currentValue, focusKeyword }) =>
    `You are an SEO expert for a Luxembourg tourism website. The current SEO title is: "${currentValue}". ` +
    `Add one compelling positive sentiment word (like "Breathtaking", "Unforgettable", "Stunning", "Magical", "Wonderful", "Spectacular") ` +
    `to make it more emotionally engaging. Keep the focus keyword "${focusKeyword}" in the title. ` +
    `Keep the title under 60 characters. Return ONLY the improved title, no explanation.`,

  "title-power-word": ({ currentValue, focusKeyword }) =>
    `You are an SEO expert for a Luxembourg tourism website. The current SEO title is: "${currentValue}". ` +
    `Add one power word (like "Ultimate", "Best", "Top", "Essential", "Premium", "Complete", "Expert", "Exclusive") ` +
    `at a natural position. Keep the focus keyword "${focusKeyword}" in the title. ` +
    `Keep the title under 60 characters. Return ONLY the improved title, no explanation.`,

  "title-number": ({ currentValue, focusKeyword }) =>
    `You are an SEO expert for a Luxembourg tourism website. The current SEO title is: "${currentValue}". ` +
    `Naturally incorporate a relevant number (a duration in hours, a count of highlights, a year, or a price range) ` +
    `to make it more specific and engaging. Keep the focus keyword "${focusKeyword}" in the title. ` +
    `Keep the title under 60 characters. Return ONLY the improved title, no explanation.`,

  "content-expand": ({ currentValue, focusKeyword, category, city }) =>
    `You are an SEO and travel content writer for a Luxembourg tourism platform. ` +
    `Expand the following trip description to at least 600 words. Use the focus keyword "${focusKeyword}" naturally 3-5 times throughout. ` +
    `Category: ${category ?? "Tours"}. City/Region: ${city ?? "Luxembourg"}. ` +
    `Write in an engaging, conversational tone. Include what makes the experience special, what visitors will see/do, ` +
    `practical tips, and a short call-to-action at the end. ` +
    `Current description:\n"${currentValue}"\n\nReturn ONLY the expanded description, no explanation.`,

  "short-paragraphs": ({ currentValue, focusKeyword }) =>
    `You are a content editor. Rewrite the following trip description by breaking any long paragraphs ` +
    `into shorter ones (maximum 3-4 sentences per paragraph, separated by blank lines). ` +
    `Keep ALL the same information — do not add or remove content. Focus keyword: "${focusKeyword}". ` +
    `Current description:\n"${currentValue}"\n\nReturn ONLY the restructured description, no explanation.`,

  "meta-description": ({ currentValue, focusKeyword, category, city }) =>
    `You are an SEO expert for a Luxembourg tourism website. Write an optimised meta description for this trip. ` +
    `Trip title: "${currentValue}". Category: ${category ?? "Tours"}. City: ${city ?? "Luxembourg"}. ` +
    `Focus keyword: "${focusKeyword}". ` +
    `Requirements: 140-160 characters, include the focus keyword naturally, include a call to action (e.g. "Book now", "Discover", "Explore"). ` +
    `Return ONLY the meta description text, no explanation.`,
}

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    const body = await request.json()
    const { fixType, currentValue, focusKeyword = "", tripData = {} } = body

    if (!fixType || !PROMPTS[fixType]) {
      return Response.json({ error: `Unknown fix type: ${fixType}` }, { status: 400 })
    }

    const prompt = PROMPTS[fixType]({
      currentValue: currentValue ?? "",
      focusKeyword,
      category: tripData.category,
      city: tripData.city,
    })

    const { text } = await generateText({
      model: "openai/gpt-4o-mini",
      prompt,
      temperature: 0.7,
      maxOutputTokens: 1200,
    })

    return Response.json({ result: text.trim() })
  } catch (err) {
    if (err instanceof Error && (err as { status?: number }).status === 401) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[seo-fix] error:", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "AI request failed" },
      { status: 500 },
    )
  }
}
