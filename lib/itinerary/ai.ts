/* ─────────────────────────────────────────────────────────────────────────
   Optional AI layer for the itinerary builder.

   In the hybrid engine the AI is advisory ONLY:
     • selectAndOrder() — picks WHICH candidate trips to include and in what
       priority order (interests, time-of-day, exclusions). The deterministic
       scheduler then locks the actual timing.
     • narrate()        — writes the human summary + practical tips over an
       ALREADY-decided timeline.

   Both helpers are fail-soft: any error (invalid key, network, bad JSON,
   timeout) resolves to `null` so the caller falls back to the deterministic
   path. They NEVER throw.
   ───────────────────────────────────────────────────────────────────────── */
import { generateText, Output } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { z } from "zod"

function resolveModelId(raw: string | null | undefined): string {
  const fallback = "claude-haiku-4-5-20251001"
  if (!raw || typeof raw !== "string") return fallback
  if (raw.startsWith("anthropic/")) return raw.slice("anthropic/".length)
  if (raw.startsWith("claude")) return raw
  return fallback
}

export interface CompactCandidate {
  id: string
  title: string
  city: string
  category: string
  durationMin: number
  tags: string[]
  blurb: string
  slotTimes: string[]
}

const selectionSchema = z.object({
  orderedTripIds: z.array(z.string()),
  reasoning: z.string().nullable(),
})

/** Ask the AI to pick + order trips. Returns ordered ids (a subset/permutation
 *  of the candidate ids) or null on any failure. Stepwise: large candidate
 *  sets are scored in batches so we never blow the token budget. */
export async function selectAndOrder(opts: {
  anthropicKey: string
  model: string | null
  candidates: CompactCandidate[]
  prefs: {
    group: string
    interests: string[]
    duration: string
    budget: string
    dayCount: number
    exclusions: string[]
  }
  visitDate: string
  maxStops: number
  timeoutMs?: number
}): Promise<string[] | null> {
  const { anthropicKey, model, candidates, prefs, visitDate, maxStops } = opts
  if (!anthropicKey || candidates.length === 0) return null

  try {
    const anthropic = createAnthropic({ apiKey: anthropicKey })
    const modelId = resolveModelId(model)

    // Stepwise scoring: process at most 12 candidates per batch, keep the
    // running shortlist, then do a final ordering pass over survivors.
    const BATCH = 12
    let shortlist = candidates
    if (candidates.length > BATCH) {
      const survivors: CompactCandidate[] = []
      for (let i = 0; i < candidates.length; i += BATCH) {
        const batch = candidates.slice(i, i + BATCH)
        const ids = await scoreBatch(anthropic, modelId, batch, prefs, visitDate, Math.min(maxStops + 2, batch.length))
        if (ids === null) return null
        survivors.push(...batch.filter((c) => ids.includes(c.id)))
      }
      shortlist = survivors.length > 0 ? survivors : candidates
    }

    const finalIds = await scoreBatch(anthropic, modelId, shortlist, prefs, visitDate, maxStops)
    if (finalIds === null) return null
    // Keep only known ids, preserve AI order, dedupe.
    const known = new Set(candidates.map((c) => c.id))
    const seen = new Set<string>()
    const ordered = finalIds.filter((id) => known.has(id) && !seen.has(id) && (seen.add(id), true))
    return ordered.length > 0 ? ordered : null
  } catch {
    return null
  }
}

async function scoreBatch(
  anthropic: ReturnType<typeof createAnthropic>,
  modelId: string,
  batch: CompactCandidate[],
  prefs: {
    group: string
    interests: string[]
    duration: string
    budget: string
    dayCount: number
    exclusions: string[]
  },
  visitDate: string,
  limit: number,
): Promise<string[] | null> {
  try {
    const cards = batch
      .map(
        (c) =>
          `- id:${c.id} | "${c.title}" | ${c.city || "Luxembourg"} | ${c.category || "n/a"} | ~${c.durationMin}min | tags: ${c.tags.slice(0, 6).join(", ") || "—"} | ${c.blurb.slice(0, 120)} | slots: ${c.slotTimes.slice(0, 6).join(", ") || "none"}`,
      )
      .join("\n")
    const profile = [
      prefs.group && `group: ${prefs.group}`,
      prefs.interests.length && `interests: ${prefs.interests.join(", ")}`,
      prefs.duration && `trip length: ${prefs.duration}${prefs.dayCount > 1 ? ` (${prefs.dayCount} days)` : ""}`,
      prefs.budget && `budget: ${prefs.budget}`,
      prefs.exclusions.length && `must avoid: ${prefs.exclusions.join(", ")}`,
    ]
      .filter(Boolean)
      .join(" · ")

    const prompt = `You are curating a day of sightseeing in Luxembourg for ${visitDate}.
Visitor profile: ${profile || "no stated preferences"}.

Pick and ORDER the best trips for this visitor from the list below. Choose at most ${limit}. Order them as a sensible day arc (morning → daytime → evening), honour interests, and respect anything in "must avoid" (e.g. no early-morning starts). Do NOT invent ids — only use ids from the list. Return ONLY the chosen ids in priority order.

CANDIDATES:
${cards}`

    const { output } = await generateText({
      model: anthropic(modelId),
      output: Output.object({ schema: selectionSchema }),
      maxOutputTokens: 400,
      prompt,
    })
    return Array.isArray(output.orderedTripIds) ? output.orderedTripIds.map(String) : null
  } catch {
    return null
  }
}

const narrationSchema = z.object({
  summary: z.string(),
  tips: z.array(z.string()),
  carSuggestion: z.object({ recommended: z.boolean(), reason: z.string() }),
  hotelSuggestion: z.object({ recommended: z.boolean(), area: z.string(), reason: z.string() }),
})

export type Narration = z.infer<typeof narrationSchema>

/** Write a summary + tips over an already-decided timeline. Returns null on
 *  any failure so the caller can fall back to a deterministic summary. */
export async function narrate(opts: {
  anthropicKey: string
  model: string | null
  temperature?: number | null
  maxOutputTokens?: number | null
  timelineText: string
  tipsInstructions: string
  styleGuidance?: string
}): Promise<Narration | null> {
  const { anthropicKey, model, temperature, maxOutputTokens, timelineText, tipsInstructions, styleGuidance } = opts
  if (!anthropicKey) return null
  try {
    const anthropic = createAnthropic({ apiKey: anthropicKey })
    const modelId = resolveModelId(model)
    const prompt = `${styleGuidance ? styleGuidance + "\n\n" : ""}A Luxembourg day itinerary has ALREADY been planned and locked to real timeslots (do not change times or trips). Write a warm, concise "summary" (2-3 sentences) describing the day's flow, then populate "tips".

THE LOCKED ITINERARY:
${timelineText}

TIPS — follow these instructions:
${tipsInstructions}

For carSuggestion / hotelSuggestion just set recommended:false with short empty-ish reasons unless the day clearly spans rural areas (car) or ends very late (hotel). Return STRICTLY the JSON schema.`

    const { output } = await generateText({
      model: anthropic(modelId),
      output: Output.object({ schema: narrationSchema }),
      temperature: temperature ?? undefined,
      maxOutputTokens: maxOutputTokens ?? 700,
      prompt,
    })
    return output
  } catch {
    return null
  }
}
