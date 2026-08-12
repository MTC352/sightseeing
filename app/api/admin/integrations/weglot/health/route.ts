import { NextResponse } from "next/server"
import { requireAnyPermission } from "@/lib/auth-server"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"
import { dbGetWeglotApiKey } from "@/lib/db/queries"
import { checkWeglotKey } from "@/lib/weglot-health"

export const dynamic = "force-dynamic"

// GET the live validity of the CURRENTLY-STORED Weglot key, so the admin Weglot
// page can show a Connected / Invalid status when it opens. Never returns the
// configured key itself; the project's current key (canonicalKey, a rotated-key
// hint) is included only for superadmins, matching the integrations secret
// boundary.
export async function GET() {
  let session
  try {
    session = await requireAnyPermission(["integrations"])
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status === 403 ? 403 : 401
    return NextResponse.json({ error: status === 403 ? "Forbidden" : "Unauthorized" }, { status })
  }

  const key = await dbGetWeglotApiKey().catch(() => "")
  const health = await checkWeglotKey(key)

  const isSuperadmin = session.role === FULL_ACCESS_ROLE
  return NextResponse.json({
    status: health.status,
    message: health.message,
    projectSlug: health.projectSlug ?? null,
    // Only superadmins may see the project's current key value.
    canonicalKey: isSuperadmin ? health.canonicalKey ?? null : null,
  })
}
