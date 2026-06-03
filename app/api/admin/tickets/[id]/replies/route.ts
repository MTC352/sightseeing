import { NextResponse } from "next/server"
import { dbGetTicket, dbAddTicketReply } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    const { id } = await params
    const ticket = await dbGetTicket(id)
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })

    const data = await req.json()
    if (!data.message) return NextResponse.json({ error: "Message is required" }, { status: 400 })

    const reply = await dbAddTicketReply(id, {
      authorName: data.authorName ?? "Admin User",
      authorRole: data.authorRole ?? "admin",
      message: data.message,
    })

    void logActivity({
      actor: session,
      action: "ticket_reply.create",
      entityType: "ticket_reply",
      entityId: id,
      summary: `Added reply to ticket "${(ticket as { subject?: string }).subject ?? id}"`,
    })

    return NextResponse.json(reply, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && (err as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[admin/tickets/:id/replies] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
