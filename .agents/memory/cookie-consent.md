---
name: Cookie consent system
description: How the admin-configurable cookie banner enforces tracking-script blocking, and where the real enforcement points are.
---

# Cookie consent

Admin-configurable banner + actual consent enforcement (categories: necessary always-on, functional, marketing).

- **Config storage:** `integrations` key `cookie_consent`, full config in the `meta` JSONB. Read/write via `dbGetCookieSettings`/`dbUpdateCookieSettings`; `DEFAULT_COOKIE_SETTINGS` is the fallback when the row is missing (so a fresh/live DB still gets a working banner). Text is HTML-stripped and the privacy URL is scheme-restricted on write (XSS guard).
- **Real marketing enforcement is in the per-page Travelpayouts widgets**, NOT the banner. `flight-search-widget.tsx` / `train-search-widget.tsx` gate their `<script>` injection on `useConsent().marketing` and render `ConsentNotice` when blocked. The banner's `<TravelpayoutsAllowed/>` only sets a `window.__tpConsentGiven` marker that nothing reads — do not mistake it for the gate.
- **Weglot (functional)** IS loaded from the banner (`WeglotScript`), gated on functional consent.
- **Admin-disables-a-category must propagate to already-consented users.** The banner runs a reconcile effect: when `cfg.enabled` and a category is no longer offered, it `saveConsent()` with that bit forced false. That dispatches `CONSENT_CHANGE_EVENT`, which `useConsent()` (and thus the widgets) pick up immediately — otherwise old consenters keep loading scripts until they re-save.
  - **Why:** effective = offered && stored. Widgets can't see admin config, so storage is reconciled to be the single source of truth. Tradeoff: re-enabling a category later does NOT restore the prior "yes" (privacy-safe default).
- **Banner disabled (`enabled:false`)** = no consent management: an effect forces stored consent to all-true (even overriding prior partial choices) so optional scripts load and widgets aren't stuck blocked.
- **API:** `/api/admin/cookie-settings` GET/PUT — guarded with `requireAnyPermission(["integrations"])` in-route (defense in depth) AND a ROUTE_RULES proxy entry. Admin UI is a tab in `/admin/integrations` (integrations permission, not superadmin-only).
