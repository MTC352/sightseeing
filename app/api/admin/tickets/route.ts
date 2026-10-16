import { NextResponse } from "next/server"
import { dbListTickets, dbCreateTicket } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { notifyTicketEvent } from "@/lib/ticket-notifications"
import { isTicketCategory, isTicketPriority, resolveTicketAuthor, TICKET_MESSAGE_MAX } from "@/lib/ticket-fields"
import { isValidEmail } from "@/lib/job-email"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET() {
  try {
    await requirePermission("tickets")
    return NextResponse.json(await dbListTickets())
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/tickets] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("tickets")
    const data = await req.json()
    const subject = typeof data.subject === "string" ? data.subject.trim().slice(0, 200) : ""
    const description = typeof data.description === "string" ? data.description.trim().slice(0, TICKET_MESSAGE_MAX) : ""
    if (!subject || !description || !isTicketCategory(data.category) || !isTicketPriority(data.priority)) {
      return NextResponse.json({ error: "Missing or invalid fields: subject, description, category, priority" }, { status: 400 })
    }
    // Author = the person to keep informed (status changes, replies): the
    // name/email entered on the form (e.g. a client), defaulting to the
    // logged-in admin.
    const author = resolveTicketAuthor(data, session, isValidEmail)
    if (!author.ok) return NextResponse.json({ error: author.error }, { status: 400 })
    const ticket = (await dbCreateTicket({
      subject,
      description,
      category: data.category,
      priority: data.priority,
      status: "open",
      authorName: author.name,
      authorEmail: author.email,
      authorRole: author.role,
    })) as { id: string }
    void notifyTicketEvent(
      { kind: "created" },
      { id: String(ticket.id), subject, description, category: data.category, priority: data.priority, status: "open", authorName: author.name, authorEmail: author.email, authorRole: author.role },
      { name: session.name || session.email, email: session.email },
    )
    void logActivity({
      actor: session,
      action: "ticket.create",
      entityType: "ticket",
      entityId: (ticket as { id?: string | number } | null)?.id,
      summary: `Created ticket "${data.subject}"`,
    })
    return NextResponse.json(ticket, { status: 201 })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/tickets] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
