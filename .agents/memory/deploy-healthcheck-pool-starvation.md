---
name: Deploy healthcheck must not block on the DB
description: Why Replit autoscale publish fails on the / healthcheck, the serverless prod-DB cold-start race, the dev-vs-prod sslmode trap, and how to keep / + the pg pool deploy-safe.
---

# Autoscale publish fails on the `/` healthcheck

The Replit **autoscale** deploy healthcheck repeatedly GETs `/` with a short
per-attempt deadline (observed ~2–2.5s). `/` server-renders DB reads (root
`app/layout.tsx` + homepage `app/page.tsx`). If those reads can't complete fast,
the healthcheck logs **"context deadline exceeded"**, the instance never goes
healthy, and publish fails (`exit status 143` = SIGTERM kill, ~9–11s after boot).

## CONFIRMED root cause: the prod DB cold-starts in ~8s

The production database is **serverless/suspends when idle**. Measured directly:
a first query against prod took **~8000ms** (dev DB: ~8ms). On a fresh deploy the
healthcheck hits `/` ~0.3s after "Ready", the render's first DB connection races
the wake and gets **"Connection terminated unexpectedly" / connect timeout**, `/`
blocks past the deadline, and the deploy is killed before the DB (~8s) finishes
waking. The SSL warning / sslmode work below was a real but secondary fix — it
did NOT solve the cold-start race. External TourCMS timeouts in the same logs are
a SEPARATE concern (the deferred discovery bootstrap hammering TourCMS), not the
healthcheck blocker.

## Two-part fix that actually works

1. **`/` must return 200 fast regardless of DB state.** Bound every additive read
   with `withTimeout(promise, ms, fallback)` (`lib/db.ts`). CRITICAL: the root
   layout `await`s its reads BEFORE the child page renders, so layout-timeout +
   page-timeout are **SEQUENTIAL, not parallel** — their SUM must stay under the
   healthcheck deadline. Using 1000ms each (=~2s) was borderline and still failed;
   dropped to **600ms each (=~1.2s)**. A warm DB returns in ~50ms so this only
   changes the cold-start fallback. Homepage reads are additive only (JSON-LD +
   header/footer injection + announcement), so empty fallbacks are visually safe
   (all visible homepage content is client-fetched).
2. **Warm the DB at boot.** `instrumentation.register()` fires a fire-and-forget
   `pool.query("SELECT 1")` (with a few retries) IMMEDIATELY on boot so the cold
   DB starts waking in the background while `/` passes the healthcheck via
   fallbacks. By the time real traffic / later healthchecks arrive (~8s) the DB is
   warm and full data renders. Keep this non-blocking — never `await` it in
   `register()`.

Also still defer heavy warm-up: `triggerDiscoveryBootstrap()` stays behind a
`setTimeout(...).unref()` (~15s), separate from the lightweight SELECT 1 ping.

## The dev-vs-prod `sslmode` trap (secondary fix, keep it)

Dev and prod use **different DATABASE_URLs with different `sslmode`**:
- **dev** `sslmode=disable` → no TLS → ~8–46ms, never prints the pg SSL warning.
  ("Works in dev" tells you nothing about prod SSL.)
- **prod** `sslmode=require` → `pg-connection-string` (>=2.x) now treats
  require/prefer/verify-ca as **`verify-full`**, which emits the SSL deprecation
  warning seen ONLY in prod logs.

**Pool config that survives both (`lib/db.ts` `buildPoolConfig`):**
- Set `ssl` **explicitly** from the URL's `sslmode` (`disable`→`ssl:false`,
  else→`ssl:{rejectUnauthorized:false}`) and **strip `sslmode`** from the
  connection string so the driver never re-applies verify-full and the warning
  goes away. `rejectUnauthorized:false` = encrypt-without-chain-verify; restores
  the historical meaning of `sslmode=require` (standard Replit/Neon pattern) but
  IS a transport-auth downgrade — keep it documented/intentional, not silent.
- On URL parse failure, pass the raw string through with **no explicit ssl** (let
  libpq decide) — never force `ssl:false` (silent plaintext downgrade).
- **Generous `connectionTimeoutMillis` (~15s)** so the ~8s cold wake succeeds on
  the first connection instead of failing the deploy.

**Why pool starvation was a red herring:** the healthcheck failed ~1.8–2.5s after
Ready, before any deferred work and while the pool was free — so the blocker was
connection *establishment* timing (cold-start wake), not pool contention.

## Validation note

`next build` is memory-heavy and gets SIGKILLed in-sandbox when run alongside the
`next dev` workflow (empty log, no BUILD_ID, no error). Validate edits via the dev
server's Fast Refresh compile + `curl /` instead, or stop the workflow first.
