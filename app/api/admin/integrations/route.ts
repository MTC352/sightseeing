import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbListIntegrations, dbUpsertIntegration, dbGetIntegration } from "@/lib/db/queries"
import { clearTourCMSConfigCache } from "@/lib/tourcms"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET() {
  try {
    await requireAdminSession()
    const rows = await dbListIntegrations()
    return NextResponse.json(rows)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/integrations] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession()
    const body = await req.json() as { key: string; label?: string; value: string } | Array<{ key: string; label?: string; value: string }>

    const items = Array.isArray(body) ? body : [body]

    for (const item of items) {
      if (!item.key) continue
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
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/integrations] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
