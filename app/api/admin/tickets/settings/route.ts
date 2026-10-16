import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth-server"
import { getTicketNotificationEmails, saveTicketNotificationEmails } from "@/lib/ticket-notifications"
import { parseEmailList } from "@/lib/ticket-email"
import { isEmailConfigured } from "@/lib/email"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function authError(err: unknown) {
  const status = (err as { status?: number })?.status
  if (status === 403) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return null
}

/** GET — current ticket notification addresses + whether SMTP is configured. */
export async function GET() {
  try {
    await requirePermission("tickets")
    return NextResponse.json({ emails: await getTicketNotificationEmails(), smtpConfigured: isEmailConfigured() })
  } catch (err) {
    const res = authError(err)
    if (res) return res
    console.error("[admin/tickets/settings] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** PUT { emails: "a@x.lu, b@y.lu" | string[] } — replace the notification addresses. */
export async function PUT(req: Request) {
  try {
    const session = await requirePermission("tickets")
    const body = (await req.json().catch(() => ({}))) as { emails?: unknown }
    const { emails, invalid } = parseEmailList(body.emails)
    if (invalid.length) {
      return NextResponse.json({ error: `Invalid email address: ${invalid.join(", ")}` }, { status: 400 })
    }
    await saveTicketNotificationEmails(emails)
    void logActivity({
      actor: session,
      action: "settings.update",
      entityType: "settings",
      summary: `Updated ticket notification emails (${emails.length})`,
    })
    return NextResponse.json({ emails, smtpConfigured: isEmailConfigured() })
  } catch (err) {
    const res = authError(err)
    if (res) return res
    console.error("[admin/tickets/settings] PUT error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
