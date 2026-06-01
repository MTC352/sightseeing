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

**Persistence caveat:** `/api/page-content` (`lib/page-content-store.ts`) is an
**in-memory Map** — edits do NOT survive a server restart, and `savedChanges` is only
fetched in edit mode, so saved edits are NOT shown to normal visitors. A DB-backed
alternative exists at `app/api/admin/page-content/route.ts` (`dbSavePageContent`) but
the editor still POSTs to the in-memory one. Durable, visitor-facing persistence is a
separate unfinished task — don't assume edits "go live" today.
