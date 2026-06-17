import { NextResponse } from "next/server"
import { dbGetSettings, dbUpdateSeoConfig } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

/**
 * GET /api/admin/seo-config
 * Returns the three editable SEO prompts (optimize / fix / analyze), falling
 * back to the hardcoded defaults when no admin override exists.
 */
export async function GET() {
  try {
    await requirePermission("ai-systems")
    const s = await dbGetSettings()
    return NextResponse.json(s.seoBehavior ?? {})
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[seo-config] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * PUT /api/admin/seo-config  { optimize, fix, analyze }
 * Persists any provided prompt (partial-safe) and snapshots a revision for each.
 */
export async function PUT(req: Request) {
  try {
    await requirePermission("ai-systems")
    const raw = await req.json()
    const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}

    await dbUpdateSeoConfig({
      optimizePrompt: typeof data.optimize === "string" ? data.optimize : undefined,
      fixPrompt: typeof data.fix === "string" ? data.fix : undefined,
      analyzePrompt: typeof data.analyze === "string" ? data.analyze : undefined,
    })

    const s = await dbGetSettings()
    return NextResponse.json(s.seoBehavior ?? {})
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[seo-config] PUT error:", err)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
