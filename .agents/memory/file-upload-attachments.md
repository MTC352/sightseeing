---
name: File-upload rules & Help attachments
description: How help-article document attachments, upload RBAC, body-size limits, and stored-XSS sanitization fit together.
---

# Configurable file-upload validation + Help attachments

## Effective-rules resolution
- Order: per-user (`admin_users.file_rules`) ?? global (`integrations` key `file_upload_rules`) ?? `DEFAULT_RULES`.
- `HARD_MAX_MB=100` is an absolute ceiling that clamps any configured `maxSizeMb`.
- `SAFE_EXTENSIONS`→mime map in `lib/file-rules.ts` is the security backstop: an extension/MIME never in the safe set is rejected **regardless** of admin config (e.g. `.svg` always blocked). `ALL_SAFE_MIME_TYPES` is derived from this map — don't hardcode a parallel MIME list (that previously rejected text/markdown).
- Validation accepts an empty/missing MIME (some browsers send `""`); extension check still applies.

## Upload RBAC is path-prefix based, not method-based
**Why:** `proxy.ts` → `canAccessPath(pathname, role, permissions)` gates admin APIs by URL prefix only.
- `/api/admin/media` is `files`-gated (media *library* listing = "Select from Files").
- A Help editor may lack `files` but must still attach a document. So uploads for help go through a **separate** endpoint `/api/admin/help/upload` which falls under the `/api/admin/help` (`help`) prefix.
- **How to apply:** both endpoints share `processUpload(request, userId)` in `lib/media-upload.ts`. If you add another "X editor can upload" surface, give it an endpoint under that feature's permission prefix rather than loosening `/api/admin/media`.

## Stored-XSS guard on attachment metadata
**Why:** attachment `url` is rendered as `<a href>` on public `/help`; a `javascript:`/`data:`/protocol-relative `//host` URL would be stored XSS.
- `sanitizeAttachments()` runs at the trust boundary in help POST and PATCH (only when `"attachments" in data`). It drops unsafe URLs via `isSafeAttachmentUrl` (allows relative `/…`, `http(s):`; rejects `javascript:`/`data:`/`vbscript:`/`//`), caps 50 items, clamps field lengths.

## Next.js 16 request-body size limit (non-obvious)
**Why:** `proxy.ts` truncates request bodies at 10MB by default, causing "Failed to parse body as FormData" 500s on larger uploads.
- Correct config key is `experimental.proxyClientMaxBodySize` in `next.config.mjs`. The top-level `middlewareClientMaxBodySize` is **ignored** in this setup.
- Upload route handlers also set `export const maxDuration = 60`.

## Tables
- Media records live in `media_files` (not `media`). Help attachments are denormalized JSONB on `help_articles.attachments`.
