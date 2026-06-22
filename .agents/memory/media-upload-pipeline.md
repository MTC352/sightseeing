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

## Durable storage — runtime files MUST NOT use public/uploads in prod
`persistBuffer` picks storage in order: **Replit App Storage (Object Storage)** → Vercel
Blob (`BLOB_READ_WRITE_TOKEN`) → `public/uploads` local disk.
**Why:** a published Replit deploy has an EPHEMERAL filesystem and only serves
build-time `public/` assets — anything written to `public/uploads` at runtime (every
AI-generated blog cover, every admin upload) 404s in production ("broken image" in
dev-vs-prod bug). Committed `public/images/...` assets still work because they ship at
build time.
**How to apply:**
- Object Storage is the default whenever `PUBLIC_OBJECT_SEARCH_PATHS` is set
  (`isObjectStorageConfigured()` in `lib/object-storage.ts`). Files are saved under the
  bucket's PUBLIC search path and served back via `GET /public-objects/<key>`
  (`app/public-objects/[...path]/route.ts`, nodejs runtime, streams via the GCS sidecar
  client). `media_files.storage` = `"object"`.
- The served key keeps its image extension on purpose: `proxy.ts`'s matcher excludes
  `.png/.jpg/.svg`, so `/public-objects/...png` bypasses the password/admin auth gate and
  is publicly fetchable (blog covers are world-readable by design).
- **Object-storage env vars only load on process start** — after `setup_object_storage`
  you MUST restart the "Start application" workflow or `isObjectStorageConfigured()` stays
  false and uploads silently fall back to local disk.
- Old rows written before the fix keep dead `/uploads/...` URLs; they don't self-heal —
  regenerate (blog "Regenerate with AI") or re-upload to repopulate.
- Testing dedup: identical bytes short-circuit via sha256, returning the OLD record/storage
  — use **unique bytes** (`head -c N /dev/urandom`) to actually exercise a fresh store.

## Remote-URL image import (Palisis trip images)
- `processImageFromUrl(url, opts)` + `localizeImageUrls(urls, uploadedBy)` download a
  remote IMAGE onto our system and record it in `media_files`. Used so Palisis/TourCMS
  trip images live locally instead of hot-linking `cdn.tourcms.com`, and so they appear
  in the Files library. Fail-soft: returns `{url:null}` so a failed import keeps the
  original remote URL rather than breaking the trip.
- **Two-layer dedup:** by `media_files.source_url` (skips the network fetch on re-sync)
  AND by sha256 content_hash. `dbFindMediaBySourceUrl` / `dbSetMediaSourceUrlIfNull`.
- **Wired into every Palisis write path:** `localizeMappedImages(mapped, uploadedBy)` in
  `lib/palisis-sync.ts` (mutates `image`/`gallery` → local) is called in
  `syncSingleTripFromPalisis` (covers webhook) and at all 3 write sites in the bulk
  `palisis-import` route. ONE-WAY preserved — only READS the CDN, never pushes back.
- **Backfill existing trips:** `POST /api/admin/media/backfill-trips` (`files` perm,
  under /api/admin/media prefix) + "Import trip images" button on `/admin/files`.
  Idempotent (source_url/hash dedup), fail-soft per image.
- **SSRF guard (REQUIRED, do not remove):** `processImageFromUrl` fetches arbitrary
  admin-supplied URLs (backfill uses editable trip image/gallery URLs), so it MUST go
  through `safeImageFetch`: resolves DNS + blocks loopback/private/link-local
  (incl. 169.254.169.254 metadata)/ULA/reserved via `isBlockedIp`+`assertPublicHost`,
  uses manual redirects and re-validates every hop. Verified blocks 127.0.0.1, ::1,
  RFC1918, metadata IP; allows cdn.tourcms.com.
