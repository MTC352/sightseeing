import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"
import { logActivity } from "@/lib/activity-log"
import {
  getSearchAvailabilityConfig,
  setSearchAvailabilityConfig,
  type SearchAvailabilityConfig,
} from "@/lib/search-availability-source"

export const dynamic = "force-dynamic"

function statusOf(err: unknown): number | undefined {
  return err instanceof Error ? (err as { status?: number }).status : undefined
}

/** Dev-only global search behaviour switch — superadmin only. */
async function requireSuperadmin() {
  const session = await requireAdminSession()
  if (session.role !== FULL_ACCESS_ROLE) {
    const e = new Error("Forbidden") as Error & { status?: number }
    e.status = 403
    throw e
  }
  return session
}

function errorResponse(err: unknown, tag: string) {
  const s = statusOf(err)
  if (s === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s === 403) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  console.error(`[admin/search-availability-source] ${tag} error:`, err)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function GET() {
  try {
    await requireSuperadmin()
    return NextResponse.json(await getSearchAvailabilityConfig())
  } catch (err) {
    return errorResponse(err, "GET")
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSuperadmin()
    const body = await req.json().catch(() => ({}))

    if (body?.source !== "datesndeals" && body?.source !== "checkavail") {
      return NextResponse.json(
        { error: "Invalid source. Use 'datesndeals' or 'checkavail'." },
        { status: 400 },
      )
    }
    if (!Number.isFinite(Number(body?.datesndealsCacheMs)) || !Number.isFinite(Number(body?.checkavailCacheMs))) {
      return NextResponse.json(
        { error: "datesndealsCacheMs and checkavailCacheMs must be numbers (ms)." },
        { status: 400 },
      )
    }

    // setSearchAvailabilityConfig clamps to safe bounds, so out-of-range values
    // are coerced rather than rejected.
    const config = await setSearchAvailabilityConfig({
      source: body.source,
      datesndealsCacheMs: Number(body.datesndealsCacheMs),
      checkavailCacheMs: Number(body.checkavailCacheMs),
    } as SearchAvailabilityConfig)

    void logActivity({
      actor: session,
      action: "settings.search-availability-source",
      entityType: "setting",
      entityId: "search_availability_source",
      summary:
        `Set search availability: source='${config.source}', ` +
        `datesndeals cache=${config.datesndealsCacheMs}ms, checkavail cache=${config.checkavailCacheMs}ms`,
    })
    return NextResponse.json(config)
  } catch (err) {
    return errorResponse(err, "POST")
  }
}
