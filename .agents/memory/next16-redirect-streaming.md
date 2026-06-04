---
name: Next 16 redirect under streaming SSR
description: Why server-component redirect() degrades to a soft redirect, and how canonical/legacy-URL SEO redirects must be done in middleware
---

# Next 16 streaming SSR breaks server-component redirects for SEO

Calling `redirect()` / `permanentRedirect()` inside a Server Component (page body
OR `generateMetadata`) on this app does NOT produce an HTTP 3xx. Next 16 streams
the shell with HTTP **200** first, so the redirect degrades to a **soft client
redirect**: the response is `Transfer-Encoding: chunked`, status 200, with
`NEXT_REDIRECT` serialized into the body. Browsers navigate fine, but Googlebot
sees a 200 — useless for SEO "301" requirements. `force-dynamic` does NOT change
this; it's the streaming flush, not caching.

**Rule:** do canonical / legacy-URL redirects (e.g. `/trip/{id}` → `/trip/{slug}`)
in `proxy.ts` middleware with `NextResponse.redirect(target, 308)`. Middleware runs
before any render, so it emits a real HTTP 308. Preserve query via
`request.nextUrl.clone()`.

**Why:** verified empirically — an unconditional `throw` in the page body still
returned 200 (it streamed as an inline error), and `permanentRedirect` in both the
page and `generateMetadata` produced chunked-200 soft redirects.

## Middleware can't query Postgres directly, and self-fetch must use loopback
proxy.ts runs on the **edge runtime** (uses `jose`); it cannot `import` the `pg`
pool. So it resolves the slug via a tiny internal endpoint
(`/api/trip-slug/[id]`). Critical gotcha: fetching that endpoint via the **public**
host (`new URL(path, request.url)`) **fails** in the container (it round-trips the
Replit edge proxy → caught → no redirect → 200). Fetch over the internal loopback
instead: `http://127.0.0.1:${process.env.PORT || '5000'}/...`. Localhost worked in
dev only because `request.url` was already localhost there.

**How to apply:** any future DB-backed middleware decision (redirects, gating that
needs DB) follows the same shape — minimal force-dynamic JSON endpoint + loopback
fetch from proxy.ts, never a public-host self-fetch.

## Keep generated slugs out of the legacy-id namespace
proxy.ts only treats segments matching `/^(?:tcms_?\d+|\d+)$/` as legacy ids.
`generateSlug` therefore must never emit an all-digit (or `tcms\d+`) slug, or a real
slug could be hijacked / mis-resolved to another trip's palisis_id. Guard added in
`generateSlug` (prefix `trip-`) and create/update fallbacks avoid the `tcms_NN` id.
