import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbListIntegrations, dbUpsertIntegration, dbGetIntegration } from "@/lib/db/queries"
import { clearTourCMSConfigCache } from "@/lib/tourcms"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET() {
  try {
    await requirePermission("integrations")
    const rows = await dbListIntegrations()
    return NextResponse.json(rows)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/integrations] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * Keys that must not be written via this route because they control public
 * storefront content and require elevated (superadmin / header-footer)
 * permission managed through /api/admin/settings instead.
 */
const PROTECTED_INTEGRATION_KEYS = new Set(["announcement"])

export async function PATCH(req: Request) {
  try {
    const session = await requirePermission("integrations")
    const body = await req.json() as { key: string; label?: string; value: string } | Array<{ key: string; label?: string; value: string }>

    const items = Array.isArray(body) ? body : [body]

    for (const item of items) {
      if (!item.key) continue
      if (PROTECTED_INTEGRATION_KEYS.has(item.key)) {
        return NextResponse.json({ error: "Forbidden: that key cannot be changed via this endpoint" }, { status: 403 })
      }
      const existing = await dbGetIntegration(item.key)
      await dbUpsertIntegration(
        item.key,
        item.label ?? existing?.label ?? item.key,
        item.value ?? ""
      )
    }

    // Clear the TourCMS credential cache so new keys take effect immediately
    const hasPalisis = items.some(i => ["palisis", "palisisChannelId", "palisisMarketplaceId"].includes(i.key))
    if (hasPalisis) clearTourCMSConfigCache()

    revalidatePath("/admin/integrations")

    const changedKeys = items.filter(i => i.key).map(i => i.key)
    void logActivity({
      actor: session,
      action: "integration.update",
      entityType: "integration",
      entityId: changedKeys.length === 1 ? changedKeys[0] : undefined,
      summary: `Updated integration settings (${changedKeys.join(", ") || "none"})`,
      context: { keys: changedKeys },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/integrations] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
