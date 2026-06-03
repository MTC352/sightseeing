---
name: Activity audit log
description: How admin CRUD/auth/importer actions get attributed to a user in activity_log, and the easy-to-miss instrumentation gaps.
---

# Activity audit log

`activity_log` table + `lib/activity-log.ts` capture user-attributed audit entries.

- **Pattern:** every successful admin mutation calls `void logActivity({ actor: session, action, entityType, entityId, summary, context? })` AFTER the DB write and BEFORE the success response. `logActivity` is fail-soft (swallows all errors) and fire-and-forget (`void`, never awaited) so it can never break a mutation. `actor` is the `requireAdminSession()` payload (id/name/email/role — id/name/email come from the JWT, role/permissions are DB-fresh).
- **Action naming:** `<entity>.<verb>` (e.g. `taxonomy.create`, `application.delete`, `page_revision.create`, `auth.login`).
- **Easy-to-miss gaps when instrumenting:** DELETE handlers and non-CRUD-named mutations are the ones that get skipped. Specifically watch: `applications` PATCH/DELETE, `departures` DELETE, `pages/[id]/revisions` POST (create). A subagent fan-out to instrument routes will miss these unless explicitly told "every handler that writes, including DELETE."

**Why:** the task required logging across *all* admin mutations; first pass missed several DELETE/secondary paths and a code review caught it.

**How to apply:** when adding any new admin mutation route (or auditing coverage), grep for `export async function (POST|PATCH|PUT|DELETE)` under `app/api/admin/**` and confirm each has a `logActivity` call. The activity surface (`/admin/activity` page + `/api/admin/activity` API) is superadmin-only: 403 in the API via `role !== FULL_ACCESS_ROLE`, plus `canAccessPath` deny in `lib/admin-permissions.ts`.

**E2E test trick (no admin password needed):** mint a valid session cookie in plain Node with `jose` SignJWT using `process.env.ADMIN_JWT_SECRET` and the superadmin UUID, set `admin_session=<token>`, then curl the route. DELETE routes that take a UUID id will 500 on a non-UUID string (Postgres rejects before the log call) — use `crypto.randomUUID()` for a valid-but-nonexistent id to get a clean 200 + logged row.
