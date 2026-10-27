import { NextResponse } from "next/server"
import { dbGetTicket, dbUpdateTicket, dbDeleteTicket } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { notifyTicketEvent } from "@/lib/ticket-notifications"
import { isTicketPriority, isTicketStatus, resolveTicketAuthor } from "@/lib/ticket-fields"
import { isValidEmail } from "@/lib/job-email"
import { withTicketAttachments, removeTicketAttachmentFiles } from "@/lib/ticket-attachments"

type TicketRow = { id: string; subject: string; status: string; authorName: string; authorEmail: string; authorRole?: string }

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("tickets")
    const { id } = await params
    const ticket = (await dbGetTicket(id)) as TicketRow | null
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    return NextResponse.json(await withTicketAttachments(ticket, session))
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/tickets/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("tickets")
    const { id } = await params
    const data = await req.json()
    // Editable: status / priority (known values only) and the author contact
    // (who is notified about status changes and replies).
    const patch: Record<string, unknown> = {}
    if ("authorEmail" in data || "authorName" in data) {
      const author = resolveTicketAuthor(data, session, isValidEmail)
      if (!author.ok) return NextResponse.json({ error: author.error }, { status: 400 })
      patch.authorEmail = author.email
      patch.authorName = author.name
      patch.authorRole = author.role
    }
    if ("status" in data) {
      if (!isTicketStatus(data.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })
      patch.status = data.status
    }
    if ("priority" in data) {
      if (!isTicketPriority(data.priority)) return NextResponse.json({ error: "Invalid priority" }, { status: 400 })
      patch.priority = data.priority
    }
    const before = (await dbGetTicket(id)) as TicketRow | null
    if (!before) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    const updated = (await dbUpdateTicket(id, patch)) as TicketRow | null
    if (!updated) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    if (patch.status && patch.status !== before.status) {
      void notifyTicketEvent(
        { kind: "status", from: before.status, to: String(patch.status) },
        { id: updated.id, subject: updated.subject, status: updated.status, authorName: updated.authorName, authorEmail: updated.authorEmail, authorRole: updated.authorRole },
        { name: session.name || session.email, email: session.email },
      )
    }
    void logActivity({
      actor: session,
      action: "ticket.update",
      entityType: "ticket",
      entityId: id,
      summary: `Updated ticket "${(updated as { subject?: string }).subject ?? id}"`,
    })
    return NextResponse.json(await withTicketAttachments(updated, session))
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/tickets/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("tickets")
    const { id } = await params
    await dbDeleteTicket(id)
    // Rows cascade with the ticket; the files on disk must be removed here.
    await removeTicketAttachmentFiles(id).catch((err) =>
      console.error("[admin/tickets/:id] failed to remove attachment files:", err),
    )
    void logActivity({
      actor: session,
      action: "ticket.delete",
      entityType: "ticket",
      entityId: id,
      summary: `Deleted ticket ${id}`,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/tickets/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
