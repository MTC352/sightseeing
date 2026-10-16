import { NextResponse } from "next/server"
import { dbGetTicket, dbAddTicketReply } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { notifyTicketEvent } from "@/lib/ticket-notifications"
import { ticketRole, TICKET_MESSAGE_MAX } from "@/lib/ticket-fields"

type TicketRow = { id: string; subject: string; status: string; authorName: string; authorEmail: string; authorRole?: string }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("tickets")
    const { id } = await params
    const ticket = (await dbGetTicket(id)) as TicketRow | null
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })

    const data = await req.json()
    const message = typeof data.message === "string" ? data.message.trim().slice(0, TICKET_MESSAGE_MAX) : ""
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 })

    // The reply author is always the logged-in admin (never taken from the request).
    const actor = { name: session.name || session.email, email: session.email }
    const reply = await dbAddTicketReply(id, {
      authorId: session.id,
      authorName: actor.name,
      authorRole: ticketRole(session.role),
      message,
    })
    void notifyTicketEvent(
      { kind: "reply", message },
      { id: ticket.id, subject: ticket.subject, status: ticket.status, authorName: ticket.authorName, authorEmail: ticket.authorEmail, authorRole: ticket.authorRole },
      actor,
    )

    void logActivity({
      actor: session,
      action: "ticket_reply.create",
      entityType: "ticket_reply",
      entityId: id,
      summary: `Added reply to ticket "${(ticket as { subject?: string }).subject ?? id}"`,
    })

    return NextResponse.json(reply, { status: 201 })
  } catch (err: unknown) {
        if (err instanceof Error && (err as { status?: number }).status === 403) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        if (err instanceof Error && (err as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[admin/tickets/:id/replies] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
