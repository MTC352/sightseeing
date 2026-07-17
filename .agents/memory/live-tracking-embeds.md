---
name: Live tracking map embeds
description: How the /live-tracking GG-widget embeds are stored, admin-edited, and script-executed
---

# Live tracking map embeds

- The two tour map boxes on /live-tracking render admin-editable raw HTML embeds
  (script + `.gg-map-widget` div) stored in `pages.content` jsonb for slug
  `live-tracking` (`busEmbed`/`trainEmbed`); edited at /admin/pages/live-tracking
  (uses existing pages-permission APIs, no new admin route rules needed).
- Empty field = built-in `DEFAULT_EMBED` fallback, so the page never breaks.
- **Script execution rule:** innerHTML never runs `<script>` — embeds are injected
  with script re-creation, and EXTERNAL scripts are deduped by src across cards
  (tagged `data-embed-src`) so a shared widget loader executes ONCE after all
  widget divs exist. Loaders re-run on every mount (stale copies removed) for
  client-side navigation.
- **Why:** the GG loader scans the DOM for `.gg-map-widget` at execution time;
  running it per-card or before divs render yields blank/double-initialized maps.
- The `pages` row ships to prod via data migration 014 (idempotent INSERT).
