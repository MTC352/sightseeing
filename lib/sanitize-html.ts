// Minimal allow-list sanitizer for admin-authored rich text that is rendered on
// public pages (currently the announcement banner). The Tiptap editor emits a
// small, known set of inline/formatting tags, so we keep only those, drop every
// other tag, strip all attributes except a validated `href` on links and a
// validated `style` (colour / highlight / alignment only) on formatting tags,
// and remove <script>/<style> blocks entirely. This prevents script execution
// even if a crafted payload reaches the write path directly.

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s",
  "span", "mark", "a", "ul", "ol", "li", "blockquote",
  "h2", "h3", "h4", "hr",
])

// Inline CSS properties the editor is allowed to emit. Everything else is
// dropped. These are presentational only and cannot execute script.
const ALLOWED_STYLE_PROPS = new Set(["color", "background-color", "text-align"])

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

// Validate a single CSS colour value. Accepts hex, rgb()/rgba(), and bare
// keyword colours (red, white, inherit, transparent, currentcolor…). Anything
// containing url(), expressions, or markup characters is rejected.
function safeColorValue(raw: string): string | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (/url\(|expression|javascript:|@import|[<>;{}]/i.test(s)) return null
  if (/^#[0-9a-f]{3,8}$/.test(s)) return s
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(s)) return s
  if (/^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/.test(s)) return s
  if (/^[a-z]{3,20}$/.test(s)) return s
  return null
}

// Build a sanitized inline style string from a raw `style` attribute, keeping
// only the allow-listed presentational properties with validated values.
function safeStyle(raw: string): string {
  const out: string[] = []
  for (const decl of raw.split(";")) {
    const idx = decl.indexOf(":")
    if (idx === -1) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const val = decl.slice(idx + 1).trim()
    if (!ALLOWED_STYLE_PROPS.has(prop) || !val) continue
    if (prop === "text-align") {
      const a = val.toLowerCase()
      if (["left", "right", "center", "justify"].includes(a)) out.push(`text-align:${a}`)
      continue
    }
    const color = safeColorValue(val)
    if (color) out.push(`${prop}:${color}`)
  }
  return out.join(";")
}

// Public helper: validate a colour value coming from an admin colour picker
// (e.g. the banner background / text colour). Returns "" when invalid so the
// caller can fall back to a theme default.
export function sanitizeCssColor(input: string | null | undefined): string {
  if (!input) return ""
  return safeColorValue(String(input)) ?? ""
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

    // Validated, presentational-only inline style (colour / highlight / align).
    const styleMatch = attrs.match(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i)
    const rawStyle = styleMatch ? (styleMatch[2] ?? styleMatch[3] ?? "") : ""
    const cleanStyle = safeStyle(rawStyle)
    const styleAttr = cleanStyle ? ` style="${escapeAttr(cleanStyle)}"` : ""

    if (name === "a") {
      const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
      const rawHref = hrefMatch ? (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? "") : ""
      const href = safeHref(rawHref)
      const hrefAttr = href ? ` href="${href}"` : ""
      return `<a${hrefAttr}${styleAttr} target="_blank" rel="noopener noreferrer nofollow">`
    }

    return selfClose ? `<${name} />` : `<${name}${styleAttr}>`
  })

  return html
}
