import { convertToModelMessages, streamText, UIMessage, validateUIMessages } from "ai"

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

    const systemPrompt = `You are a help assistant for sightseeing.lu. Answer questions based solely on the following FAQ articles. Do not discuss specific trip details or make up information. Be concise, warm, and helpful. No markdown formatting.

${FAQ_CONTENT}

If the user asks something not covered by the FAQ, acknowledge it honestly and suggest they email info@sightseeing.lu for personalised help.`

    const result = streamText({
      model: "openai/gpt-4o-mini",
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
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
