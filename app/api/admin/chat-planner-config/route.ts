import { NextResponse } from "next/server"
import { dbGetChatPlannerConfig, dbUpdateChatPlannerConfig, DEFAULT_PLANNER_FORM } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

/**
 * Admin GET/PUT for the planner overrides that live under the
 * "Trip Chat" admin card — i.e. the planner system-prompt override
 * and the editable onboarding form (groups, interests, durations,
 * budgets, multi-day cap).
 *
 * Kept separate from /api/admin/chat-config (per-trip chat fields)
 * so a partial PUT to one doesn't risk clobbering the other.
 */
export async function GET() {
  try {
    const cfg = await dbGetChatPlannerConfig()
    return NextResponse.json(cfg)
  } catch (err) {
    console.error("[chat-planner-config] GET error:", err)
    return NextResponse.json({
      plannerSystemPrompt: "",
      plannerForm: DEFAULT_PLANNER_FORM,
    })
  }
}

type LooseOption = { value?: unknown; label?: unknown }

function sanitiseList(input: unknown): { value: string; label: string }[] | undefined {
  if (!Array.isArray(input)) return undefined
  const cleaned = (input as LooseOption[])
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      // Force-lowercase the value key so admin can't introduce options that
      // mismatch what the planner page persists (cookie + AI tools assume
      // lower-case slugs).
      value: typeof x.value === "string" ? x.value.trim().toLowerCase().replace(/\s+/g, "-") : "",
      label: typeof x.label === "string" ? x.label.trim().slice(0, 60) : "",
    }))
    .filter((x) => x.value.length > 0 && x.label.length > 0 && /^[a-z0-9-]+$/.test(x.value))
  // De-dupe by value (last write wins).
  const seen = new Map<string, { value: string; label: string }>()
  for (const o of cleaned) seen.set(o.value, o)
  const out = Array.from(seen.values()).slice(0, 24) // hard cap so an admin typo can't blow up the UI
  return out.length > 0 ? out : undefined
}

export async function PUT(req: Request) {
  try {
    const raw = await req.json()
    const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}

    const patch: Parameters<typeof dbUpdateChatPlannerConfig>[0] = {}

    if (typeof data.plannerSystemPrompt === "string") {
      // Soft length cap so a paste-bomb can't blow up the JSON column.
      patch.plannerSystemPrompt = data.plannerSystemPrompt.slice(0, 20000)
    }

    if (data.plannerForm && typeof data.plannerForm === "object") {
      const formIn = data.plannerForm as Record<string, unknown>
      const formPatch: Partial<typeof DEFAULT_PLANNER_FORM> = {}
      const groups = sanitiseList(formIn.groups); if (groups) formPatch.groups = groups
      const interests = sanitiseList(formIn.interests); if (interests) formPatch.interests = interests
      const durations = sanitiseList(formIn.durations); if (durations) formPatch.durations = durations
      const budgets = sanitiseList(formIn.budgets); if (budgets) formPatch.budgets = budgets
      const maxDays = Number(formIn.maxMultiDayDays)
      if (Number.isFinite(maxDays)) {
        formPatch.maxMultiDayDays = Math.max(2, Math.min(14, Math.floor(maxDays)))
      }
      // Refuse to delete the multi-day duration if admin replaces durations
      // without it — the multi-day stepper sub-step is referenced from code
      // by exactly that slug, removing it would silently break the cap UI.
      if (formPatch.durations && !formPatch.durations.some((d) => d.value === "multi-day")) {
        formPatch.durations.push({ value: "multi-day", label: "Multi-day trip" })
      }
      if (Object.keys(formPatch).length > 0) patch.plannerForm = formPatch
    }

    await dbUpdateChatPlannerConfig(patch)
    const fresh = await dbGetChatPlannerConfig()
    return NextResponse.json(fresh)
  } catch (err) {
    console.error("[chat-planner-config] PUT error:", err)
    return NextResponse.json({ error: "Failed to update planner overrides" }, { status: 500 })
  }
}
