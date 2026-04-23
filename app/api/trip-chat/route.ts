import { convertToModelMessages, streamText, UIMessage, validateUIMessages } from "ai"
import { getTripById, getTripDetail } from "@/lib/data"

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { tripId } = body as { tripId: string }

    let messages: UIMessage[]
    try {
      messages = await validateUIMessages<UIMessage>({ messages: body.messages, tools: {} })
    } catch {
      messages = body.messages ?? []
    }

    const trip = getTripById(tripId)
    const detail = getTripDetail(tripId)

    if (!trip) {
      return new Response(JSON.stringify({ error: "Trip not found" }), { status: 404 })
    }

    const tripContext = [
      `Title: ${trip.title}`,
      `Category: ${trip.category}`,
      `City: ${trip.city ?? "Luxembourg"}`,
      `Duration: ${trip.duration}`,
      `Price: ${trip.price > 0 ? trip.price + " EUR" : "Free"}`,
      `Rating: ${trip.rating}/5 (${trip.reviewCount} reviews)`,
      detail?.description ? `Description: ${detail.description}` : "",
      detail?.highlights?.length ? `Highlights: ${detail.highlights.join(", ")}` : "",
      detail?.includes?.length ? `Includes: ${detail.includes.join(", ")}` : "",
      detail?.notIncluded?.length ? `Not included: ${detail.notIncluded.join(", ")}` : "",
      detail?.itinerary?.length ? `Itinerary: ${detail.itinerary.map(s => `${s.title} (${s.duration})`).join(" > ")}` : "",
      detail?.goodToKnow?.length ? `FAQ: ${detail.goodToKnow.map(q => `Q: ${q.question} A: ${q.answer}`).join(" | ")}` : "",
      detail?.maxGroupSize ? `Max group size: ${detail.maxGroupSize}` : "",
      detail?.languages?.length ? `Languages: ${detail.languages.join(", ")}` : "",
      detail?.cancellationPolicy?.length ? `Cancellation: ${detail.cancellationPolicy.join(". ")}` : "",
      trip.tags?.length ? `Tags: ${trip.tags.join(", ")}` : "",
    ].filter(Boolean).join("\n")

    const systemPrompt = `You are a helpful concierge for sightseeing.lu, answering questions specifically about this trip:

${tripContext}

RULES:
1. Only answer questions related to this trip or closely related topics (nearby attractions, getting there, weather suitability).
2. Be concise -- 2-3 sentences max per answer.
3. No markdown formatting.
4. If asked about something unrelated, gently redirect to the trip.
5. Be warm, enthusiastic, and helpful. Encourage booking.
6. Luxembourg has free public transport nationwide -- mention this when relevant.
7. If you do not know the specific answer, say so honestly but suggest contacting the provider.`

    const result = streamText({
      model: "openai/gpt-4o-mini",
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("[trip-chat] POST error:", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
