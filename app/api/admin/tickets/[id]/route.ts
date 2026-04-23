import { NextRequest, NextResponse } from "next/server"
import { getTicket, updateTicket, deleteTicket } from "@/lib/admin-store"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ticket = getTicket(id)
  
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }
  
  return NextResponse.json(ticket)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const data = await request.json()
    const updated = updateTicket(id, data)
    
    if (!updated) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }
    
    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating ticket:", error)
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deleted = deleteTicket(id)
  
  if (!deleted) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }
  
  return NextResponse.json({ success: true })
}
