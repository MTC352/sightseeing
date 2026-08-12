import { NextResponse } from "next/server"
import { isSupportedLang, MAX_BATCH } from "@/lib/i18n/config"
import { isTranslatableText, dedupe, chunk } from "@/lib/i18n/collect"
import { splitCacheMisses, assembleTranslations } from "@/lib/i18n/assemble"
import { getCachedTranslations, putTranslations } from "@/lib/i18n/cache"
import { translateWithWeglot } from "@/lib/i18n/weglot-translate"
import { sharedRateLimit, getClientIp } from "@/lib/shared-rate-limit"

export const runtime = "nodejs"

// Oversized strings are not real UI copy (they're usually accidental — e.g. a
// stringified blob) and would blow up Weglot's per-request payload; drop them
// rather than erroring so the client just leaves that one string in English.
const MAX_TEXT_LEN = 2000

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const { lang, texts } = (body ?? {}) as { lang?: string; texts?: unknown }
  if (!lang || !isSupportedLang(lang)) {
    return NextResponse.json({ error: "Unsupported lang" }, { status: 400 })
  }
  if (!Array.isArray(texts)) {
    return NextResponse.json({ error: "texts must be an array" }, { status: 400 })
  }

  const ip = getClientIp(request)
  const rl = await sharedRateLimit(`i18n:${ip}`, { limit: 120, windowMs: 60_000 })
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  // Only real strings, deduped and filtered; hard-cap the working set so one
  // request can never blow past the batch ceiling by too much.
  const wanted = dedupe(
    texts
      .filter((t): t is string => typeof t === "string")
      .filter(isTranslatableText)
      .filter((t) => t.length <= MAX_TEXT_LEN),
  ).slice(0, MAX_BATCH * 10)

  if (wanted.length === 0) return NextResponse.json({ translations: {} })

  const cached = await getCachedTranslations(lang, wanted)
  const misses = splitCacheMisses(wanted, cached)

  const fresh = new Map<string, string>()
  for (const batch of chunk(misses, MAX_BATCH)) {
    const translated = await translateWithWeglot(lang, batch)
    for (const [k, v] of translated) fresh.set(k, v)
  }

  // Persist only genuinely new translations (skip source-equal fallbacks).
  const toStore = [...fresh.entries()]
    .filter(([source, translated]) => translated && translated !== source)
    .map(([source, translated]) => ({ source, translated }))
  await putTranslations(lang, toStore).catch(() => {})

  return NextResponse.json({ translations: assembleTranslations(wanted, cached, fresh) })
}
