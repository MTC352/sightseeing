---
name: Deploy build prerender DB timeout
description: Why DB-backed server pages must be force-dynamic or the production deploy build fails
---

A **server-component `page.tsx` that queries PostgreSQL** (uses `db*` helpers / `@/lib/db/queries`) on a **static route** EITHER must declare `export const dynamic = "force-dynamic"` OR must make every DB read **fail-soft** (`.catch(fallback)` + `withTimeout`) so the build-time prerender can succeed with empty data. Pick fail-soft + ISR (`export const revalidate = N`) for any route on the deploy **healthcheck path** (`/`), and force-dynamic for the rest.

**Why:** Replit autoscale deploy runs `pnpm build` in a sandbox with **no DB reachable**. A prerender of a page with *unguarded* DB reads fails with `Error: Connection terminated due to connection timeout` → `exiting the build` → publish fails. The dev workflow and local `next build` pass because the DB *is* reachable there, so this only surfaces on deploy. Fail-soft reads sidestep this: the prerender returns the fallback instead of crashing.

**The `/` exception (important):** the home route `/` was switched FROM force-dynamic TO `revalidate = 300` ISR on purpose — full per-request SSR of `/` on a cold instance blew the autoscale startup-probe deadline (see `deploy-healthcheck-pool-starvation.md`). ISR serves the probe prebuilt HTML. This is only safe because `app/page.tsx` + `app/layout.tsx` DB reads are fail-soft, so the build prerenders `/` cleanly even with no DB. Do NOT revert `/` to force-dynamic to "fix the build" — fix the fail-soft guard instead.

**How to apply:**
- Static admin/public routes that hit the DB need `force-dynamic` (list pages already had it; `/admin` dashboard + `/admin/ai-systems` were the gap that broke a publish).
- Dynamic `[id]` routes without `generateStaticParams` are on-demand anyway, so the line is redundant-but-harmless there.
- `app/layout.tsx` also calls the DB (`dbGetInjectionBlocks`) but is **fail-soft** via `.catch`, so it does NOT hard-fail the build.
- To debug a publish failure: get the actual error from the Deployments build log (the `fetch_deployment_logs` tool returns nothing when the build fails before the app runs). Reproduce locally with a clean `rm -rf .next && pnpm build`.
