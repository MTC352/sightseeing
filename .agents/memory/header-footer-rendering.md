---
name: Header/Footer custom HTML injection
description: How admin header_footer_blocks reach the public site, and the script-execution gotcha.
---

# Header/Footer block injection

Admin-configured custom HTML (`header_footer_blocks` table) is rendered on the public
site by `app/layout.tsx` (async server component) via `dbGetInjectionBlocks()` →
`<CustomHtmlBlock>` (client). Header blocks render above the navbar, footer below page
content, inside the gated non-admin region (suppressed on `/admin/*`).

**Why a client injector instead of dangerouslySetInnerHTML:** React's
`dangerouslySetInnerHTML` does NOT execute `<script>` tags. The admin blocks are meant
for analytics / tag managers / chat widgets, so `CustomHtmlBlock` sets `innerHTML` then
re-creates each `<script>` element so it actually runs.

**Merge semantics (must stay in lockstep):** `dbGetInjectionBlocks` mirrors
`dbGetSettings` — `header` = all enabled blocks whose placement != `body_end`
(head + body_start), `footer` = `body_end` blocks. Admin save (`dbUpdateHeaderFooter`)
consolidates ALL header-tab blocks into the single `announcement_banner` row and all
footer-tab blocks into `chat_widget`. So placement granularity is collapsed: `head`
blocks render in `<body>` above the navbar, not in `<head>`. This matches the admin UI
copy ("rendered before <Navbar/>"). If true `<head>` placement is ever needed, add a
separate server-rendered head path.
