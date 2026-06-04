---
name: Data Migrations system (dev → live content sync)
description: The DATA-only vs schema-via-Publish boundary and why a custom schema-migration runner was deliberately NOT built.
---

# Data Migrations — the boundary that matters

Mechanics live in `replit.md` ("Data Migrations"). This file records the
non-obvious decision behind it.

**Rule: migrations move row CONTENT only, never DDL.** No CREATE/ALTER/DROP, no
deploy-build hooks, no startup/runtime DDL to "self-heal" prod.

**Why:** production schema is owned exclusively by Replit's Publish flow (diffs
dev→prod at publish time). The database skill explicitly forbids a custom
schema-migration runner — it's unsafe on every deploy. A request to also "create
tables" from the admin migration page was intentionally declined for this reason;
schema changes go out via Publish, content goes out via this system.

**How to apply:** the `data_migrations` tracking table reaches prod via Publish
(created in dev, never via runtime DDL). If absent on a behind-prod DB, the runner
still applies data idempotently and reports `recorded:false` (pg error 42P01 caught
by `isUndefinedTable`). So when prod is behind: **Publish first** (creates tables),
then run the content migrations from `/admin/db-migrations`.

**Idempotency caveat:** apply() is check-then-insert (no unique constraint on
help_articles), so it is NOT concurrency-safe under simultaneous runs. Acceptable
because it's a manual superadmin-only button; if it ever becomes automated, add a
uniqueness constraint + ON CONFLICT.
