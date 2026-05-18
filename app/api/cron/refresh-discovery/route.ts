/**
 * POST/GET /api/cron/refresh-discovery
 *
 * Triggered by a Replit Scheduled Deployment every 1 minute.
 * Also exposed for manual invocation from /admin/integrations.
 *
 * Query params:
 *   force=1  — bypass the discovery-interval TTL gate (admin manual refresh)
 */

import { NextRequest, NextResponse } from "next/server"
import { refreshDiscovery, isAuthorizedCron } from "@/lib/departing-soon-cache"

export const dynamic = "force-dynamic"

async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }
  const force = req.nextUrl.searchParams.get("force") === "1"
  const result = await refreshDiscovery(force)
  if (!("ok" in result) || !result.ok) {
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json(result)
}

export const POST = handle
export const GET = handle
