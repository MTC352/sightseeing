---
name: Deploy healthcheck DB pool starvation
description: Why autoscale publish can fail on the / healthcheck even when the prod DB is reachable, and how to keep / deploy-safe.
---

# Autoscale publish fails on `/` healthcheck (pool starvation, not DB-down)

The Replit **autoscale** deploy healthcheck hits `/`, which server-renders DB
queries (root `app/layout.tsx` + homepage `app/page.tsx`). If anything saturates
the small pg pool (`lib/db.ts`: `max:10`, `connectionTimeoutMillis:5000`) during
the boot window, `/` can't get a connection and exceeds the healthcheck deadline
("context deadline exceeded") — so the deploy never becomes healthy and publish
fails. Symptom in deploy logs is a **connection *timeout*** ("Connection
terminated due to connection timeout"), NOT a TLS/cert error. The pg SSL-mode
deprecation warning ('require' treated as 'verify-full') is just noise here.

**Why:** `instrumentation.ts` ran `triggerDiscoveryBootstrap()` eagerly at boot.
That kicks off a ~minutes-long TourCMS sweep that writes to Postgres on *every*
call (cross-instance discovery/availability cache persistence + per-outbound-call
error logging). On a cold autoscale start that write burst starves the pool right
when the healthcheck needs it. Prod DB was fully reachable (replica query OK) and
dev worked — confirming it was contention, not connectivity.

**How to apply:**
- Never run heavy DB/external-API warm-up synchronously at boot. Defer it past the
  healthcheck window (`setTimeout(...).unref()`, ~15s) so `/` returns 200 first.
- Keep the `/` healthcheck render path fast & DB-resilient: run independent reads
  with `Promise.all`, and bound each additive read with `withTimeout(promise, ms,
  fallback)` (in `lib/db.ts`) so a slow/contended DB can never block render. These
  homepage reads are additive only (JSON-LD + header/footer injection).
- There is **no scheduled cron** in `.replit`; instrumentation is the only
  in-process warm path. A real prod warm path = a scheduled deployment calling
  `app/api/cron/refresh-discovery` + `auto-update-availability`.
