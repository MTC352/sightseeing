# sightseeing.lu

> **Luxembourg's tourism discovery and booking platform** — AI-powered trip planning, live availability, and a full back-office admin panel.

---

## What Is This?

**sightseeing.lu** is a full-stack Next.js 16 web application for exploring and booking sightseeing experiences across Luxembourg. Visitors can discover trips, get personalised AI-generated itineraries, check live departure times, and book directly. Operators manage the entire catalogue, content, and integrations through a comprehensive admin panel.

---

## Live Features

### Public Site

| Feature | Description |
|---|---|
| **Homepage** | Hero, featured trips, live weather, last-minute deals, departing-soon rail |
| **Explore** | Browse and filter all 43 sightseeing experiences by tag, city, and duration |
| **Trip Detail** | Full trip page with live Palisis availability calendar and booking CTA |
| **AI Trip Planner** | Conversational planner at `/planner` — chat to build a full-day itinerary with live timeslots, conflict resolution, and a visual Trip Canvas |
| **Departures** | Live departure schedule pulled from the database |
| **Blog** | Published articles at `/blog` |
| **Careers** | Open job listings at `/careers` with application flow |
| **Help / FAQ** | AI-assisted FAQ at `/help` |
| **Sitemap** | Dynamic `/sitemap.xml` generated from DB trips for SEO |

### Admin Panel (`/admin`)

| Section | Path | Description |
|---|---|---|
| Dashboard | `/admin` | Live stats across all DB tables |
| Trips | `/admin/trips` | Full CRUD for all sightseeing experiences |
| Blog | `/admin/blog` | Create and edit published articles |
| Jobs | `/admin/jobs` | Manage open positions |
| Applications | `/admin/jobs/applications` | Review job submissions |
| Help & FAQ | `/admin/help` | Manage FAQ articles |
| Support Tickets | `/admin/tickets` | Read and reply to customer tickets |
| Taxonomies | `/admin/taxonomies` | Trip category and tag management |
| Pages | `/admin/pages` | CMS for static pages |
| Integrations | `/admin/integrations` | Store and validate third-party API keys |
| Header / Footer | `/admin/header-footer` | Custom HTML injection blocks |
| AI Systems | `/admin/ai-systems` | Manage AI prompts and model settings |
| Palisis Sync | `/admin/palisis` | Manual and automatic TourCMS sync |
| DB Tracker | `/admin/implementation` | Live database health check |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack) + TypeScript |
| **Package manager** | pnpm |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT (`jose`) + bcrypt — HttpOnly cookie `admin_session`, 8 h TTL |
| **AI** | Vercel AI SDK — Anthropic Claude + OpenAI via Vercel AI Gateway |
| **Maps** | Mapbox GL JS |
| **Booking** | TourCMS / Palisis — custom HMAC-SHA256 client |
| **Weather** | OpenWeatherMap |
| **Translations** | Weglot |
| **File uploads** | Vercel Blob |
| **State management** | Redux Toolkit + RTK Query (two isolated stores: admin + site) |
| **Middleware** | `proxy.ts` (Next.js 16 format) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL 16

### Local Development

```bash
# Install dependencies
pnpm install

# Seed the database (first run)
node scripts/seed-db.mjs

# Start the dev server on port 5000
pnpm dev
```

Open `http://localhost:5000`.

**Site PIN gate:** `3462` (stored in localStorage — bypassed for `/admin` routes).

### Production Build

