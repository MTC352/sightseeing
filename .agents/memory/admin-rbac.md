---
name: Admin RBAC (employee accounts)
description: How per-section admin permissions are enforced and what must stay in sync.
---

# Admin RBAC — employee accounts

Superadmin (`FULL_ACCESS_ROLE='superadmin'`) bypasses all checks. `employee` accounts
log in with a username (email optional) and hold a `permissions` jsonb array of section
keys. Source of truth for keys/rules: `lib/admin-permissions.ts` (edge-safe, no Node deps).

## Two-layer enforcement (deliberate split)
- **Edge proxy (`proxy.ts`)** gates every `/admin/*` and `/api/admin/*` request via
  `canAccessPath(pathname, session.role, session.permissions)` using **JWT claims**.
  These claims are STALE for up to the token TTL (8h) — the proxy runs in edge runtime
  and cannot query Postgres (pg is Node-only).
- **Server routes (`requireAdminSession()` in `lib/auth-server.ts`)** are
  **DB-authoritative**: it re-reads `role`/`permissions`/`is_active` from the DB and
  returns a session with fresh values. This makes demotions, permission edits, and
  deactivation take effect immediately on API routes despite the stale JWT.

**Why:** full DB-authoritative checks in the edge proxy aren't feasible without
reworking the runtime; the 8h staleness in the *first* gate is an accepted tradeoff,
backstopped by the DB-fresh check in `requireAdminSession`.

## Keep-in-sync rule (causes false 403s if missed)
`canAccessPath` denies any `/api/admin/*` path that has **no** `ROUTE_RULES` entry for
non-superadmins. So **every new `/api/admin/*` endpoint must be added to `ROUTE_RULES`**
mapped to the section(s) whose pages call it, or employees with that section get a 403.
Endpoints shared across sections take a multi-key `keys: [...]` array (longest-prefix
wins; one rule per request). Unmapped endpoints (e.g. `/api/admin/logs`) are effectively
superadmin-only.

## Invariants
- User-management (`/admin/users`, `/api/admin/users`) is superadmin-only and never a
  grantable permission key. API routes also check `session.role === FULL_ACCESS_ROLE`.
- DB write guards: employee update/delete use `WHERE role <> 'superadmin'` so the
  bootstrap admin can't be demoted/deleted via the employee CRUD.
- Username uniqueness = partial unique index on `lower(username)` (case-insensitive);
  duplicate inserts surface as Postgres `23505` → API returns 409.
- Schema is created idempotently in `scripts/seed-db.mjs` (`ensureUserManagementSchema`)
  for prod reproducibility.

## Shared-endpoint key drift
When a NEW permission domain starts reusing an EXISTING shared endpoint, you must add
that perm to the endpoint's `keys: [...]` array too — not just gate the route logic.
Example: the Palisis importer-settings feature stored its defaults via the shared
`/api/admin/settings` (section `importSettings`, gated `palisis` in the route), but the
proxy rule for `/api/admin/settings` lacked `palisis`, so a `palisis`-only employee got
a false 403 before the handler ran. Route-level perm checks are invisible to the proxy.
