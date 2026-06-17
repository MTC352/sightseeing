import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth-server"
import { getTourCMSConfig, pingTourCMS } from "@/lib/tourcms"

export const dynamic = "force-dynamic"

/**
 * Live TourCMS/Palisis API rate-limit status.
 *
 * Reads the GET /api/rate_limit_status.xml endpoint (which does NOT itself count
 * against quota) and returns the remaining GET/POST hits plus their hourly caps
 * so admins can monitor API usage. Admin session required.
 */
export async function GET() {
  try {
    await requirePermission("palisis")
  } catch (authErr: unknown) {
    if ((authErr as { status?: number })?.status === 403) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const config = await getTourCMSConfig()
  if (!config) {
    return NextResponse.json(
      { ok: false, error: "TourCMS credentials are not configured. Add your Palisis API key and Channel ID in Integrations." },
      { status: 200 },
    )
  }

  try {
    const status = await pingTourCMS(config)
    return NextResponse.json(status, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read rate limit status"
    return NextResponse.json({ ok: false, error: message }, { status: 200 })
  }
}
