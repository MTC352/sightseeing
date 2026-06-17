import { NextResponse } from "next/server"
import { dbGetTicket, dbUpdateTicket, dbDeleteTicket } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("tickets")
    const { id } = await params
    const ticket = await dbGetTicket(id)
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    return NextResponse.json(ticket)
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
    const updated = await dbUpdateTicket(id, data)
    if (!updated) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    void logActivity({
      actor: session,
      action: "ticket.update",
      entityType: "ticket",
      entityId: id,
      summary: `Updated ticket "${(updated as { subject?: string }).subject ?? id}"`,
    })
    return NextResponse.json(updated)
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
