/**
 * lib/markdown.ts
 * Tiny, dependency-free Markdown → semantic HTML converter shared by the server
 * (public blog page render) and the client (blog edit form, when migrating a
 * legacy Markdown post into the Tiptap RichTextEditor and when applying
 * AI-generated content). It emits ONLY the small set of semantic tags the
 * RichTextEditor produces and `sanitizeRichText` allows (h2/h3/h4, p, ul/ol/li,
 * blockquote, hr, strong, em, a, code) — no inline styles. Output is always
 * re-sanitized with `sanitizeRichText` before it reaches a public page, so this
 * function does not need to be a security boundary itself.
 */

/** Heuristic: does this string already contain block/inline HTML markup?
 *  Used to decide whether stored content is HTML (from the editor) or legacy
 *  Markdown that needs conversion. */
export function looksLikeHtml(s: string | null | undefined): boolean {
  if (!s) return false
  return /<\/?(p|h[1-6]|ul|ol|li|a|strong|em|b|i|u|s|blockquote|br|hr|div|span|mark|table|img|pre|code)\b[^>]*>/i.test(s)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Inline-level Markdown (links, bold, italic, code) on a single, HTML-escaped line. */
function inline(s: string): string {
  let t = escapeHtml(s)
  // Links: [text](url). Stash each URL behind an opaque, markup-free token BEFORE
  // running the emphasis/code passes. Otherwise underscores or asterisks inside a
  // URL (e.g. /trip/tcms_5) get treated as emphasis markers — and with two links
  // on one line the markers even pair up across anchors, mangling the hrefs into
  // things like /trip/tcms<em>5. The link TEXT still flows through the passes
  // below, so emphasis inside link text keeps working. href is re-validated by
  // sanitizeRichText.
  const urls: string[] = []
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const token = `\u0000U${urls.length}\u0000`
    urls.push(url)
    return `<a href="${token}">${text}</a>`
  })
  // Bold: **text** or __text__
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  t = t.replace(/__(.+?)__/g, "<strong>$1</strong>")
  // Italic: *text* or _text_ (not touching the markers consumed by bold above)
  t = t.replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, "$1<em>$2</em>")
  t = t.replace(/(^|[^_])_(?!\s)([^_]+?)_/g, "$1<em>$2</em>")
  // Inline code: `code`
  t = t.replace(/`([^`]+?)`/g, "<code>$1</code>")
  // Restore the stashed URLs now that emphasis/code can no longer touch them.
  t = t.replace(/\u0000U(\d+)\u0000/g, (_m, i: string) => urls[Number(i)] ?? "")
  return t
}

/**
 * Convert a Markdown string to semantic HTML. Block-level: ATX headings
 * (mapped to h2/h3/h4), unordered/ordered lists, blockquotes, horizontal
 * rules, and paragraphs. Returns "" for empty input.
 */
export function markdownToHtml(md: string | null | undefined): string {
  if (!md) return ""
  const lines = String(md).replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []
  let inUl = false
  let inOl = false

  const closeLists = () => {
    if (inUl) { out.push("</ul>"); inUl = false }
    if (inOl) { out.push("</ol>"); inOl = false }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { closeLists(); continue }

    let m: RegExpMatchArray | null
    if ((m = line.match(/^#{4,}\s+(.*)$/))) { closeLists(); out.push(`<h4>${inline(m[1])}</h4>`); continue }
    if ((m = line.match(/^###\s+(.*)$/)))   { closeLists(); out.push(`<h3>${inline(m[1])}</h3>`); continue }
    if ((m = line.match(/^##\s+(.*)$/)))    { closeLists(); out.push(`<h2>${inline(m[1])}</h2>`); continue }
    if ((m = line.match(/^#\s+(.*)$/)))     { closeLists(); out.push(`<h2>${inline(m[1])}</h2>`); continue }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { closeLists(); out.push("<hr>"); continue }
    if ((m = line.match(/^>\s?(.*)$/)))     { closeLists(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue }

    if ((m = line.match(/^[-*+]\s+(.*)$/))) {
      if (inOl) { out.push("</ol>"); inOl = false }
      if (!inUl) { out.push("<ul>"); inUl = true }
      out.push(`<li>${inline(m[1])}</li>`)
      continue
    }
    if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      if (inUl) { out.push("</ul>"); inUl = false }
      if (!inOl) { out.push("<ol>"); inOl = true }
      out.push(`<li>${inline(m[1])}</li>`)
      continue
    }

    closeLists()
    out.push(`<p>${inline(line)}</p>`)
  }

  closeLists()
  return out.join("\n")
}
