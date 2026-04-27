# sightseeing.lu — Project Overview

## What This Is
Next.js 16 tourism discovery and booking platform for Luxembourg.
Includes a full public frontend and a comprehensive admin panel at `/admin/*`.

## Key Architecture

- **Framework:** Next.js 16 (App Router) with TypeScript
- **Package manager:** pnpm
- **Workflow:** `next dev --turbo -p 5000`
- **Styling:** Tailwind CSS + shadcn/ui components
- **Database:** Replit PostgreSQL (16 tables) — `lib/db.ts` pool + `lib/db/queries.ts`
- **Auth:** JWT via `jose` + bcrypt password hashing — HttpOnly cookie `admin_session`, 8h TTL
- **AI:** Vercel AI SDK (streamText / UIMessageStreamResponse) — Anthropic Claude + OpenAI via Vercel AI Gateway
- **File uploads:** Vercel Blob
- **Translations:** Weglot
- **Maps:** Mapbox
- **Booking:** Palisis (currently mock data — real API call commented out)
- **Weather:** OpenWeatherMap
- **Proxy/middleware:** `proxy.ts` (Next.js 16 format, not `middleware.ts`)

## Auth

- **Site PIN gate:** `"3462"` — `components/site-password-gate.tsx` — localStorage (bypasses for `/admin` routes)
- **Admin auth:** JWT cookie `admin_session` — protected by `proxy.ts`
  - Login: `POST /api/admin/auth/login` — verifies email + bcrypt hash, issues JWT
  - Logout: `POST /api/admin/auth/logout` — clears cookie
  - Session: `GET /api/admin/auth/me` — validates token, returns user
  - Login page: `/admin/login`
- **Credentials:** `admin@sightseeing.lu` / `Admin1234!`
- **Admin UUID:** `4102ea5d-fd01-4182-b08b-c751d663cd21`

## Database (PostgreSQL)

All 16 tables created and seeded. Data persists across restarts.

| Table | Rows | Description |
|---|---|---|
| admin_users | 1 | Back-office users with bcrypt passwords |
| trips | 43 | Sightseeing experiences |
| palisis_sync_log | 0 | Palisis API sync history |
| blog_posts | 2 | Published blog articles |
| jobs | 3 | Open job listings |
| job_applications | 0 | Career form submissions |
| help_articles | 17 | FAQ / help articles |
| support_tickets | 0 | Customer support tickets |
| ticket_replies | 0 | Replies to tickets |
| taxonomies | 0 | Trip categories/tags |
| pages | 10 | System pages (CMS) |
| page_revisions | 0 | Page version history |
| page_content | 0 | Page block content |
| ai_system_configs | 3 | AI system prompts + model settings |
| integrations | 8 | API keys store (Mapbox, Anthropic, etc.) |
| header_footer_blocks | 5 | Custom HTML injection |

### DB Files
- `lib/db.ts` — Pool singleton + `query()` / `queryOne()` helpers
- `lib/db/queries.ts` — All CRUD query functions replacing `admin-store.ts`
- `scripts/seed-db.mjs` — Seed script (run with `node scripts/seed-db.mjs`)

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
| Taxonomies | `/admin/taxonomies` |
| Pages | `/admin/pages` |
| Integrations | `/admin/integrations`, `/admin/integrations/weglot` |
| Header/Footer | `/admin/header-footer` |
| AI Systems | `/admin/ai-systems`, `/admin/ai-systems/[system]` |
| Palisis | `/admin/palisis` |
| DB Tracker | `/admin/implementation` |

## API Routes

All admin API routes are now DB-backed. Auth required (JWT cookie).

| Route | Method | Description |
|---|---|---|
| `/api/admin/auth/login` | POST | Login (public) |
| `/api/admin/auth/logout` | POST | Logout (public) |
| `/api/admin/auth/me` | GET | Current session |
| `/api/admin/dashboard` | GET | DB stats |
| `/api/admin/trips` | GET, POST | List / create trips |
| `/api/admin/trips/[id]` | GET, PATCH, DELETE | Trip CRUD |
| `/api/admin/posts` | GET, POST | Blog posts |
| `/api/admin/posts/[id]` | GET, PATCH, DELETE | Post CRUD |
| `/api/admin/jobs` | GET, POST | Job listings |
| `/api/admin/jobs/[id]` | GET, PATCH, DELETE | Job CRUD |
| `/api/admin/applications` | GET, PATCH, DELETE | Job applications |
| `/api/admin/help` | GET, POST | Help articles |
| `/api/admin/help/[id]` | GET, PATCH, DELETE | Help article CRUD |
| `/api/admin/tickets` | GET, POST | Support tickets |
| `/api/admin/tickets/[id]` | GET, PATCH, DELETE | Ticket CRUD |
| `/api/admin/tickets/[id]/replies` | POST | Add reply |
| `/api/admin/settings` | GET, PATCH | Integrations + AI settings |
| `/api/admin/planner-behavior` | GET, PUT | Planner AI behavior |
| `/api/admin/impl-check` | GET | DB row count health check |

## Documentation Files
| File | Contents |
|---|---|
| `docs/database-architecture.md` | 16-table PostgreSQL schema |
| `docs/api-reference.md` | Complete API reference — all routes |

## Known Remaining Issues
1. **Departures module** — `app/api/admin/departures/route.tsx` still uses in-memory store (no departures table in schema)
2. **Taxonomies save** — `handleSave()` stub, no API call
3. **Pages module** — No CRUD API, `?admin_edit=1` inline edits not persisted
4. **Palisis mock data** — Real API import call commented out
5. **Mapbox token** — `/api/mapbox-token` is a public unauthenticated endpoint
