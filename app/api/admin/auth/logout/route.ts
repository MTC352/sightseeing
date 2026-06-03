import { NextResponse } from "next/server"
import { clearCookieOptions, getSession } from "@/lib/auth"
import { logActivity } from "@/lib/activity-log"

export async function POST() {
  const session = await getSession().catch(() => null)
  if (session) {
    void logActivity({
      actor: session,
      action: "auth.logout",
      entityType: "session",
      entityId: session.id,
      summary: `${session.name} signed out`,
    })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(clearCookieOptions())
  return res
}
