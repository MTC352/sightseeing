import { generateText } from "ai"
import { resolveAi } from "@/lib/ai/provider"
import { requirePermission } from "@/lib/auth-server"
import { logCaughtError, requestMeta } from "@/lib/error-log"

export const maxDuration = 45
export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

function extractJson(text: string): Record<string, unknown> | null {
  let t = text.trim()
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
  const start = t.indexOf("{")
  const end = t.lastIndexOf("}")
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("help")

    const body = (await request.json().catch(() => ({}))) as {
      goal?: string
      notes?: string
      audience?: string
      category?: string
    }
    const goal = (body.goal ?? "").trim()
    const notes = (body.notes ?? "").trim()

    if (!goal && !notes) {
      return Response.json(
        { error: "Describe the article's goal (and optionally paste notes) so the AI knows what to write." },
        { status: 400 },
      )
    }

    const ai = await resolveAi({ defaultTier: "fast" })
    if (!ai.model) {
      return Response.json(
        { error: "AI is not configured. Add an Anthropic or OpenAI API key in Admin → Integrations." },
        { status: 503 },
      )
    }

    const audience = body.audience === "admin" ? "admin" : "public"
    const audienceGuidance =
      audience === "admin"
        ? "This is INTERNAL documentation for back-office staff using the admin panel. Write clear, step-by-step operational instructions (where to click, what each field does)."
        : "This is a PUBLIC help/FAQ article for site visitors and customers. Use a friendly, reassuring tone and avoid internal jargon."

    const system = [
      "You are a documentation writer for sightseeing.lu, a Luxembourg tourism booking platform.",
      audienceGuidance,
      "Produce a single help article. Respond with ONLY a JSON object of the form:",
      `{"question": "<a concise title phrased as a question or topic>", "answer": "<the article body as clear plain text; use short paragraphs and, where helpful, numbered steps with '1.' '2.' on their own lines>"}`,
      "Do not include markdown code fences. Do not invent product features that were not described. Keep it accurate, concise and actionable.",
    ].join("\n")

    const prompt = [
      body.category ? `Category: ${body.category}` : "",
      goal ? `Goal of the article: ${goal}` : "",
      notes ? `Source notes / draft text to base it on:\n${notes}` : "",
      "Write the article now and return only the JSON object.",
    ]
      .filter(Boolean)
      .join("\n\n")

    const result = await generateText({
      model: ai.model,
      system,
      prompt,
      temperature: 0.6,
      maxOutputTokens: 1500,
    })

    const parsed = extractJson(result.text)
    const question = typeof parsed?.question === "string" ? parsed.question.trim() : ""
    const answer = typeof parsed?.answer === "string" ? parsed.answer.trim() : ""

    if (!question || !answer) {
      return Response.json(
        { error: "The AI returned an unexpected response. Please refine your prompt and try again." },
        { status: 502 },
      )
    }

    return Response.json({ question, answer })
  } catch (err) {
    if (isForbidden(err)) return Response.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    void logCaughtError("ai:help", err, { ...requestMeta(request), phase: "generate" })
    return Response.json({ error: "Failed to generate the article. Please try again." }, { status: 500 })
  }
}
