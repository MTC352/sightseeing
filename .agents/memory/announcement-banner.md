---
name: Announcement banner (structured)
description: Where the public announcement banner lives now and the dual-exclusion rule that prevents the retired legacy banner from re-rendering.
---

# Structured announcement banner

The public announcement banner is a structured feature stored in the
`integrations` table row `key='announcement'`: `value` = sanitized rich-text HTML
(the message), `meta` = `{ enabled, size }`. Admin edits it at
`/admin/header-footer` (header tab) via a Tiptap rich-text editor + size picker +
live preview; it renders in one fixed design (accent `bg-primary` + forced white
text) above the navbar in `app/layout.tsx`.

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
formatting tags, strips all attrs except a protocol-validated `href` on `<a>`,
forces `target=_blank rel=noopener`, drops `<script>/<style>`). Applied on BOTH
write and read of the announcement content because the output is rendered with
`dangerouslySetInnerHTML` on public pages.
