---
name: Frontend Edit Mode editor
description: How the in-page admin "Edit Mode" text/image editor is structured (explicit wrappers + generic auto-layer)
---

# Frontend Edit Mode editor

Activated by `?admin_edit=1` + server admin-session check (`/api/admin/auth/me`) in
`EditModeProvider` (wraps `app/layout.tsx`). Two coexisting editing mechanisms:

1. **Explicit wrappers** — `EditableText` / `EditableImage`, keyed by a hand-written
   stable id (e.g. `home:hero:headline`). Used where authors want pinned, durable keys.
   Both carry `data-editable="true"` in edit mode (display AND editing states).
2. **Generic auto-layer** — `AutoEditableLayer`, mounted only in edit mode. Scans the
   live DOM for text-leaf elements + images, tags them with `auto:<pathname>:<dom-path>`
   (or `auto:<pathname>:k/<data-edit-key>` if author pins one), outlines amber, and
   intercepts clicks (capture phase) to edit. This is what makes editing work on pages
   with NO explicit wrappers — do NOT manually wrap every page.

**Why both:** explicit wrappers give durable keys for important copy; the auto-layer
gives zero-effort coverage everywhere else.

**Critical invariant:** the auto-layer must NEVER tag elements inside explicit wrappers
or chrome. It excludes (via `closest`) `[data-editable]`, `[data-no-edit]`,
`[data-auto-editor-ui]`, and `nav/header/footer/[role=banner]`. If you add a new
explicit-editor UI, give its root `data-editable`; for global chrome (cookie banner,
a11y toolbar) use `data-no-edit`. Missing this re-introduces the bug where clicking
Apply/Cancel inside an explicit editor opens the generic popover instead.

**Persistence (DB-backed, visitor-facing):** all inline edits live in the
`page_content` table under ONE bucket slug `INLINE_CONTENT_SLUG="__inline__"`
(`lib/page-content-slug.ts`) — the keys are globally unique so they self-namespace.
- **Read:** `GET /api/page-content` is PUBLIC + read-only (`dbGetPageContent(__inline__)`,
  fail-soft `{}`). Its POST returns 405 (the old unauthenticated in-memory write hole).
- **Write:** `saveAll()` batches ONE `POST /api/admin/page-content` `{slug,changes}`
  (admin-session-gated, `dbSavePageContent`). Validates `changes` is a plain object of
  string values.
- **Apply for visitors:** `EditModeProvider` fetches saved content on mount for EVERY
  visitor (not just edit mode), so explicit `EditableText/EditableImage` show saved
  values via context. Generic `auto:*` keys have no React component, so
  `SavedContentApplier` (mounted always, no-ops in edit mode) writes them to the DOM via
  path resolution / `[data-edit-key]`, debounced MutationObserver, equality-guarded.
- `lib/page-content-store.ts` (in-memory Map) was DELETED. Edits now persist across
  restarts and go live for all visitors.
