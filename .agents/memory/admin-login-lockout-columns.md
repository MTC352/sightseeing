---
name: Admin login lockout columns
description: admin login 500s if admin_users is missing the lockout columns
---

The admin login route and `lib/login-lockout.ts` require two `admin_users`
columns for the brute-force lockout feature:
- `failed_login_attempts integer NOT NULL DEFAULT 0`
- `locked_until timestamptz` (nullable)

If a DB is missing either column, EVERY login attempt 500s with Postgres
42703 `column "locked_until" does not exist` (the login SELECT and the
lockout UPDATE both reference them). There is no canonical schema.sql —
the DB is the source of truth and schema reaches prod via the Publish flow.

**Why:** these columns were added in code but never applied to a DB, so a
freshly-provisioned / overwritten DB can lack them.

**How to apply:** fix dev with idempotent DDL
(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS ...`), then re-Publish so
the schema sync propagates the columns to production (a normal publish, not
the destructive "overwrite all data" option).
