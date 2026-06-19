---
name: Site frontend protection (server-side gate)
description: How the public-site password gate is enforced server-side and why the proxy signs the pathname.
---

# Server-side frontend password gate

Replaces the old client-side localStorage PIN. The gate is enforced in the root
`app/layout.tsx`: when protection is enabled and the visitor lacks a valid signed
HttpOnly `site_access` cookie, the layout early-returns a minimal
`<html><body><SiteAccessGate/></body></html>` — no children, banner, or providers,
so the protected page body is never rendered (no flash).

## Admin-route bypass MUST use the signed pathname, not raw `x-pathname`
The layout needs the request path to bypass `/admin/*`, but server components
can't read it directly. `proxy.ts` sets `x-pathname`. **Critical:** the bare `/`
route is excluded from the proxy matcher (cold-start perf), so the proxy never
runs there and a client could forge `x-pathname: /admin` on `/` to skip the gate.

**Why / how to apply:** proxy.ts also sets `x-pathname-sig = SHA-256(ADMIN_JWT_SECRET:path)`
(`signPathname` in `lib/site-protection.ts`), and the layout only trusts
`x-pathname` when `verifyPathname` passes. A bare `/` request carries no valid
signature → path defaults to `/` → gated. Any new "tell the layout the path"
need must reuse this signed pair, never trust a raw client header on `/`.

## Config + degradation
- Stored in `integrations` key `site_protection` (value=password, meta={enabled}).
  **Missing-row default = `{enabled:true, password:"3462"}`** so staging is never
  accidentally exposed. Helpers `dbGetSiteProtection`/`dbUpdateSiteProtection`.
- Cookie token embeds a fingerprint of the current password → changing the
  password revokes all existing sessions.
- DB read fail/timeout in layout → treated as enabled with password unknown
  (fail-closed for new visitors); `verifySiteAccess(token, null)` skips the
  fingerprint check so already-authenticated cookie holders aren't locked out.
- Admin UI: Admin Settings → Security tab (`/admin/integrations`, superadmin-only).
  API `GET`/`PUT /api/admin/security` (superadmin); unlock `POST /api/site-access`.
