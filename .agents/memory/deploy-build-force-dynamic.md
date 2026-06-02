---
name: Deploy build prerender DB timeout
description: Why DB-backed server pages must be force-dynamic or the production deploy build fails
---

Any **server-component `page.tsx` that queries PostgreSQL** (uses `db*` helpers / `@/lib/db/queries`) on a **static route** must declare `export const dynamic = "force-dynamic"`. Otherwise `next build` tries to prerender it and connects to the DB at build time.

**Why:** Replit autoscale deploy runs `pnpm build` in a sandbox with **no DB reachable**. A prerender of such a page fails with `Error: Connection terminated due to connection timeout` → `exiting the build` → publish fails. The dev workflow and local `next build` pass because the DB *is* reachable there, so this only surfaces on deploy.

**How to apply:**
- Static admin/public routes that hit the DB need `force-dynamic` (list pages already had it; `/admin` dashboard + `/admin/ai-systems` were the gap that broke a publish).
- Dynamic `[id]` routes without `generateStaticParams` are on-demand anyway, so the line is redundant-but-harmless there.
- `app/layout.tsx` also calls the DB (`dbGetInjectionBlocks`) but is **fail-soft** via `.catch`, so it does NOT hard-fail the build.
- To debug a publish failure: get the actual error from the Deployments build log (the `fetch_deployment_logs` tool returns nothing when the build fails before the app runs). Reproduce locally with a clean `rm -rf .next && pnpm build`.
