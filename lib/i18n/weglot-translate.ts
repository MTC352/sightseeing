import { dbGetWeglotApiKey } from "@/lib/db/queries"
import { SOURCE_LANG } from "./config"

const WEGLOT_URL = "https://api.weglot.com/translate"
const TIMEOUT_MS = 8000
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

// Calls Weglot's translate API for the given source texts. Never throws:
// on a missing key, network error, non-200, or shape mismatch it returns
// whatever it could map (possibly empty), so the route degrades to English.
export async function translateWithWeglot(
  lang: string,
  texts: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (texts.length === 0) return out
  const key = (await dbGetWeglotApiKey().catch(() => "")).trim()
  if (!/^wg_[a-zA-Z0-9]+$/.test(key)) return out
  try {
    const res = await fetch(`${WEGLOT_URL}?api_key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        l_from: SOURCE_LANG,
        l_to: lang,
        request_url: SITE_URL,
        words: texts.map((w) => ({ t: 1, w })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return out
    const data = (await res.json().catch(() => ({}))) as {
      from_words?: unknown
      to_words?: unknown
    }
    const from = Array.isArray(data.from_words) ? (data.from_words as string[]) : []
    const to = Array.isArray(data.to_words) ? (data.to_words as string[]) : []
    // Prefer aligning by returned from_words; fall back to input order.
    const src = from.length === to.length && from.length > 0 ? from : texts
    for (let i = 0; i < to.length && i < src.length; i++) {
      if (typeof to[i] === "string" && to[i]) out.set(src[i], to[i])
    }
    return out
  } catch {
    return out
  }
}
