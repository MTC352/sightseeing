import { NextResponse } from "next/server"
import { dbGetChatPlannerConfig, dbUpdateChatPlannerConfig, DEFAULT_PLANNER_FORM } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

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
    await requirePermission("ai-systems")
    const cfg = await dbGetChatPlannerConfig()
    return NextResponse.json(cfg)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
    await requirePermission("ai-systems")
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
      const maxInterests = Number(formIn.maxInterests)
      if (Number.isFinite(maxInterests)) {
        // No fixed upper bound — the cap is naturally the number of
        // interest tiles configured (visitors can't pick more than what
        // exists). Just ensure a positive integer.
        formPatch.maxInterests = Math.max(1, Math.floor(maxInterests))
      }
      const maxChatTurns = Number(formIn.maxChatTurns)
      if (Number.isFinite(maxChatTurns)) {
        // 0 = unlimited. Clamp to a sane upper bound so an admin typo can't set
        // an absurd value — the server budget PLANNER_BUDGET stays the hard
        // backstop regardless of this per-session UX limit.
        formPatch.maxChatTurns = Math.max(0, Math.min(200, Math.floor(maxChatTurns)))
      }
      // Refuse to delete the multi-day duration if admin replaces durations
      // without it — the multi-day stepper sub-step is referenced from code
      // by exactly that slug, removing it would silently break the cap UI.
      if (formPatch.durations && !formPatch.durations.some((d) => d.value === "multi-day")) {
        formPatch.durations.push({ value: "multi-day", label: "Multi-day trip" })
      }
      // Per-step enable/disable toggles — admin-managed on the planner-chat
      // page. Only persist explicitly-boolean values; unknown keys fall back
      // to the catalog default at read time.
      if (formIn.enabledSteps && typeof formIn.enabledSteps === "object") {
        const esIn = formIn.enabledSteps as Record<string, unknown>
        const esOut: Partial<typeof DEFAULT_PLANNER_FORM.enabledSteps> = {}
        for (const k of ["groups", "interests", "durations", "budgets", "dates"] as const) {
          if (typeof esIn[k] === "boolean") esOut[k] = esIn[k] as boolean
        }
        if (Object.keys(esOut).length > 0) {
          formPatch.enabledSteps = { ...DEFAULT_PLANNER_FORM.enabledSteps, ...esOut }
        }
      }
      if (Object.keys(formPatch).length > 0) patch.plannerForm = formPatch
    }

    await dbUpdateChatPlannerConfig(patch)
    const fresh = await dbGetChatPlannerConfig()
    return NextResponse.json(fresh)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[chat-planner-config] PUT error:", err)
    return NextResponse.json({ error: "Failed to update planner overrides" }, { status: 500 })
  }
}
