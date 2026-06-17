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

## DECISIVE fix: serve `/` as ISR, not force-dynamic (render time, not just DB)

The cold-DB race is real, but bounding the DB reads was **not enough**. A failed
publish whose build INCLUDED the warm-up ping + 250ms timeouts still died: deploy
runtime logs showed `✓ Ready in 470ms`, then `healthcheck / context deadline
exceeded` at **+2.3s**, while `[instrumentation] DB warm-up ok` didn't fire until
**+7s**. So at probe time the DB was still cold — but the 250ms timeouts cap that
at ~500ms. The remaining >1.5s is the **first-request full SSR of the large
homepage client-component tree + cold module evaluation** on a 2-vCPU autoscale
instance. That render cost is independent of the DB and the DB timeouts can't
touch it.

**Fix that removes ALL per-request work from the probe path:** make `/` an **ISR
page** — `export const revalidate = 300` in `app/page.tsx` instead of
`export const dynamic = "force-dynamic"`. The startup probe then gets prebuilt/
cached HTML (a file read, ~instant 200) with zero SSR and zero DB on the request.
The page regenerates every 5 min in the background, so JSON-LD/announcement pick
up DB data once warm. This is safe to prerender at build ONLY because the layout +
page DB reads are fail-soft (`.catch` + `withTimeout`) — see
`deploy-build-force-dynamic.md` (this REVERSES the old "`/` must be force-dynamic"
rule for the probe-critical home route). The two-part fix below is still good
defense-in-depth (keeps `/` cheap if it ever does render dynamically), but ISR is
what actually makes the probe pass.

## Two-part fix (defense-in-depth, keep it)

1. **`/` must return 200 fast regardless of DB state.** Bound every additive read
   with `withTimeout(promise, ms, fallback)` (`lib/db.ts`). CRITICAL: the root
   layout `await`s its reads BEFORE the child page renders, so even though the
   layout's own reads are parallel (`Promise.all`), the layout-phase timeout +
   page-phase timeout are **SEQUENTIAL** — their SUM must stay under the
   healthcheck deadline. The observed per-attempt deadline is only ~1.8-2s, and
   the FIRST request in `next start` also pays a one-time module-load cost on top
   of the cold-DB fallback wait. 1000ms each (~2s) and even 600ms each (~1.2s)
   were too tight; settled on **250ms each (~500ms total budget)** for real
   margin. A warm DB returns in ~50ms so this only changes the cold-start
   fallback. Homepage reads are additive only (JSON-LD + header/footer injection +
   weglot + announcement), so empty fallbacks are visually safe (all visible
   homepage content is client-fetched). The render path is the ONLY server-side
   blocking on `/`: every home-section component is `"use client"`, and proxy.ts
   does no DB/loopback work on `/` (its `/trip/` + `/admin` branches are skipped).
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
