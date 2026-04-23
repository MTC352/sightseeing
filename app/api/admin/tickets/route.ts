import { NextRequest, NextResponse } from "next/server"
import { listTickets, createTicket } from "@/lib/admin-store"

export async function GET() {
  const tickets = listTickets()
  return NextResponse.json(tickets)
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Validate required fields
    if (!data.subject || !data.description || !data.category || !data.priority) {
      return NextResponse.json(
        { error: "Missing required fields: subject, description, category, priority" },
        { status: 400 }
      )
    }

    const ticket = createTicket({
      subject: data.subject,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: "open",
      authorId: data.authorId || "admin_1",
      authorName: data.authorName || "Admin User",
      authorEmail: data.authorEmail || "admin@sightseeing.lu",
      authorRole: data.authorRole || "admin",
      assignedTo: data.assignedTo,
    })

    return NextResponse.json(ticket, { status: 201 })
  } catch (error) {
    console.error("Error creating ticket:", error)
    return NextResponse.json(
      { error: "Failed to create ticket" },
      { status: 500 }
    )
  }
}
