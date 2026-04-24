# sightseeing.lu — Project Overview

## What This Is
Next.js 14 tourism discovery and booking platform for Luxembourg.
Includes a full public frontend and a comprehensive admin panel at `/admin/*`.

## Key Architecture

- **Framework:** Next.js 14 (App Router) with TypeScript
- **Package manager:** pnpm
- **Workflow:** `next dev --turbo -p 5000`
- **Styling:** Tailwind CSS + shadcn/ui components
- **AI:** Vercel AI SDK (streamText / UIMessageStreamResponse) — Anthropic Claude + OpenAI via Vercel AI Gateway
- **File uploads:** Vercel Blob
- **Translations:** Weglot
- **Maps:** Mapbox
- **Booking:** Palisis (currently mock data — real API call commented out)
- **Weather:** OpenWeatherMap

## Auth (Current State — NOT Production Ready)
- Site PIN gate: `"3462"` — `components/site-password-gate.tsx` — localStorage only
- Admin PIN gate: `"1234"` — `app/admin/layout.tsx` — sessionStorage only
- **No server-side auth exists.** All `/api/admin/*` routes are unprotected.
- No `middleware.ts` file — no route protection at all.

## Data (Current State)
- All content stored in in-memory `globalThis` Maps in `lib/admin-store.ts`
- **Data is lost on every server restart** — no database connected
- No ORM installed, no `DATABASE_URL` env var set

## Admin Panel Pages
| Page | Path |
|---|---|
| Dashboard | `/admin` |
| Trips | `/admin/trips`, `/admin/trips/[id]` |
| Blog | `/admin/blog`, `/admin/blog/[id]` |
| Jobs | `/admin/jobs`, `/admin/jobs/[id]` |
| Applications | `/admin/jobs/applications` |
| Help & FAQ | `/admin/help`, `/admin/help/[id]` |
| Support Tickets | `/admin/tickets`, `/admin/tickets/[id]` |
| Taxonomies | `/admin/taxonomies` (save is currently a no-op stub) |
| Pages | `/admin/pages` (no API — redirects to `?admin_edit=1`) |
| Integrations | `/admin/integrations`, `/admin/integrations/weglot` |
| Header/Footer | `/admin/header-footer` |
| AI Systems | `/admin/ai-systems`, `/admin/ai-systems/[system]` |
| Palisis | `/admin/palisis` |

## Documentation Files
| File | Contents |
|---|---|
| `docs/database-architecture.md` | 16-table PostgreSQL schema (764 lines) |
| `docs/database-changelog.md` | Append-only DB migration log (v1.0.0) |
| `docs/implementation-audit.md` | Full production-readiness audit (~35% ready) |
| `docs/api-reference.md` | Complete API reference — all 46 routes, exists vs. not-built, request/response shapes |

## Critical Known Issues
1. **No database** — all data lost on restart
2. **No admin auth** — PIN is client-side only, all API routes unprotected
3. **Palisis mock data** — real API import call is commented out
4. **Taxonomies save is a stub** — `handleSave()` never calls any API
5. **Pages module has no CRUD API** — `?admin_edit=1` inline edits not persisted to any store
6. **Google Reviews bug** — hardcoded "Dinner Hopping Luxembourg" fallback name (line 114 of `app/api/google-reviews/route.ts`)
7. **Mapbox token exposed** — `/api/mapbox-token` is a public unauthenticated endpoint
