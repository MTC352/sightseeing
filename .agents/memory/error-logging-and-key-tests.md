---
name: Error logging + API key test endpoint
description: How site-wide error persistence and the admin "Test API key" flow are designed, and the security constraint on transporting keys.
---

## Site-wide error logging
- `lib/error-log.ts` owns an `error_logs` table (lazy `CREATE TABLE IF NOT EXISTS` on first use; also seeded in `scripts/seed-db.mjs`). Columns: source, level, message, status_code, context(jsonb), created_at.
- `logError` / `logCaughtError` are **fail-soft**: they swallow their own DB errors and must never throw. Call them as `void logError(...)` from request paths so a DB hiccup can't delay or break the actual response.
- Admin viewer: `/admin/logs` page + `GET/DELETE /api/admin/logs` (admin-auth via `requireAdminSession`).

## Admin "Test API key" — keys must go in POST body, never the URL
- `POST /api/admin/test-key` (NOT GET). The key travels in the JSON body.
- **Why:** API keys in query strings leak into browser history, reverse-proxy/access logs, and observability traces. A code review flagged the original GET version as a security failure.
- **How to apply:** any future per-key test/validation route must accept the secret in a POST body (or header), never `?key=...`. The client `testKey()` in `app/admin/integrations/page.tsx` posts `{ service, key, channelId?, marketplaceId?, placeId? }`.
- Failed tests are persisted via `logError` (source `test-key:<service>`) for an audit trail.
- Known: the stored Anthropic key returns a real 401 — test-key correctly shows failure; that's expected, not a bug.
