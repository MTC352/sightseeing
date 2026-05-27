import { NextResponse } from "next/server"
import {
  dbGetPromptRevision,
  dbUpdateAiSystem,
  dbUpdateChatPlannerConfig,
  dbUpdateItineraryConfig,
} from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/prompt-revisions/[id]/activate
 *
 * Restores a previous prompt revision by routing it back through the
 * appropriate update path. The update path re-records a revision (the
 * dedupe check ensures we don't create a duplicate row).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idRaw } = await params
  const id = Number(idRaw)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid revision id" }, { status: 400 })
  }
  try {
    await requireAdminSession()
    const revision = await dbGetPromptRevision(id)
    if (!revision) {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 })
    }
    const { systemKey, promptKind, promptText } = revision

    if (systemKey === "chat" && promptKind === "plannerSystemPrompt") {
      await dbUpdateChatPlannerConfig({ plannerSystemPrompt: promptText })
    } else if (systemKey === "itinerary" && promptKind === "systemPrompt") {
      await dbUpdateItineraryConfig({ systemPrompt: promptText })
    } else if (systemKey === "itinerary" && promptKind === "tipsPrompt") {
      await dbUpdateItineraryConfig({ tipsPrompt: promptText })
    } else if (promptKind === "systemPrompt") {
      // Generic AI system row (chat per-trip prompt, help, blog, planner legacy).
      await dbUpdateAiSystem(systemKey, { systemPrompt: promptText })
    } else {
      return NextResponse.json(
        { error: `Unsupported revision target: ${systemKey}/${promptKind}` },
        { status: 400 },
      )
    }
    return NextResponse.json({ ok: true, activated: { id, systemKey, promptKind } })
  } catch (err: unknown) {
    if (err instanceof Error && (err as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[prompt-revisions] activate error:", err)
    return NextResponse.json({ error: "Failed to activate revision" }, { status: 500 })
  }
}
