import { NextResponse } from "next/server"
import { dbGetSettings, dbUpdateItineraryConfig } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { AI_PROVIDERS, modelOptions } from "@/lib/ai/models"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

// Task #15 — the itinerary route resolves the model through resolveAi, so the
// stored model only needs to be a valid id for EITHER provider. Build the
// allowlist from the canonical tier models of both providers.
const ALLOWED_MODELS = new Set<string>(
  AI_PROVIDERS.flatMap((p) => modelOptions(p).map((o) => o.value)),
)

export async function GET() {
  try {
    await requirePermission("ai-systems")
    const s = await dbGetSettings()
    return NextResponse.json(s.itineraryBehavior ?? {})
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[itinerary-config] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    await requirePermission("ai-systems")
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
    const hidePublicPlanner = typeof data.hidePublicPlanner === "boolean" ? data.hidePublicPlanner : undefined
    await dbUpdateItineraryConfig({
      systemPrompt: typeof data.systemPrompt === "string" ? data.systemPrompt : undefined,
      tipsPrompt: typeof data.tipsPrompt === "string" ? data.tipsPrompt : undefined,
      model: modelIn,
      temperature,
      maxTokens,
      showCarWidget: data.showCarWidget !== false,
      showHotelWidget: data.showHotelWidget !== false,
      maxMultiDayDays,
      hidePublicPlanner,
    })
    const s = await dbGetSettings()
    return NextResponse.json(s.itineraryBehavior ?? {})
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[itinerary-config] PUT error:", err)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
