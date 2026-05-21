import { convertToModelMessages, streamText, UIMessage, validateUIMessages } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { dbGetSettings } from "@/lib/db/queries"

export const maxDuration = 30

const FAQ_CONTENT = `
BOOKING:
Q: How do I book a trip? A: Select your trip on sightseeing.lu, click "Add to Trip" or "Book Now", and follow the checkout steps. You will receive a confirmation email once payment is complete.
Q: Can I book for a group? A: Yes! During checkout you can specify the number of participants. For large groups (10+) please contact us directly at info@sightseeing.lu for a tailored quote.
Q: Do I need to create an account to book? A: No account is required. However, creating one makes it easier to manage bookings and access receipts.
Q: Can I modify my booking after confirming? A: Most bookings can be modified up to 24 hours before the experience. Contact us at info@sightseeing.lu with your booking reference.

PAYMENTS:
Q: What payment methods do you accept? A: We accept all major credit and debit cards (Visa, Mastercard, Amex) as well as PayPal. Payment is processed securely via our partner Palisis.
Q: Is my payment secure? A: Yes. All transactions are processed via PCI-compliant systems. We never store your card details directly.
Q: When is my card charged? A: Your card is charged immediately upon booking confirmation.
Q: Can I pay in instalments? A: Currently we do not offer instalment payment plans. Full payment is required at booking.

CANCELLATION:
Q: What is your cancellation policy? A: Most experiences offer a full refund if cancelled 24 hours or more before the start time. Cancellations within 24 hours are generally non-refundable. Each listing shows its specific policy.
Q: How do I cancel my booking? A: Email info@sightseeing.lu with your booking reference number and reason for cancellation. We aim to respond within 2 business hours.
Q: How long does a refund take? A: Refunds are processed within 5-10 business days depending on your bank or card provider.
Q: What happens if the operator cancels? A: If sightseeing.lu or the operator cancels your experience, you will receive a full refund within 3 business days, or the option to rebook at no extra charge.

ACCESSIBILITY:
Q: Are experiences wheelchair accessible? A: Accessibility varies by experience. Each listing includes accessibility notes. If you have specific needs, please contact us and we will advise on the best options.
Q: Are experiences suitable for young children? A: Many experiences are family-friendly and suitable for children. Look for the "family" tag or contact us for age recommendations.
Q: Are there experiences for people with visual or hearing impairments? A: Some guided tours offer audio description or sign-language interpretation. Please contact us in advance to arrange accommodations.
Q: Is assistance available throughout experiences? A: Our guides are trained to assist all guests. Please inform us of any requirements at the time of booking.

GENERAL:
Q: Where is sightseeing.lu based? A: We are based in Luxembourg City, Luxembourg. Our experiences cover the entire Grand Duchy and some cross-border destinations.
Q: How do I contact customer support? A: Email info@sightseeing.lu or use the chat on this page. We respond within a few hours during business hours (Mon-Sat, 9:00-18:00 CET).
Q: Can I leave a review after my experience? A: Yes! We send a follow-up email after your experience with a link to leave a Google review. Your feedback helps future visitors.
Q: Do you offer gift vouchers? A: Yes! Gift vouchers are available for any amount. Contact info@sightseeing.lu to purchase one.
`

export async function POST(req: Request) {
  try {
    const body = await req.json()

    let messages: UIMessage[]
    try {
      messages = await validateUIMessages<UIMessage>({ messages: body.messages, tools: {} })
    } catch {
      messages = body.messages ?? []
    }

    const DEFAULT_HELP_PROMPT = `You are a help assistant for sightseeing.lu. Answer questions based solely on the following FAQ articles. Do not discuss specific trip details or make up information. Be concise, warm, and helpful. No markdown formatting.

${FAQ_CONTENT}

If the user asks something not covered by the FAQ, acknowledge it honestly and suggest they email info@sightseeing.lu for personalised help.`

    // ── Model resolution ──────────────────────────────────────────────────
    // Mirror the planner/itinerary/blog routes: prefer the AI Gateway when
    // its env key is set, otherwise fall back to Anthropic via @ai-sdk/anthropic
    // using the DB-stored key. The previous code passed "openai/gpt-4o-mini"
    // straight to streamText, which silently produced an empty stream when
    // neither AI_GATEWAY_API_KEY nor OPENAI_API_KEY was available — so the
    // help widget appeared to "not respond" while actually receiving an
    // empty stream and never displaying any tokens.
    const settings = await dbGetSettings()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const helpCfg = (settings.ai as Record<string, Record<string, unknown>>)?.help ?? {}
    // Honor the admin-configured system prompt from /admin/ai-systems/help
    // when one is saved; otherwise fall back to the hardcoded FAQ prompt.
    const adminPrompt = (helpCfg.systemPrompt as string)?.trim()
    const systemPrompt = adminPrompt && adminPrompt.length > 0 ? adminPrompt : DEFAULT_HELP_PROMPT
    const adminModel = (helpCfg.model as string) || ""
    // Clamp runtime controls to safe ranges in case the DB holds garbage.
    const rawTemp = typeof helpCfg.temperature === "number" ? helpCfg.temperature : 0.3
    const temperature = Math.min(1, Math.max(0, rawTemp))
    const rawMax = typeof helpCfg.maxTokens === "number" ? helpCfg.maxTokens : 1024
    const maxOutputTokens = Math.min(4096, Math.max(128, Math.floor(rawMax)))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiKeys = (settings as any)?.apiKeys as Record<string, string> | undefined
    const anthropicKey = apiKeys?.anthropic || process.env.ANTHROPIC_API_KEY
    const gatewayKey = process.env.AI_GATEWAY_API_KEY

    if (!gatewayKey && !anthropicKey) {
      const msg = "Help chat AI is not configured. Please email info@sightseeing.lu and we'll respond personally."
      console.error("[help-chat] No AI credentials available")
      const sse =
        `data: ${JSON.stringify({ type: "start" })}\n\n` +
        `data: ${JSON.stringify({ type: "error", errorText: msg })}\n\n` +
        `data: [DONE]\n\n`
      return new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
      })
    }

    let model: Parameters<typeof streamText>[0]["model"]
    if (gatewayKey) {
      model = adminModel || "anthropic/claude-haiku-4-5-20251001"
    } else {
      const anthropic = createAnthropic({ apiKey: anthropicKey! })
      const modelId = adminModel.startsWith("anthropic/")
        ? adminModel.slice("anthropic/".length)
        : adminModel.startsWith("claude")
          ? adminModel
          : "claude-haiku-4-5-20251001"
      model = anthropic(modelId)
    }

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      temperature,
      maxOutputTokens,
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("[help-chat] POST error:", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