```bash
pnpm build
pnpm start
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key (Claude / OpenAI) |
| `ANTHROPIC_API_KEY` | Anthropic direct key (fallback) |
| `TOURCMS_API_KEY` | Palisis / TourCMS API key |
| `TOURCMS_CHANNEL_ID` | TourCMS channel ID |
| `TOURCMS_MARKETPLACE_ID` | TourCMS marketplace ID |
| `MAPBOX_ACCESS_TOKEN` | Mapbox public token |
| `OPENWEATHER_API_KEY` | OpenWeatherMap key |
| `NEXT_PUBLIC_WEGLOT_API_KEY` | Weglot translation key |

---

## Database Schema

16 PostgreSQL tables — all seeded and persisted.

| Table | Description |
|---|---|
| `admin_users` | Back-office users with bcrypt passwords |
| `trips` | 43 sightseeing experiences synced from Palisis |
| `trip_tags` | 36-tag canonical catalog (drives planner, filters, homepage) |
| `palisis_sync_log` | TourCMS sync history |
| `blog_posts` | Published articles |
| `jobs` | Open job listings |
| `job_applications` | Career form submissions |
| `help_articles` | 17 FAQ articles |
| `support_tickets` | Customer support tickets |
| `ticket_replies` | Replies to tickets |
| `taxonomies` | Legacy key-value site copy store |
| `pages` | CMS pages |
| `page_revisions` | Page version history |
| `page_content` | Page block content |
| `ai_system_configs` | AI system prompts + model settings |
| `integrations` | API key store (Mapbox, Anthropic, Palisis, etc.) |
| `header_footer_blocks` | Custom HTML injection |

**Key files:**
- `lib/db.ts` — Pool singleton + `query()` / `queryOne()` helpers
- `lib/db/queries.ts` — All CRUD query functions
- `scripts/seed-db.mjs` — Re-runnable seed script

---

## API Reference

### Auth (public)

| Route | Method | Description |
|---|---|---|
| `/api/admin/auth/login` | POST | Verify credentials, issue JWT |
| `/api/admin/auth/logout` | POST | Clear session cookie |
| `/api/admin/auth/me` | GET | Validate session, return user |

### Admin (JWT required)

| Route | Methods | Description |
|---|---|---|
| `/api/admin/trips` | GET, POST | List / create trips |
| `/api/admin/trips/[id]` | GET, PATCH, DELETE | Trip CRUD |
| `/api/admin/posts` | GET, POST | Blog posts |
| `/api/admin/posts/[id]` | GET, PATCH, DELETE | Post CRUD |
| `/api/admin/jobs` | GET, POST | Job listings |
| `/api/admin/jobs/[id]` | GET, PATCH, DELETE | Job CRUD |
| `/api/admin/applications` | GET, PATCH, DELETE | Job applications |
| `/api/admin/help` | GET, POST | FAQ articles |
| `/api/admin/help/[id]` | GET, PATCH, DELETE | Article CRUD |
| `/api/admin/tickets` | GET, POST | Support tickets |
| `/api/admin/tickets/[id]` | GET, PATCH, DELETE | Ticket CRUD |
| `/api/admin/tickets/[id]/replies` | POST | Add reply |
| `/api/admin/taxonomies` | GET, POST, PATCH | Taxonomy CRUD |
| `/api/admin/pages` | GET, POST | CMS pages |
| `/api/admin/pages/[id]` | GET, PATCH, DELETE | Single page |
| `/api/admin/departures` | GET, POST, PATCH | Departure schedule |
| `/api/admin/integrations` | GET, PATCH | API key store (upsert by key) |
| `/api/admin/settings` | GET, PATCH | Global settings |
| `/api/admin/palisis-import` | POST | Import Palisis catalog |
| `/api/admin/dashboard` | GET | Live DB stats |

### Public / Planner

| Route | Description |
|---|---|
| `/api/planner` | Streaming AI chat (Anthropic / OpenAI) |
| `/api/itinerary` | Preflight + AI itinerary build with live Palisis slots |
| `/api/trips` | Public trip listings |
| `/api/weather` | Current weather (OpenWeatherMap) |
| `/api/mapbox-token` | Serve Mapbox token to the client |
| `/api/departing-soon` | Upcoming departures widget |
| `/api/last-minute-deals` | Last-minute availability |
| `/api/webhooks/palisis` | Palisis booking webhooks |

---

## AI Trip Planner

The planner at `/planner` is a full conversational AI experience:

- **Chat** — powered by Anthropic Claude via Vercel AI SDK streaming
- **Trip Canvas** — visual itinerary panel with Mapbox route and numbered pins
- **Live availability** — preflight checks Palisis slots before building the itinerary
- **Conflict resolution** — auto-resolves overpacked days for full-day intent; presents options for other conflicts
- **Cart** — visitors save trips and the AI builds itineraries from them
- **Context-aware suggestions** — quick-reply chips adapt to the current conversation state
- **Input lock** — the chat input and suggestion chips are disabled while the AI is generating or the itinerary build is in flight, preventing premature follow-up messages

---

## Edit Mode

Admins can edit public-facing page text inline by visiting any page with `?admin_edit=1` appended to the URL. The amber "Edit Mode" banner appears **only** when a valid `admin_session` JWT cookie is present. Unauthenticated visitors have the parameter stripped automatically and the banner never renders.

---

## Palisis / TourCMS Integration

> **One-way sync only: Palisis → DB. Never DB → Palisis.**

- Trip data, prices, and descriptions flow **from** Palisis **into** the local database via `showTour` / `listTours`
- Admin trip edits write to the DB only — Palisis is the upstream source of truth
- Auto-sync is togglable at `/admin/palisis` (stored in `integrations.palisis_auto_sync`)
- Incoming webhooks at `/api/webhooks/palisis` are logged and skipped when auto-sync is off
- Booking creation (customer-initiated) is the only call that writes back to TourCMS

---

## Project Structure

```
app/
  admin/              Admin panel pages and layouts
  api/                All API route handlers
  planner/            AI Trip Planner page
  trip/[id]/          Individual trip detail pages
  blog/, careers/,    Other public pages
  help/, explore/ …

components/
  providers/          Redux + context providers
  ui/                 shadcn/ui base components
  edit-mode-provider  Auth-gated inline editing

lib/
  db.ts               PostgreSQL pool singleton
  db/queries.ts       All DB query functions
  tourcms.ts          Palisis HMAC-SHA256 client
  cart-context.tsx    Cart state (React context)

store/
  admin/              Admin Redux store + RTK Query API slice
  site/               Site Redux store + RTK Query API slice

scripts/              Database seed and maintenance scripts
docs/                 Architecture and API reference docs
public/               Static assets (images, robots.txt, widgets)
```

---

## Admin Credentials

```
URL:      /admin/login
Email:    admin@sightseeing.lu
Password: Admin1234!
```

---

## Documentation

| File | Contents |
|---|---|
| `docs/database-architecture.md` | Full 16-table PostgreSQL schema |
| `docs/api-reference.md` | Complete API reference for all routes |

---

## License

Private — © MTC Luxembourg. All rights reserved.
