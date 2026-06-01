---
name: SEO indexing control (staging vs live)
description: How this repo keeps the Replit-published staging site out of Google while letting the live domain be indexed.
---

The same codebase deploys to two places: the Replit-published demo (**staging**, must
stay out of Google) and a separate **live domain** (should be indexed). Release flow is
staging-first, then push to live.

## Rule
Indexing is **opt-in**, OFF by default. Single source of truth: `lib/seo.ts`
`isIndexingEnabled()` → true only when env `ALLOW_INDEXING` === "true".
- Unset (Replit deploy never sets it) → `noindex` + `robots.txt` `Disallow: /`.
- `ALLOW_INDEXING=true` (live env only) → `index, follow` + full allow-list robots.

**Why opt-in not opt-out:** a forgotten flag should fail *safe* (hidden), never expose
staging and create duplicate-content competition with the live domain.

**How to apply:** the check feeds BOTH `app/layout.tsx` robots metadata AND
`app/robots.ts`. They must agree — change both via the shared helper, never inline.

## Gotcha: no static public/robots.txt
Never add a static `public/robots.txt` or `public/sitemap.xml`. They conflict with the
dynamic `app/robots.ts` / `app/sitemap.ts` routes — Next.js throws "A conflicting public
file and page file was found for path /robots.txt" and serves a 500 on /robots.txt. The
`app/` route files are the sole owners of those paths.

Full user-facing runbook: `docs/seo-indexing.md`.
