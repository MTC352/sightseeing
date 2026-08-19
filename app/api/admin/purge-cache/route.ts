/**
 * POST /api/admin/purge-cache
 *
 * Admin action — flushes the Next.js server-side render/data cache for the whole
 * site so content edits appear on prerendered (ISR) pages immediately, instead of
 * waiting for the next scheduled revalidation.
 *
 * SCOPE: this clears the ORIGIN (Next.js) cache only. It does NOT purge an
 * upstream CDN/edge cache (e.g. Cloudflare) or the visitor's browser cache — a
 * stale CDN copy of the HTML is a separate layer and must be handled at the CDN.
 * `revalidatePath("/", "layout")` invalidates every route that shares the root
 * layout (the App Router's documented "revalidate everything"); force-dynamic
 * pages are unaffected because they are never cached in the first place.
 *
 * Auth: protected by the /api/admin/* JWT proxy gate + the `integrations`
 * permission (see ROUTE_RULES in lib/admin-permissions.ts).
 */

import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    await requirePermission("integrations")
  } catch (authErr: unknown) {
    if ((authErr as { status?: number })?.status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    revalidatePath("/", "layout")
    return NextResponse.json({ ok: true, purgedAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
