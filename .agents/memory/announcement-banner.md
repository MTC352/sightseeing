---
name: Announcement banner (structured)
description: Where the public announcement banner lives now and the dual-exclusion rule that prevents the retired legacy banner from re-rendering.
---

# Structured announcement banner

The public announcement banner is a structured feature stored in the
`integrations` table row `key='announcement'`: `value` = sanitized rich-text HTML
(the message), `meta` = `{ enabled, size, align, bgColor, textColor }`. Admin
edits it at `/admin/header-footer` (header tab) via a Tiptap rich-text editor +
size/alignment pickers + banner-colour & text-colour pickers (`ColorControl`,
empty string = theme default) + live preview. It renders above the navbar in
`app/layout.tsx`.

**WYSIWYG is structural:** admin preview AND public banner BOTH render through the
single `AnnouncementBannerContent` component (shared props content/size/align/
bgColor/textColor) — never fork the renderer or parity breaks.

**Tailwind preflight gotcha:** the banner renders editor HTML with
`dangerouslySetInnerHTML`, and Tailwind's CSS reset strips default styling from
`<strong>/<em>/<h2-4>/<ul>/<ol>/<blockquote>`, so formatting shows as PLAIN TEXT
unless explicit arbitrary-variant classes restore it (see `RICH_TEXT_CLASSES`).
Do NOT force `[&_*]:!text-white` — it overrides editor inline colours; instead set
a base colour on the container and let inline `style="color:…"` win.

## Rule: legacy `announcement_banner` must be excluded from BOTH injection paths
The old banner was raw HTML in `header_footer_blocks` row `name='announcement_banner'`
(placement `body_start`). It is retired, but the row may still exist in any DB.
To guarantee it never reaches the frontend, it must be filtered out in **two**
separate merge paths in `lib/db/queries.ts`:
1. `dbGetInjectionBlocks()` — drives the public `<CustomHtmlBlock>` injection.
2. `dbGetSettings()` header merge (`headerBlocks` filter) — drives the admin
   header-footer code editor state.

**Why:** if only path #1 is filtered, the admin still loads the legacy HTML into
the header code editor, and on Save the header raw-code section writes the merged
payload into the `head_scripts` row — which path #1 *does* render — so the old
banner silently comes back. The header raw-code save target was moved from
`announcement_banner` to `head_scripts` (`dbUpdateHeaderFooter('header', …)`), so
the two systems are fully separate.

**How to apply:** any future change touching header/footer injection or the
banner must keep both `name !== 'announcement_banner'` filters in sync.

## Sanitizer
`lib/sanitize-html.ts` `sanitizeRichText()` is a strict allowlist (small set of
formatting tags, forces `target=_blank rel=noopener` on `<a>`, drops
`<script>/<style>`). Attrs stripped EXCEPT: protocol-validated `href` on `<a>`,
and a validated inline `style` subset on formatting tags — only `color`,
`background-color`, `text-align`, with values restricted to hex/rgb()/rgba()/
keyword colours and the four align keywords (no `url()`/expression/markup chars).
This is what lets the editor's text colour + `<mark>` highlight survive to render.
Also exports `sanitizeCssColor()` (validates the admin colour-picker meta values).
Applied on BOTH write and read of the content (rendered via
`dangerouslySetInnerHTML` on public pages).
