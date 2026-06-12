// Minimal allow-list sanitizer for admin-authored rich text that is rendered on
// public pages (currently the announcement banner). The Tiptap editor emits a
// small, known set of inline/formatting tags, so we keep only those, drop every
// other tag, strip all attributes except a validated `href` on links, and remove
// <script>/<style> blocks entirely. This prevents script execution even if a
// crafted payload reaches the write path directly.

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s",
  "span", "mark", "a", "ul", "ol", "li", "blockquote",
  "h2", "h3", "h4", "hr",
])

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

// Allow only http(s), mailto, tel, and relative/anchor links. Everything else
// (javascript:, data:, vbscript: …) is dropped.
function safeHref(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  if (/^(https?:|mailto:|tel:)/i.test(v)) return escapeAttr(v)
  if (/^[/#]/.test(v)) return escapeAttr(v)
  return ""
}

export function sanitizeRichText(input: string | null | undefined): string {
  if (!input) return ""
  let html = String(input)

  // Drop entire script/style blocks including their content.
  html = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
  // Drop HTML comments.
  html = html.replace(/<!--[\s\S]*?-->/g, "")

  // Process each remaining tag: drop disallowed tags, strip unsafe attributes.
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase()
    if (!ALLOWED_TAGS.has(name)) return ""

    const isClosing = match.startsWith("</")
    if (isClosing) return `</${name}>`

    const selfClose = name === "br" || name === "hr"

    if (name === "a") {
      const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
      const rawHref = hrefMatch ? (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? "") : ""
      const href = safeHref(rawHref)
      const hrefAttr = href ? ` href="${href}"` : ""
      return `<a${hrefAttr} target="_blank" rel="noopener noreferrer nofollow">`
    }

    return selfClose ? `<${name} />` : `<${name}>`
  })

  return html
}
