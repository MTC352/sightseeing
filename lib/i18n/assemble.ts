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
