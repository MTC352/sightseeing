# Threat Model

## Project Overview

sightseeing.lu is a Next.js 16 tourism discovery and booking platform for Luxembourg with a public storefront, AI-assisted planning features, and a full admin panel under `/admin/*`. It stores operational content and integration settings in PostgreSQL, uses a JWT cookie for admin sessions, integrates with TourCMS/Palisis for catalog and availability data, and relies on several third-party APIs for maps, weather, reviews, translation, and AI features.

The current deployment is publicly reachable on the internet. The client-side site PIN gate is not a production security boundary, so public pages, public API handlers, admin login, and any webhook or cron endpoints must be treated as internet-accessible unless a server-side control proves otherwise.

## Assets

- **Admin accounts and sessions** — admin email addresses, password hashes, JWT session cookies, and the JWT signing secret. Compromise gives full control of site content, integrations, and AI/system settings.
- **Integration secrets** — TourCMS/Palisis credentials, AI provider keys, Google Places, Mapbox, weather, and translation keys stored in the database or environment. Compromise can expose data, incur cost, or let an attacker impersonate the application to third parties.
- **Content and CMS data** — trips, blog posts, help articles, pages, ticket records, AI prompts/configs, and header/footer HTML blocks. Tampering can deface the site, inject attacker-controlled script, or alter business content.
- **Applicant documents and contact data** — resumes, cover letters, email addresses, phone numbers, and any supporting files uploaded through public careers flows. Exposure would leak sensitive personal data.
- **Public infrastructure and billable resources** — public blob storage, external API quotas, database capacity, and AI usage. Abuse can create cost, service degradation, or operational disruption.
- **Palisis/TourCMS sync state** — imported trip data, sync logs, and webhook-triggered refresh behavior. Integrity matters because sync actions can overwrite local trip data.

## Trust Boundaries

- **Browser to Next.js server** — all page visits, API requests, uploads, and admin actions cross from an untrusted client into trusted server code.
- **Admin boundary** — `/admin/*` and `/api/admin/*` are more trusted than public routes and must be enforced server-side, not just in client code.
- **Server to PostgreSQL** — route handlers and server components query and update the database directly; injection or missing authorization here has broad impact.
- **Server to third-party APIs** — the app calls TourCMS/Palisis, Google Places, OpenWeather, Mapbox, Weglot, and AI providers using sensitive credentials.
- **External service to webhook endpoint** — `/api/webhooks/palisis` is intended to accept inbound events from an external provider and therefore needs explicit request authenticity checks.
- **Internal/development vs production** — docs, implementation notes, backups, and mock artifacts may describe sensitive defaults; only production-reachable behavior should drive findings, but those files still help establish what production seeds or defaults may exist.

## Scan Anchors

- **Production entry points:** `app/api/**/*`, `app/admin/**/*`, `proxy.ts`, `app/layout.tsx`
- **Highest-risk code areas:** `lib/auth.ts`, `app/api/upload/route.ts`, `app/api/careers/apply/route.ts`, `app/api/webhooks/palisis/route.ts`, `app/api/admin/settings/route.ts`, `app/api/help-chat/route.ts`, `app/api/trip-chat/route.ts`, `app/api/planner/route.ts`, `app/api/itinerary/route.ts`, `app/api/google-reviews/route.ts`, `app/page.tsx`, `app/explore/page.tsx`, `lib/db/queries.ts`, `lib/tourcms.ts`
- **Surface split:** public site and APIs under `app/` and `app/api/*`; admin UI and admin APIs under `app/admin/*` and `app/api/admin/*`; external webhook under `app/api/webhooks/*`
- **Usually dev-only / lower-priority:** docs, implementation dashboards, attached assets, and historical artifacts unless they prove a live production default or active data flow
- **Context-sensitive disclosures:** browser-exposed publishable vendor keys are not findings by themselves; treat them as in-scope only when code can disclose a server-only or broader-scoped credential, or when a masked/admin-only secret store is unintentionally bridged into a public route

## Threat Categories

### Spoofing

The main spoofing risk is unauthorized admin access. The application must require an unpredictable, deployment-specific signing secret for admin JWTs, reject forged or expired session tokens on every protected request, and avoid shipping fixed/default administrator credentials that allow attackers to impersonate staff.

Webhook traffic is another spoofing boundary. Any inbound Palisis webhook accepted in production must be authenticated with a required shared-secret or signature verification step before the payload is trusted.

### Tampering

Admins and trusted integrations can modify high-impact content such as trips, blog posts, pages, AI prompts, and header/footer HTML. The system must ensure only authorized administrators can mutate this data, and untrusted callers must not be able to trigger content-changing syncs, uploads, or settings updates.

Because Palisis is upstream for synced trip data, webhook- or import-driven refreshes are integrity-sensitive. The app must prevent unauthorized actors from causing overwrite operations or writing attacker-controlled data into core catalog records.

### Information Disclosure

The app stores multiple sensitive keys and internal prompts. Those values must never be exposed to public clients or leak through logs, public routes, or client bundles unless the specific token is intentionally publishable. Admin APIs that return settings must stay inside the admin boundary.

Error responses and rendered content must not expose secrets or unsafely execute attacker-controlled HTML. Any rich content rendered to end users must be serialized or sanitized in a way that prevents script execution.

Structured-data `<script type="application/ld+json">` blocks are active render sinks, not inert metadata. Any database-backed values interpolated into JSON-LD must be escaped with a serializer that prevents `</script>` breakout.

Stored-but-unrendered HTML configuration is lower priority than active render sinks. If a settings field can store custom HTML but the current production codebase never injects it into a public page, do not report XSS until a real render path is identified.

### Denial of Service

The platform exposes public and semi-public endpoints that can consume blob storage, third-party API quota, database work, and AI tokens. Unauthenticated endpoints that upload files, proxy external calls, or invoke expensive processing must enforce strong limits so an attacker cannot create cost spikes or degrade service.

In this codebase, special attention belongs on public upload handlers, job-application attachment flows, AI/planner endpoints that can fan out into TourCMS and model-provider requests from a single caller action, and public provider-backed utility routes such as weather, reviews, map configuration, availability, and discovery refresh paths.

Because the production deployment is public and can run across multiple processes or cold starts, process-local caches and in-memory per-instance rate limits are not sufficient as the sole abuse control for expensive public routes. Public endpoints that warm caches, fan out into TourCMS, or forward large prompts to paid AI providers need safeguards that still hold across cache-busting input, restarts, and horizontal scaling.

### Elevation of Privilege

The core elevation-of-privilege concern is movement from public/deployment-accessible user to admin capabilities. Protected admin pages and APIs must remain secure even if perimeter assumptions fail, and insecure defaults must not let an attacker mint their own admin session.

Within the admin surface, role-bearing session data should only grant the privileges actually intended by the server. Any functionality that can inject script into public pages or update integrations is effectively full-site compromise and must be treated as such.

Administrative revocation must take effect immediately on both server-rendered admin pages and admin APIs. Edge middleware may use JWT claims for coarse routing, but every sensitive page or handler must enforce fresh database-backed role, permission, and active-user checks before loading data or performing mutations.
