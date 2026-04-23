import { NextRequest, NextResponse } from "next/server"
import { addTicketReply, getTicket } from "@/lib/admin-store"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const ticket = getTicket(id)
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }

    const data = await request.json()
    
    if (!data.message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      )
    }

    const reply = addTicketReply(id, {
      authorId: data.authorId || "admin_1",
      authorName: data.authorName || "Admin User",
      authorRole: data.authorRole || "admin",
      message: data.message,
    })

    if (!reply) {
      return NextResponse.json(
        { error: "Failed to add reply" },
        { status: 500 }
      )
    }

    return NextResponse.json(reply, { status: 201 })
  } catch (error) {
    console.error("Error adding reply:", error)
    return NextResponse.json(
      { error: "Failed to add reply" },
      { status: 500 }
    )
  }
}
