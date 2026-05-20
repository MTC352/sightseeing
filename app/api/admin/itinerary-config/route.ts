import { NextResponse } from "next/server"
import { dbGetSettings, dbUpdateItineraryConfig } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

// Itinerary generation uses the Anthropic SDK directly — keep the allowlist
// in sync with the admin UI dropdown to prevent a misconfiguration from
// taking the planner down with a 4xx from a non-Anthropic model id.
const ALLOWED_MODELS = new Set<string>([
  "anthropic/claude-haiku-4-5-20251001",
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-opus-4-7",
])

export async function GET() {
  try {
    const s = await dbGetSettings()
    return NextResponse.json(s.itineraryBehavior ?? {})
  } catch (err) {
    console.error("[itinerary-config] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const raw = await req.json()
    const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}

    // Validate model — only allow Anthropic ids that the itinerary route can serve.
    const modelIn = typeof data.model === "string" ? data.model : undefined
    if (modelIn && !ALLOWED_MODELS.has(modelIn)) {
      return NextResponse.json({ error: `Unsupported model: ${modelIn}` }, { status: 400 })
    }
    // Clamp numeric fields to safe ranges so a bad config can't break generation.
    const temperature = typeof data.temperature === "number"
      ? Math.max(0, Math.min(1, data.temperature))
      : undefined
    const maxTokens = typeof data.maxTokens === "number"
      ? Math.max(256, Math.min(8192, Math.floor(data.maxTokens)))
      : undefined

    const maxMultiDayDays = typeof data.maxMultiDayDays === "number"
      ? Math.max(2, Math.min(14, Math.floor(data.maxMultiDayDays)))
      : undefined
    await dbUpdateItineraryConfig({
      systemPrompt: typeof data.systemPrompt === "string" ? data.systemPrompt : undefined,
      tipsPrompt: typeof data.tipsPrompt === "string" ? data.tipsPrompt : undefined,
      model: modelIn,
      temperature,
      maxTokens,
      showCarWidget: data.showCarWidget !== false,
      showHotelWidget: data.showHotelWidget !== false,
      maxMultiDayDays,
    })
    const s = await dbGetSettings()
    return NextResponse.json(s.itineraryBehavior ?? {})
  } catch (err) {
    console.error("[itinerary-config] PUT error:", err)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
