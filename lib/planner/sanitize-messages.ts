/**
 * Strip incomplete / duplicated tool invocations out of the replayed planner
 * message history. Pure + dependency-free so it is unit-testable offline.
 *
 * A tool call that was interrupted mid-stream — by the `stopSequences`
 * kill-switch, the `stepCountIs` limit, or a transport error — gets persisted
 * on the client as a tool part WITHOUT a completed input/output. When
 * convertToModelMessages turns that into an Anthropic `tool_use` block it has
 * no `input`, and Anthropic rejects the ENTIRE next request with a 400
 * ("messages.N.content.0.tool_use.input: Field required"). That is what made
 * the planner chat die on the turn after any tool-using reply, regardless of
 * whether the API key was valid.
 *
 * We keep only fully-resolved tool parts (state "output-available" /
 * "output-error") so every tool_use has both its input and a matching
 * tool_result, and drop any message left with no parts.
 *
 * SECOND failure mode (OpenAI Responses API): that provider rejects the WHOLE
 * request with a 400 — "Duplicate item found with id fc_…. Remove duplicate
 * items from your input and try again." — if the SAME tool-call item id is
 * replayed more than once. Client-side message persistence can echo the same
 * resolved tool part across turns (and the planner injects synthetic tool
 * cards), so the second turn after any tool-using reply died with that 400 —
 * surfacing as "I couldn't reach the AI assistant". We therefore also dedupe
 * tool parts by `toolCallId`, keeping the first occurrence only. Each AI SDK v5
 * tool part is self-contained (input + output in one part), so dropping a whole
 * duplicate part removes both its tool_use and tool_result together — no
 * dangling reference.
 */

type ToolPartLike = {
  type?: string
  state?: string
  input?: unknown
  toolCallId?: string
}

type MessageLike = { parts?: unknown[] }

export function sanitizePlannerMessages<T extends MessageLike>(messages: T[]): T[] {
  const cleaned: T[] = []
  const seenToolCallIds = new Set<string>()
  for (const m of messages) {
    const parts = ((m.parts ?? []) as unknown[]).filter((p) => {
      const t = (p as { type?: string }).type ?? ""
      if (!t.startsWith("tool-") && t !== "dynamic-tool") return true
      const part = p as ToolPartLike
      const resolved = part.state === "output-available" || part.state === "output-error"
      // A tool_use replayed to Anthropic MUST carry its input object. Parts with
      // undefined input slip through a state-only check — this happens both for
      // interrupted streams AND for client-injected synthetic cards (e.g. the
      // "manual-…" buildItinerary the planner page adds when it builds the
      // itinerary deterministically). Either way, an empty input triggers the
      // 400 "tool_use.input: Field required", so we require a real input here.
      const hasInput = part.input !== undefined && part.input !== null
      if (!resolved || !hasInput) return false
      const id = part.toolCallId
      if (id) {
        if (seenToolCallIds.has(id)) return false
        seenToolCallIds.add(id)
      }
      return true
    })
    if (parts.length > 0) {
      cleaned.push({ ...m, parts } as T)
    }
  }
  return cleaned
}
