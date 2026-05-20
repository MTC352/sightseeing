/**
 * Safe JSON-LD serializer for inline <script type="application/ld+json">.
 *
 * Escapes characters that could break out of the script tag or corrupt the
 * JSON payload. Any DB / external string that flows into structured data MUST
 * be serialized through this helper — a literal "</script>" or U+2028 in a
 * title/description would otherwise enable HTML injection or invalid JSON.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}
