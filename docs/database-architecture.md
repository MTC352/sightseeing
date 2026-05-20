# sightseeing.lu — Database Architecture

> **Status:** Live — all 16 tables created and seeded in Replit PostgreSQL.
> **Target:** PostgreSQL (Replit-hosted)
> **Last updated:** 2026-05-20
> **Changelog:** See [`database-changelog.md`](./database-changelog.md)

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Design Principles](#2-design-principles)
3. [What Lives in the Database](#3-what-lives-in-the-database)
4. [What Does NOT Live in the Database](#4-what-does-not-live-in-the-database)
5. [Authentication Model](#5-authentication-model)
6. [Table Definitions](#6-table-definitions)
   - [admin_users](#61-admin_users)
   - [trips](#62-trips)
   - [palisis_sync_log](#63-palisis_sync_log)
   - [blog_posts](#64-blog_posts)
   - [jobs](#65-jobs)
   - [job_applications](#66-job_applications)
   - [help_articles](#67-help_articles)
   - [support_tickets](#68-support_tickets)
   - [ticket_replies](#69-ticket_replies)
   - [taxonomies](#610-taxonomies)
   - [pages](#611-pages)
   - [page_revisions](#612-page_revisions)
   - [page_content](#613-page_content)
   - [ai_system_configs](#614-ai_system_configs)
   - [integrations](#615-integrations)
   - [header_footer_blocks](#616-header_footer_blocks)
7. [Entity Relationship Summary](#7-entity-relationship-summary)
8. [Palisis Sync Logic](#8-palisis-sync-logic)
9. [Cookie-Based Cart](#9-cookie-based-cart)
10. [Migration Notes](#10-migration-notes)

---

## 1. Platform Overview

**sightseeing.lu** is a Next.js 16 (App Router) tourism discovery and booking platform for Luxembourg. It has two surfaces:

| Surface | Auth | Data source |
|---|---|---|
| Public frontend (`/`, `/explore`, `/trip/[id]`, `/planner`, `/blog`, `/help`, `/careers`) | None — anonymous visitors | Database (read-only) + Palisis API (availability) |
| Admin panel (`/admin/*`) | PIN gate → upgrading to DB-backed auth | Database (read/write) |

**Booking** is handled entirely by **Palisis** (third-party). We store trip display data only. Availability, booking slots, payment, and confirmation emails are all managed by Palisis.

---

## 2. Design Principles

- **Palisis is the booking source of truth.** We store trip metadata for display purposes. Booking and availability are never stored in our DB.
- **Frontend users are anonymous.** No user accounts. The cart/triplist is stored in a browser cookie (`sightseeing_cart`, 7-day expiry).
- **Admin authentication is DB-backed.** Proper `admin_users` table with bcrypt-hashed passwords replaces the current hardcoded PIN.
- **Pages support full revision history.** Every admin save of a page creates an immutable `page_revisions` row. Restoring a revision copies it back as the live page row.
- **Settings use a structured multi-table approach.** API keys, AI configs, Weglot, and header/footer scripts are each in dedicated tables rather than one giant JSON blob.
- **Audit trail on all write operations.** All mutable tables carry `created_by` / `updated_by` foreign keys to `admin_users`.
- **JSONB for flexible content.** Page content blocks, palisis raw payloads, and integration metadata use JSONB to avoid excessive schema migrations as the product evolves.

---

## 3. What Lives in the Database

| Entity | Table(s) | Notes |
|---|---|---|
| Admin users | `admin_users` | Login credentials + roles |
| Trips | `trips` | Display data synced from Palisis |
| Palisis sync history | `palisis_sync_log` | Audit trail for imports/webhooks |
| Blog posts | `blog_posts` | Markdown body + SEO fields |
| Jobs | `jobs` | Open positions |
| Job applications | `job_applications` | Submitted by public visitors |
| Help/FAQ articles | `help_articles` | Knowledge base for help AI |
| Support tickets | `support_tickets` | Internal support system |
| Ticket replies | `ticket_replies` | Thread replies per ticket |
| Taxonomies | `taxonomies` | Site copy key/value pairs |
| Admin-managed pages | `pages` | Pages created/edited from admin |
| Page revision history | `page_revisions` | Append-only snapshot per save |
| Inline page content edits | `page_content` | Hover-to-edit text elements |
| AI system configs | `ai_system_configs` | Prompts, models, temperatures |
| Third-party API keys | `integrations` | Encrypted keys + service config |
| Header/footer blocks | `header_footer_blocks` | Injected HTML snippets |

---

## 4. What Does NOT Live in the Database

| Item | Where it lives | Reason |
|---|---|---|
| Trip availability / timeslots | Palisis API — live fetch | Booking stays on Palisis |
| Trip bookings & payments | Palisis platform | Palisis handles end-to-end |
| Confirmation emails to users | Palisis | Sent by Palisis after booking |
| Frontend user accounts | None (anonymous) | No login required for visitors |
| Cart / Triplist | Browser cookie (`sightseeing_cart`, 7 days, max 3.8 KB) | Lightweight, no auth needed |
| Weather data | OpenWeatherMap API — live | Real-time, not cacheable in DB |
| Google Reviews | Google Places API — live | External, not stored |
| Translation content | Weglot SaaS | Managed entirely by Weglot |

---

## 5. Authentication Model

| Aspect | Current (hardcoded PIN) | Target (DB-backed) |
|---|---|---|
| Frontend users | None | None — stays anonymous |
| Admin login | PIN `1234` in source code | Email + bcrypt password in `admin_users` |
| Session storage | `sessionStorage` (cleared on tab close) | HTTP-only cookie with signed JWT or server session |
| Roles | Single shared PIN | `superadmin` / `editor` per user |
| Audit trail | None | `updated_by` FK on every mutable table |
| Logout | Clear `sessionStorage` | Invalidate server session / clear cookie |

---

## 6. Table Definitions

---

### 6.1 `admin_users`

Replaces the current hardcoded PIN gate. Supports proper per-user login with roles.

```sql
CREATE TABLE admin_users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,                    -- bcrypt, min 12 rounds
  role          TEXT        NOT NULL DEFAULT 'editor',   -- 'superadmin' | 'editor'
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**When created/updated:**
- On first admin setup (seed one superadmin row)
- When a superadmin creates/deactivates another admin user
- `last_login` updated on every successful login
- `updated_at` updated on every write via trigger

---

### 6.2 `trips`

Core content table. Stores display metadata synced from Palisis. Admins can override `title` and `description` locally without affecting the Palisis platform. Booking and availability are never stored here.

```sql
CREATE TABLE trips (
  id                   TEXT        PRIMARY KEY,           -- Palisis trip ID (e.g. "31898")
  palisis_id           TEXT        NOT NULL UNIQUE,       -- explicit Palisis reference
  title                TEXT        NOT NULL,              -- synced from Palisis
  title_override       TEXT,                             -- set by admin; shown in place of title
  description          TEXT,                             -- synced from Palisis
  description_override TEXT,                             -- set by admin; shown in place of description
  price                NUMERIC(8,2) NOT NULL DEFAULT 0,
  original_price       NUMERIC(8,2),
  duration             TEXT,
  category             TEXT        NOT NULL,
  tags                 TEXT[]      NOT NULL DEFAULT '{}',
  city                 TEXT        NOT NULL DEFAULT 'Luxembourg',
  provider             TEXT,
  image                TEXT,                             -- local /public path or blob URL
  gallery              TEXT[],                           -- additional image URLs
  highlights           TEXT[],
  badge                TEXT,                             -- e.g. "Free", "Popular"
  rating               NUMERIC(3,2) DEFAULT 0,
  review_count         INT          DEFAULT 0,
  permalink            TEXT,                             -- sightseeing.lu direct booking URL
  google_business_url  TEXT,
  featured             BOOLEAN     NOT NULL DEFAULT FALSE,
  featured_departure   BOOLEAN     NOT NULL DEFAULT FALSE,
  status               TEXT        NOT NULL DEFAULT 'draft',  -- 'published' | 'draft'
  palisis_raw          JSONB,                            -- raw Palisis API payload snapshot
  last_synced_at       TIMESTAMPTZ,
  sync_source          TEXT,                             -- 'manual' | 'webhook' | 'bulk'
  created_by           UUID        REFERENCES admin_users(id),
  updated_by           UUID        REFERENCES admin_users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trips_status_idx      ON trips(status);
CREATE INDEX trips_category_idx    ON trips(category);
CREATE INDEX trips_featured_idx    ON trips(featured);
CREATE INDEX trips_palisis_id_idx  ON trips(palisis_id);
```

**Display logic:** The app renders `title_override ?? title` and `description_override ?? description`. This way admin edits are non-destructive — the original Palisis data is always preserved in `title` / `description`.

**When updated:**
- On manual Palisis import (single trip with diff confirmation, or bulk with override checkbox)
- On Palisis webhook push — auto-override base fields, preserve `*_override` values
- When admin edits fields in `/admin/trips/[id]`
- `updated_at` / `updated_by` updated on every write

---

### 6.3 `palisis_sync_log`

Append-only audit trail for all Palisis import and webhook operations.

```sql
CREATE TABLE palisis_sync_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type  TEXT        NOT NULL,   -- 'manual_single' | 'manual_bulk' | 'webhook'
  palisis_id    TEXT,                   -- NULL for bulk imports (covers many trips)
  action        TEXT        NOT NULL,   -- 'created' | 'updated' | 'skipped' | 'error'
  changes       JSONB,                  -- field-level diff: { field: [old, new] }
  triggered_by  UUID        REFERENCES admin_users(id),  -- NULL for webhook
  note          TEXT,                   -- human-readable summary or error message
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX palisis_sync_log_palisis_id_idx ON palisis_sync_log(palisis_id);
CREATE INDEX palisis_sync_log_created_at_idx ON palisis_sync_log(created_at DESC);
```

**When created:** Every time a sync operation runs — manual or webhook. This table is never updated; rows are only inserted.

---

### 6.4 `blog_posts`

```sql
CREATE TABLE blog_posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL UNIQUE,
  title           TEXT        NOT NULL,
  excerpt         TEXT,
  body            TEXT,                          -- markdown
  image           TEXT,
  author          TEXT,
  category        TEXT,
  tags            TEXT[]      DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
  published_at    TIMESTAMPTZ,
  read_time       TEXT,                          -- e.g. "6 min read"
  seo_title       TEXT,
  seo_description TEXT,
  created_by      UUID        REFERENCES admin_users(id),
  updated_by      UUID        REFERENCES admin_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX blog_posts_status_idx     ON blog_posts(status);
CREATE INDEX blog_posts_published_idx  ON blog_posts(published_at DESC) WHERE status = 'published';
```

**When updated:** When admin creates, edits, publishes, or deletes a post from `/admin/blog`.

---

### 6.5 `jobs`

```sql
CREATE TABLE jobs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  department   TEXT,
  location     TEXT,
  type         TEXT,                            -- 'Full-time' | 'Part-time' | 'Freelance'
  description  TEXT,
  requirements TEXT[]      DEFAULT '{}',
  status       TEXT        NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  created_by   UUID        REFERENCES admin_users(id),
  updated_by   UUID        REFERENCES admin_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX jobs_status_idx ON jobs(status);
```

**When updated:** When admin creates, edits, or closes a listing from `/admin/jobs`.

---

### 6.6 `job_applications`

Submitted by public visitors on `/careers`. No user account required.

```sql
CREATE TABLE job_applications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  phone         TEXT,
  cover_letter  TEXT,
  resume_url    TEXT,
  portfolio_url TEXT,
  linkedin_url  TEXT,
  attachments   JSONB       DEFAULT '[]',  -- [{ name: string, url: string }]
  status        TEXT        NOT NULL DEFAULT 'new',
                                           -- 'new' | 'reviewing' | 'shortlisted' | 'rejected' | 'hired'
  notes         TEXT,                      -- internal admin notes
  updated_by    UUID        REFERENCES admin_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX job_applications_job_id_idx ON job_applications(job_id);
CREATE INDEX job_applications_status_idx ON job_applications(status);
```

**When updated:**
- Row inserted when a visitor submits the careers form
- `status` and `notes` updated by admin in `/admin/jobs/applications`

---

### 6.7 `help_articles`

FAQ articles displayed on `/help`. Also used as the knowledge base for the Help AI chat assistant.

```sql
CREATE TABLE help_articles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question   TEXT        NOT NULL,
  answer     TEXT        NOT NULL,
  category   TEXT        NOT NULL,  -- 'Booking' | 'Payments' | 'Cancellation' | 'Accessibility' | 'General'
  status     TEXT        NOT NULL DEFAULT 'published',  -- 'published' | 'draft'
  sort_order INT         NOT NULL DEFAULT 0,
  created_by UUID        REFERENCES admin_users(id),
  updated_by UUID        REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX help_articles_status_idx   ON help_articles(status);
CREATE INDEX help_articles_category_idx ON help_articles(category);
CREATE INDEX help_articles_order_idx    ON help_articles(category, sort_order);
```

**When updated:** When admin creates, edits, reorders, or removes FAQ entries from `/admin/help`. The Help AI reads all `status = 'published'` rows as its contextual knowledge base on every request.

---

### 6.8 `support_tickets`

Internal support ticketing system accessible from `/admin/tickets`.

```sql
CREATE TABLE support_tickets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject      TEXT        NOT NULL,
  description  TEXT,
  category     TEXT,                   -- 'bug' | 'feature' | 'question' | 'billing' | 'other'
  priority     TEXT        DEFAULT 'medium',   -- 'low' | 'medium' | 'high' | 'urgent'
  status       TEXT        NOT NULL DEFAULT 'open',
                                       -- 'open' | 'in-progress' | 'waiting' | 'resolved' | 'closed'
  author_name  TEXT        NOT NULL,
  author_email TEXT        NOT NULL,
  author_role  TEXT        DEFAULT 'user',     -- 'user' | 'admin' | 'superadmin'
  assigned_to  UUID        REFERENCES admin_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX support_tickets_status_idx   ON support_tickets(status);
CREATE INDEX support_tickets_priority_idx ON support_tickets(priority);
```

**When updated:** On ticket creation; when admin updates status, priority, or assignment.

---

### 6.9 `ticket_replies`

Thread replies attached to a support ticket.

```sql
CREATE TABLE ticket_replies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id   UUID        REFERENCES admin_users(id),   -- NULL if external user
  author_name TEXT        NOT NULL,
  author_role TEXT        NOT NULL DEFAULT 'user',       -- 'user' | 'admin' | 'superadmin'
  message     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ticket_replies_ticket_id_idx ON ticket_replies(ticket_id);
```

**When created:** On every reply, whether from admin or external user. Never updated — replies are immutable.

---

### 6.10 `taxonomies`

Key/value store for editable site copy — hero text, category descriptions, FAQ blurbs, taglines. Managed from `/admin/taxonomies`.

```sql
CREATE TABLE taxonomies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT        NOT NULL UNIQUE,  -- e.g. 'hero_title', 'cat_food_events', 'faq_cancellation'
  label      TEXT        NOT NULL,          -- human-readable label shown in admin
  value      TEXT        NOT NULL DEFAULT '',
  group_key  TEXT,                          -- derived prefix: 'hero' | 'cat' | 'faq' | 'about'
  updated_by UUID        REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX taxonomies_group_key_idx ON taxonomies(group_key);
```

**When updated:** When admin edits any key/value pair in `/admin/taxonomies` and saves.

---

### 6.11 `pages`

Admin-managed pages — created, edited, and published from `/admin/pages`. Supports custom slugs so new pages can be added beyond the built-in set. Content is stored as JSONB for flexible block/widget structure.

```sql
CREATE TABLE pages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL UNIQUE,   -- URL path segment, e.g. 'home', 'about', 'private-tours'
  title           TEXT        NOT NULL,
  description     TEXT,                          -- internal description for admin reference
  url             TEXT        NOT NULL,           -- full path, e.g. '/', '/about', '/experiences/private-tours'
  content         JSONB       NOT NULL DEFAULT '{}',
                                                 -- flexible block structure:
                                                 -- { blocks: [{ type, id, data }], meta: { seoTitle, seoDescription, ... } }
  status          TEXT        NOT NULL DEFAULT 'draft',  -- 'published' | 'draft'
  is_system_page  BOOLEAN     NOT NULL DEFAULT FALSE,    -- TRUE for built-in pages (home, about, etc.)
                                                         -- FALSE for pages added by admin
  seo_title       TEXT,
  seo_description TEXT,
  og_image        TEXT,
  template        TEXT        DEFAULT 'default', -- reserved for future widget/template system
  created_by      UUID        REFERENCES admin_users(id),
  updated_by      UUID        REFERENCES admin_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX pages_slug_idx   ON pages(slug);
CREATE INDEX pages_status_idx ON pages(status);
CREATE INDEX pages_url_idx    ON pages(url);
```

**When updated:**
- Row inserted when admin creates a new page or when initial system pages are seeded
- Row updated when admin saves edits in `/admin/pages/[slug]` or via inline `?admin_edit=1`
- Every save also writes a new `page_revisions` row (see below)
- `updated_at` / `updated_by` updated on every write

**System pages (seeded on first run):**

| slug | url | is_system_page |
|---|---|---|
| home | / | true |
| about | /about | true |
| explore | /explore | true |
| search | /search | true |
| planner | /planner | true |
| departures | /departures | true |
| blog | /blog | true |
| careers | /careers | true |
| help | /help | true |
| checkout | /checkout | true |

---

### 6.12 `page_revisions`

Append-only revision history for every page. A new row is inserted every time a page is saved — the `pages` table stores the live version, `page_revisions` stores every past version. Admins can view the history and restore any revision by copying it back to `pages`.

```sql
CREATE TABLE page_revisions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         UUID        NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  revision_number INT         NOT NULL,          -- auto-incremented per page (1, 2, 3, ...)
  title           TEXT        NOT NULL,           -- snapshot of title at save time
  content         JSONB       NOT NULL,           -- full content snapshot (same structure as pages.content)
  status          TEXT        NOT NULL,           -- snapshot of status at save time
  seo_title       TEXT,
  seo_description TEXT,
  og_image        TEXT,
  label           TEXT,                           -- 'Auto-save' | 'Manual save' | admin-provided label
  created_by      UUID        REFERENCES admin_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (page_id, revision_number)
);

CREATE INDEX page_revisions_page_id_idx ON page_revisions(page_id);
CREATE INDEX page_revisions_created_at_idx ON page_revisions(page_id, created_at DESC);
```

**Revision number assignment:** Use a per-page sequence or `SELECT MAX(revision_number) + 1 FROM page_revisions WHERE page_id = $1` inside a transaction.

**Restore flow:**
1. Admin selects a revision from the history panel
2. API copies the revision's `title`, `content`, `status`, `seo_*` fields back into the `pages` row
3. A new `page_revisions` row is inserted with `label = 'Restored from revision #N'`
4. The old revision rows are never deleted

**Retention:** No automatic pruning in v1. Future versions may cap at 50 revisions per page.

**When created:** Every time `/api/admin/pages/[id]` receives a PATCH or PUT request. Never updated — revisions are immutable.

---

### 6.13 `page_content`

Stores granular inline text edits made via the hover-to-edit admin interface (`?admin_edit=1`). Each row is a single editable text element on a specific page.

```sql
CREATE TABLE page_content (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug  TEXT        NOT NULL,   -- e.g. 'home', 'explore'
  element_id TEXT        NOT NULL,   -- element key within the page, e.g. 'hero_title'
  content    TEXT        NOT NULL,
  updated_by UUID        REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (page_slug, element_id)
);

CREATE INDEX page_content_page_slug_idx ON page_content(page_slug);
```

**Relationship to `pages`:** `page_content` handles fine-grained text edits on existing React-rendered pages. `pages` handles full admin-created pages with block content. They serve different parts of the admin editing workflow.

**When updated:** When admin hovers and edits an inline-editable text element on a managed page and clicks "Save all".

---

### 6.14 `ai_system_configs`

Stores per-AI-use-case settings managed from `/admin/ai-systems`. Three built-in systems: `planner`, `chat`, `help`.

```sql
CREATE TABLE ai_system_configs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  system_key    TEXT        NOT NULL UNIQUE,   -- 'planner' | 'chat' | 'help'
  label         TEXT        NOT NULL,
  description   TEXT,
  system_prompt TEXT,
  model         TEXT        NOT NULL DEFAULT 'anthropic/claude-opus-4.6',
  temperature   NUMERIC(3,2) DEFAULT 0.7,
  max_tokens    INT          DEFAULT 2048,
  extra_config  JSONB        DEFAULT '{}',
                                              -- used for planner behavior settings:
                                              -- optimization_priority, preference_weighting,
                                              -- suggestion_randomness, local_favorites_bias,
                                              -- buffer_time_between_stops, max_stops_per_day,
                                              -- default_activity_duration, day_start_time,
                                              -- day_end_time, auto_insert_meal_breaks,
                                              -- lunch_break_time, dinner_break_time,
                                              -- meal_break_duration, travel_time_method
  updated_by    UUID        REFERENCES admin_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Seed rows on first run:**

| system_key | label | model | temperature | max_tokens |
|---|---|---|---|---|
| planner | Trip Planner | anthropic/claude-opus-4.6 | 0.7 | 2048 |
| chat | Trip Chat | anthropic/claude-opus-4.6 | 0.5 | 1024 |
| help | Help & FAQ Chat | anthropic/claude-opus-4.6 | 0.3 | 1024 |

**When updated:** When admin edits prompt, model, temperature, max tokens, or planner behavior settings from `/admin/ai-systems/[system]`.

---

### 6.15 `integrations`

Stores API keys and third-party service configuration. Values should be encrypted at rest (e.g. using `pgcrypto` or application-layer encryption before insert).

```sql
CREATE TABLE integrations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT        NOT NULL UNIQUE,
             -- 'openWeather' | 'mapbox' | 'anthropic' | 'openai'
             -- 'palisis' | 'weglot' | 'googlePlaceId' | 'googleReviews'
  label      TEXT        NOT NULL,
  value      TEXT,                     -- encrypted API key value
  meta       JSONB        DEFAULT '{}',
             -- used for extended config per service, e.g. Weglot:
             -- { originalLang, destinationLangs, showFlags, withName,
             --   buttonPosition, excludedUrls, excludedBlocks,
             --   autoRedirect, trackPageViews, overrideCss, flagStyle }
  updated_by UUID        REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Seed rows on first run (values empty, filled by admin):**

| key | label |
|---|---|
| openWeather | OpenWeatherMap API Key |
| mapbox | Mapbox Public Token |
| anthropic | Anthropic API Key |
| openai | OpenAI API Key |
| palisis | Palisis API Key |
| weglot | Weglot API Key |
| googlePlaceId | Google Place ID |
| googleReviews | Google Reviews API Key |

**When updated:** When admin saves keys or extended config in `/admin/integrations`.

---

### 6.16 `header_footer_blocks`

Named HTML injection blocks managed from `/admin/header-footer`. Each block can be enabled/disabled independently.

```sql
CREATE TABLE header_footer_blocks (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL UNIQUE,
             -- 'announcement_banner' | 'head_scripts' | 'chat_widget' | 'analytics' | 'cookie_consent'
  label      TEXT        NOT NULL,
  placement  TEXT        NOT NULL,    -- 'head' | 'body_start' | 'body_end'
  html       TEXT,                    -- raw HTML / script content
  enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_by UUID        REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Seed rows on first run:**

| name | label | placement | enabled |
|---|---|---|---|
| announcement_banner | Announcement Banner | body_start | false |
| head_scripts | Head Scripts | head | false |
| chat_widget | Chat Widget | body_end | false |
| analytics | Analytics | head | false |
| cookie_consent | Cookie Consent | body_end | false |

**When updated:** When admin enables/disables or edits a block in `/admin/header-footer`.

---

## 7. Entity Relationship Summary

```
admin_users
  ├── trips                   (created_by, updated_by)
  ├── palisis_sync_log        (triggered_by)
  ├── blog_posts              (created_by, updated_by)
  ├── jobs                    (created_by, updated_by)
  ├── job_applications        (updated_by)
  ├── help_articles           (created_by, updated_by)
  ├── support_tickets         (assigned_to)
  ├── ticket_replies          (author_id)
  ├── taxonomies              (updated_by)
  ├── pages                   (created_by, updated_by)
  ├── page_revisions          (created_by)
  ├── page_content            (updated_by)
  ├── ai_system_configs       (updated_by)
  ├── integrations            (updated_by)
  └── header_footer_blocks    (updated_by)

trips
  └── palisis_sync_log        (palisis_id — not a FK, soft reference)

jobs
  └── job_applications        (job_id → FK with CASCADE DELETE)

support_tickets
  └── ticket_replies          (ticket_id → FK with CASCADE DELETE)

pages
  ├── page_revisions          (page_id → FK with CASCADE DELETE)
  └── page_content            (page_slug — soft reference by slug, not FK)
```

---

## 8. Palisis Sync Logic

### Manual Import — Single Trip

1. Admin navigates to `/admin/palisis` and selects a specific trip
2. System fetches that trip from Palisis API using stored `palisis` key from `integrations`
3. If trip already exists in `trips` → compare `title` and `description` fields
4. If changed → show diff modal asking admin to confirm override per field
5. Admin confirms → update `trips`, insert row in `palisis_sync_log` with `trigger_type = 'manual_single'` and `changes` JSONB diff
6. `title_override` / `description_override` set by admin are never overwritten by sync

### Manual Import — Bulk

1. Admin opens `/admin/palisis` and clicks "Bulk Import"
2. System fetches full Palisis catalog
3. Table shows each trip with a "Changed" badge where title/description differ from stored
4. Global **"Override all"** checkbox at top; individual row checkboxes also available
5. Admin submits → system upserts all selected trips
6. Row inserted in `palisis_sync_log` with `trigger_type = 'manual_bulk'`

### Webhook Sync (Palisis → Platform)

1. Palisis POSTs to `/api/webhooks/palisis` when a trip is updated
2. No admin confirmation required — auto-override base fields in `trips`
3. `title_override` / `description_override` are **preserved** (never overwritten by webhook)
4. Row inserted in `palisis_sync_log` with `trigger_type = 'webhook'`, `triggered_by = NULL`

---

## 9. Cookie-Based Cart

The frontend cart is stored entirely in the browser — no database involvement.

| Property | Value |
|---|---|
| Cookie name | `sightseeing_cart` |
| Expiry | 7 days |
| Max size | 3.8 KB (enforced in code to stay under 4096-byte limit) |
| Format | `[{ id: string, qty: number }]` — JSON, URL-encoded |
| Hydration | Client-side only, after mount (avoids SSR mismatch) |
| Items resolved | Trip objects looked up from the in-memory store / DB at hydration time |

---

## 10. Migration Notes

> **Status as of 2026-05-20:** The database is live in Replit PostgreSQL. All tables from this document exist plus two additional tables added during implementation — `departures` and `ai_prompt_revisions` — which are not yet fully documented in this file (see changelog v1.1.0).

### Table creation order (for re-creation in a new environment)

Create in this order to respect foreign key dependencies:

```
1. admin_users
2. trips
3. palisis_sync_log
4. blog_posts
5. jobs
6. job_applications
7. help_articles
8. support_tickets
9. ticket_replies
10. taxonomies
11. pages
12. page_revisions
13. page_content
14. ai_system_configs
15. integrations
16. header_footer_blocks
17. departures
18. ai_prompt_revisions  (auto-created at runtime by ensureRevisionsTable())
```

### Seeding

`scripts/seed-db.mjs` seeds **5 tables only**: `admin_users`, `trips`, `blog_posts`, `jobs`, `help_articles`. It does **not** create the schema and does **not** seed the remaining tables.

Other tables are populated via:
- **Admin UI** — `pages` (system pages), `ai_system_configs` (AI system rows), `header_footer_blocks`
- **Runtime application behaviour** — `integrations` (keys are upserted by the app as features are used), `ai_prompt_revisions` (created on first prompt edit)

### Future schema changes

For every schema change, append a new versioned entry to `docs/database-changelog.md` and run the migration SQL against the live database before deploying code that depends on the new schema.
