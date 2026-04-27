import { NextResponse } from "next/server"
import { dbListTickets, dbCreateTicket } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await dbListTickets())
  } catch (err) {
    console.error("[admin/tickets] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    if (!data.subject || !data.description || !data.category || !data.priority) {
      return NextResponse.json({ error: "Missing required fields: subject, description, category, priority" }, { status: 400 })
    }
    const ticket = await dbCreateTicket({
      subject: data.subject,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: "open",
      authorName: data.authorName ?? "Admin User",
      authorEmail: data.authorEmail ?? "admin@sightseeing.lu",
      authorRole: data.authorRole ?? "admin",
      assignedTo: data.assignedTo ?? null,
    })
    return NextResponse.json(ticket, { status: 201 })
  } catch (err) {
    console.error("[admin/tickets] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
