import { NextResponse } from "next/server"
import { syncSingleTripFromPalisis } from "@/lib/palisis-sync"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

// POST /api/admin/palisis-import/single
// body: { palisisId: string, channelId?: number }
//
// ⚠️  ONE-WAY: Re-fetches a single tour from Palisis and overrides our DB row.
// Never pushes data back to Palisis.
export async function POST(req: Request) {
  try {
    await requireAdminSession()
    const body = await req.json().catch(() => ({})) as {
      palisisId?: string
      channelId?: number
    }
    const palisisId = String(body.palisisId ?? "").trim()
    const channelId = Number(body.channelId) || undefined

    if (!palisisId) {
      return NextResponse.json({ ok: false, error: "palisisId required" }, { status: 400 })
    }

    const result = await syncSingleTripFromPalisis(palisisId, "manual", channelId)

    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (err) {
    if (err instanceof Error && (err as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[palisis-import/single] error:", err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
