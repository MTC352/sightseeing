/**
 * Only allow hrefs that can't execute script: site paths, in-page anchors,
 * http(s), mailto: and tel:. Anything else (javascript:, data:, protocol-
 * relative //host, …) falls back to `fallback`. Used for admin-editable links.
 */
export function safeHref(raw: string | undefined | null, fallback: string): string {
  const v = (raw ?? "").trim()
  if (!v) return fallback
  if (v.startsWith("#")) return v
  if (v.startsWith("/") && !v.startsWith("//")) return v
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v
  return fallback
}
