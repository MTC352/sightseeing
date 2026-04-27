import { NextResponse } from "next/server"
import { dbGetTicket, dbAddTicketReply } from "@/lib/db/queries"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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

    return NextResponse.json(reply, { status: 201 })
  } catch (err) {
    console.error("[admin/tickets/:id/replies] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
