---
name: Centralized media upload pipeline
description: All admin uploads must funnel through lib/media-upload.ts so every file is recorded in media_files and deduplicated.
---

# Centralized media upload pipeline

Every admin upload entry point MUST go through `lib/media-upload.ts`
(`processUpload` for multipart routes, or `processUploadFile` for an already-parsed
`File`). This guarantees the file is recorded in `media_files` and deduplicated.

**Why:** uploads used to be siloed (`/api/upload` for blog, `/api/admin/trips/upload`
for trips, `/api/admin/help/upload`, the Files page). Siloed uploaders drift apart and
store duplicate copies of identical files. Centralizing fixes both.

**How to apply:**
- New admin upload? Don't write storage/DB code — call `processUpload(request, userId, opts)`.
  `opts.restrictImage` limits to `image/*` (used by the legacy blog/trip image fields,
  which still return `{ url }` to keep their forms working).
- Dedup is by **sha256 of the file bytes** stored in `media_files.content_hash`.
  A **unique partial index** `media_files_hash_uniq … WHERE content_hash IS NOT NULL`
  enforces it atomically; `dbCreateMedia` uses `ON CONFLICT … DO NOTHING` and returns
  `{ row, created }`. On a lost race (`created:false`) the just-written local orphan is
  unlinked. NULL hashes never conflict (legacy rows).
- `dbFindMediaUsage(url)` powers the Files preview "Linked with" panel by scanning
  blog_posts/trips/help_articles/pages/header_footer_blocks for the stored URL. Substring
  LIKE is safe here only because upload URLs are unique tokens (`/uploads/<ts>-<rand>.<ext>`);
  array/exact columns (trips.gallery, image/pdf/video) use exact match, not LIKE.
- `careers/apply` CV upload is **public**, intentionally NOT routed through this pipeline.
