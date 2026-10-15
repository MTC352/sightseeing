import { dbGetWeglotApiKey } from "@/lib/db/queries"
import { logError } from "@/lib/error-log"
import { SOURCE_LANG } from "./config"
import { looksUntranslated } from "./assemble"

const WEGLOT_URL = "https://api.weglot.com/translate"
const TIMEOUT_MS = 8000
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

// ── Failure logging ─────────────────────────────────────────────────────────
// Every failure below degrades silently to English, so pages just "don't
// translate" with no visible cause. Report each kind to Admin → Error Logs
// (source "i18n"), throttled per reason + language so a dead key or an
// exhausted quota can't write a row on every page view. Never log the API key
// (it is in the request URL, so the URL is never logged either).
const LOG_THROTTLE_MS = 10 * 60_000
const _lastLogged = new Map<string, number>()

function report(
  reason: "no-key" | "http" | "exception" | "untranslated",
  lang: string,
  level: "error" | "warn",
  message: string,
  context: Record<string, unknown> = {},
): void {
  const key = `${reason}:${lang}`
  const now = Date.now()
  if (now - (_lastLogged.get(key) ?? 0) < LOG_THROTTLE_MS) return
  _lastLogged.set(key, now)
  void logError({ source: "i18n", level, message, context: { reason, lang, ...context } })
}

const sample = (texts: string[]) => texts.slice(0, 2).map((t) => t.slice(0, 80))

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
  if (!/^wg_[a-zA-Z0-9]+$/.test(key)) {
    report("no-key", lang, "error",
      `Weglot API key ${key ? "has an invalid format" : "is missing"} — new text stays in English. Set it in Admin → Integrations.`)
    return out
  }
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
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300)
      report("http", lang, "error",
        `Weglot translate failed: HTTP ${res.status} — new text stays in English.`,
        { status: res.status, body, strings: texts.length })
      return out
    }
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
    // HTTP 200 but nothing actually translated — typically the Weglot plan's
    // word quota is used up, or machine translation is off for this language.
    if (to.length === texts.length && looksUntranslated(texts, to)) {
      report("untranslated", lang, "warn",
        `Weglot returned ${texts.length} strings untranslated (HTTP 200). Likely the Weglot word quota is reached or automatic translation is off — check the Weglot dashboard.`,
        { strings: texts.length, sample: sample(texts) })
    }
    return out
  } catch (err) {
    report("exception", lang, "error",
      `Weglot translate request failed: ${err instanceof Error ? err.message : String(err)} — new text stays in English.`,
      { strings: texts.length })
    return out
  }
}
