// Pure, isomorphic helpers for gathering and batching translatable strings.
// No DOM or Next imports here so this compiles for both the browser engine and
// the Node test runner.

// A string is worth translating only if it contains at least one letter.
// This skips whitespace, pure numbers, prices ("€11"), ranges ("45 - 60"),
// and punctuation/symbol-only nodes.
const HAS_LETTER = /\p{L}/u

export function isTranslatableText(s: string): boolean {
  const t = s.trim()
  if (t.length === 0) return false
  return HAS_LETTER.test(t)
}

export function dedupe(xs: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of xs) {
    if (!seen.has(x)) {
      seen.add(x)
      out.push(x)
    }
  }
  return out
}

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}
