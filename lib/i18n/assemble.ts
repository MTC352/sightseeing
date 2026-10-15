// Pure helpers for merging cached + freshly-translated strings into the
// response map. English fallback (source text) guarantees the client always
// receives a value for every requested string.
import { dedupe } from "./collect"

export function splitCacheMisses(texts: string[], cached: Map<string, string>): string[] {
  return dedupe(texts).filter((t) => !cached.has(t))
}

export function assembleTranslations(
  texts: string[],
  cached: Map<string, string>,
  fresh: Map<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of dedupe(texts)) {
    out[t] = cached.get(t) ?? fresh.get(t) ?? t
  }
  return out
}

/**
 * True when Weglot answered but translated nothing: every real sentence came
 * back identical to its source. `translated[i]` must align with `sources[i]`
 * (same length; otherwise we can't judge and return false). Only sentences of
 * 3+ words count, and at least 3 are required, so names/brands that are the
 * same in every language ("Luxembourg", "Instagram") never trigger it.
 * Whitespace is ignored because Weglot may echo text with spaces collapsed.
 */
export function looksUntranslated(sources: string[], translated: string[]): boolean {
  if (sources.length !== translated.length) return false
  const squash = (s: string) => s.replace(/\s+/g, "")
  const pairs = sources
    .map((s, i) => [s, translated[i] ?? ""] as const)
    .filter(([s]) => s.trim().split(/\s+/).length >= 3)
  if (pairs.length < 3) return false
  return pairs.every(([s, t]) => !t.trim() || squash(t) === squash(s))
}
