---
name: Data Migrations system (dev → live content sync)
description: The DATA-only (content) vs manual-DDL schema boundary; deploy is git + Docker → VPS (not Replit Publish).
---

# Data Migrations — the boundary that matters

Mechanics live in `replit.md` ("Data Migrations"). This file records the
non-obvious decision behind it.

**Deploy model (current): git + Docker → manual VPS. NOT Replit Publish.** Replit
Publish (named below as history) is deprecated; there is no automatic dev→prod
schema sync anymore.

**Rule: this content-migration system moves row CONTENT only, never DDL.** No
CREATE/ALTER/DROP, no startup/runtime DDL to "self-heal" prod.

**Why + how schema changes ship:** schema DDL is applied **manually against the
live DB before deploying the dependent code** — each change is a dated
`docs/db/YYYY-MM-DD-*.sql`. Run it on live, confirm, then git push → Docker build →
deploy. If code that reads a new column ships first, the site 500s (42703). New
column reads should also degrade gracefully where cheap (probe `information_schema`
once, select `NULL` when absent) so a behind-schema DB can't hard-block a page —
see `lib/db/queries.ts` `hasGooglePlaceIdColumn()`.

**How to apply content:** the `data_migrations` tracking table is created on live by
its own `docs/db/*.sql`. If absent on a behind DB, the runner still applies data
idempotently and reports `recorded:false` (pg error 42P01 caught by
`isUndefinedTable`). So when prod is behind: **apply pending `docs/db/*.sql` first**,
then run the content migrations from `/admin/db-migrations`.

**Idempotency caveat:** apply() is check-then-insert (no unique constraint on
help_articles), so it is NOT concurrency-safe under simultaneous runs. Acceptable
because it's a manual superadmin-only button; if it ever becomes automated, add a
uniqueness constraint + ON CONFLICT.

**Media-file migrations (binary vs row split):** uploads default to LOCAL storage
(`public/uploads/…`) when `BLOB_READ_WRITE_TOKEN` is unset — and that dir is
committed, so the PDF/image binary reaches prod via the Docker image (code), NOT the
migration. A media-library data migration therefore only inserts the `media_files`
ROW (filename/url/mime/size/storage/content_hash). Dedup by content_hash
(`ON CONFLICT (content_hash) WHERE content_hash IS NOT NULL DO NOTHING`); resolve
`uploaded_by` via `(SELECT id FROM admin_users WHERE id=$N)` so a missing admin
degrades to NULL instead of an FK violation. If blob storage is ever enabled the
url is already absolute/durable, so the same row-only migration still works.
