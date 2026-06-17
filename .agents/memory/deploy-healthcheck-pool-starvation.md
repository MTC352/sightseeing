---
name: Deploy healthcheck must not block on the DB
description: Why Replit autoscale publish fails on the / healthcheck, the dev-vs-prod sslmode trap, and how to keep / + the pg pool deploy-safe.
---

# Autoscale publish fails on the `/` healthcheck

The Replit **autoscale** deploy healthcheck repeatedly GETs `/` with a short
per-attempt deadline (observed ~1.5–2s). `/` server-renders DB reads (root
`app/layout.tsx` + homepage `app/page.tsx`). If those reads can't complete fast,
the healthcheck logs **"context deadline exceeded"**, the instance never goes
healthy, and publish fails.

**Rule: the `/` render must return 200 fast regardless of DB state.** Bound every
additive read with `withTimeout(promise, ms, fallback)` (`lib/db.ts`) at a value
**below the healthcheck deadline** (use ~1000ms — a warm DB returns in ~50ms, so
this only changes the cold-start fallback). The abandoned query keeps running and
warms the pool in the background. The homepage reads are additive only (JSON-LD +
header/footer injection + announcement), so empty fallbacks are safe.

Also defer heavy warm-up: `instrumentation.ts` must not run
`triggerDiscoveryBootstrap()` synchronously at boot — push it past the
healthcheck window with `setTimeout(...).unref()` (~15s).

## The dev-vs-prod `sslmode` trap (root cause of the connection timeouts)

Dev and prod use **different DATABASE_URLs with different `sslmode`**:
- **dev** `sslmode=disable` → no TLS → connects in ~15–46ms, never prints the pg
  SSL warning. (This is why "works in dev" tells you nothing about prod SSL.)
- **prod** `sslmode=require` → `pg-connection-string` (>=2.x) now treats
  require/prefer/verify-ca as **`verify-full`**, and that is what emits the SSL
  deprecation warning seen ONLY in prod logs.

Prod symptom is a connect **timeout** / "Connection terminated unexpectedly",
consistent with a cold/suspended managed DB whose first-connection wake exceeds a
short `connectionTimeoutMillis`. (Note: Replit-managed certs DO pass verify-full
when tested in dev, so cert *rejection* is not proven — but you usually can't test
the prod endpoint directly.)

**Pool config that survives both (`lib/db.ts` `buildPoolConfig`):**
- Set `ssl` **explicitly** from the URL's `sslmode` (`disable`→`ssl:false`,
  anything else→`ssl:{rejectUnauthorized:false}`) and **strip `sslmode`** from the
  connection string so the driver never re-applies verify-full + the warning goes
  away. `rejectUnauthorized:false` = encrypt-without-chain-verify; it restores the
  historical meaning of `sslmode=require` and is the standard Replit/Neon pattern,
  but it IS a transport-auth downgrade — keep it documented/intentional, not silent.
- On URL parse failure, pass the raw connection string through with **no explicit
  ssl** (let libpq decide) — never force `ssl:false`, which could silently
  downgrade to plaintext.
- Use a **generous `connectionTimeoutMillis` (~15s)** so a cold managed DB can
  wake on the first connection instead of failing the deploy.

**Why:** pool contention was an earlier red herring — the healthcheck failed
~1.8s after Ready, before any deferred work and while the pool was free, so the
real blocker was connection *establishment* timing + the `/` render blocking on it.
