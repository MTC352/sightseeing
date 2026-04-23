import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { messageId, vote, source, tripId, timestamp } = body as {
      messageId: string
      vote: "up" | "down"
      source: "planner" | "trip-chat" | "help-chat"
      tripId?: string
      timestamp?: string
    }

    // Log the feedback (in production this would go to a DB or analytics)
    console.log("[feedback]", JSON.stringify({ messageId, vote, source, tripId, timestamp: timestamp ?? new Date().toISOString() }))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[feedback] error:", err)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}
