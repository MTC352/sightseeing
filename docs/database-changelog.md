# sightseeing.lu — Database Architecture Changelog

> **How to use this file**
> - This file is **append-only**. Never delete or edit existing entries.
> - Every time the database schema changes (new table, column added/removed/renamed, index added, constraint changed), append a new entry at the **bottom** of this file.
> - Follow the entry format shown in v1.0.0 below.
> - Reference the corresponding `docs/database-architecture.md` section that was updated.
> - Entry format:
>
> ```
> ---
> ## vX.Y.Z — YYYY-MM-DD
> ### Summary
> One-line description of the change.
> ### Changes
> - **NEW TABLE** `table_name` — reason
> - **NEW COLUMN** `table_name.column_name` (type) — reason
> - **RENAMED COLUMN** `table_name.old_name` → `new_name` — reason
> - **DROPPED COLUMN** `table_name.column_name` — reason
> - **NEW INDEX** `index_name` on `table_name(col)` — reason
> - **DROPPED INDEX** `index_name` — reason
> - **CONSTRAINT CHANGE** description — reason
> - **SEED DATA** description — reason
> ### Migration SQL
> ```sql
> -- paste the exact SQL run against the database
> ```
> ### Notes
> Any caveats, rollback instructions, or follow-up tasks.
> ```

---

## v1.0.0 — 2026-04-23

### Summary

Initial database schema design. No database created yet — this entry documents the full intended schema derived from code analysis of the in-memory store (`lib/admin-store.ts`, `lib/page-content-store.ts`, `lib/data.ts`) and all admin panel pages.

### Changes

- **NEW TABLE** `admin_users` — replaces hardcoded PIN gate; supports email + bcrypt login with `superadmin` / `editor` roles
- **NEW TABLE** `trips` — display metadata synced from Palisis; includes `title_override` / `description_override` so admin edits are non-destructive; availability and booking NOT stored
- **NEW TABLE** `palisis_sync_log` — append-only audit trail for manual imports and webhook pushes
- **NEW TABLE** `blog_posts` — markdown blog articles with SEO fields and publish/draft status
- **NEW TABLE** `jobs` — job listings managed from `/admin/jobs`
- **NEW TABLE** `job_applications` — submitted by public visitors on `/careers`; no user account required
- **NEW TABLE** `help_articles` — FAQ knowledge base for `/help` page and Help AI assistant
- **NEW TABLE** `support_tickets` — internal support ticketing accessible from `/admin/tickets`
- **NEW TABLE** `ticket_replies` — thread replies on support tickets
- **NEW TABLE** `taxonomies` — key/value site copy (hero text, category descriptions, FAQs)
- **NEW TABLE** `pages` — admin-managed pages with flexible JSONB content blocks; supports system pages (built-in) and custom pages added by admin; `is_system_page` flag distinguishes them
- **NEW TABLE** `page_revisions` — append-only revision history; every save of a page inserts a new row; admins can restore any prior revision; rows are immutable
- **NEW TABLE** `page_content` — granular inline text edits made via hover-to-edit `?admin_edit=1` interface; keyed by `(page_slug, element_id)`
- **NEW TABLE** `ai_system_configs` — per-AI-use-case settings (prompt, model, temperature, max_tokens); `extra_config` JSONB holds planner behavior settings
- **NEW TABLE** `integrations` — API keys for OpenWeather, Mapbox, Anthropic, OpenAI, Palisis, Weglot, Google; values encrypted at rest
- **NEW TABLE** `header_footer_blocks` — named HTML injection blocks (analytics, cookie consent, chat widget, etc.) with enable/disable toggle

### Design Decisions

| Decision | Rationale |
|---|---|
| No frontend user accounts | Visitors book via Palisis iframe; no auth needed on our platform |
| Cookie-based cart | `sightseeing_cart` cookie (7-day, max 3.8 KB) — simple, no server state |
| Palisis owns booking/availability | We never store timeslots, bookings, or payments; Palisis handles confirmation emails |
| `title_override` / `description_override` on trips | Admin can customise display copy without losing the original Palisis data; webhook syncs never overwrite overrides |
| `page_revisions` is append-only | Full audit trail; any revision can be restored; no hard deletion |
| JSONB for page content | Flexible block/widget structure avoids schema migrations as the page builder evolves |
| JSONB `extra_config` on `ai_system_configs` | Planner-specific behavior settings don't pollute the shared schema |
| JSONB `meta` on `integrations` | Weglot has ~10 config fields; avoids a dedicated `weglot_config` table |
| Migration order matters | `admin_users` first; all other tables reference it via `created_by` / `updated_by` FKs |

### Migration SQL

```sql
-- No SQL executed yet. Database has not been created.
-- When ready, run tables in this order:
-- 1. admin_users
-- 2. trips
-- 3. palisis_sync_log
-- 4. blog_posts
-- 5. jobs
-- 6. job_applications
-- 7. help_articles
-- 8. support_tickets
-- 9. ticket_replies
-- 10. taxonomies
-- 11. pages
-- 12. page_revisions
-- 13. page_content
-- 14. ai_system_configs
-- 15. integrations
-- 16. header_footer_blocks
-- Full DDL is in docs/database-architecture.md Section 6.
```

### Notes

- Database creation will be triggered separately when instructed.
- Seed data to load on first run: 43 trips from `lib/data.ts`, 17 help articles, 2 blog posts, 3 job listings, 10 system pages, 3 AI config rows, 8 integration key slots, 5 header/footer blocks.
- All future schema changes — including during the database creation phase — must be appended to this file as new versioned entries.

---

<!-- APPEND NEW ENTRIES BELOW THIS LINE -->

---

## v1.1.0 — 2026-05-20

### Summary

Database provisioned and live in Replit PostgreSQL. All tables from the v1.0.0 design exist plus two additional tables (`departures`, `ai_prompt_revisions`) that were introduced during implementation. Initial content seeded via `scripts/seed-db.mjs` (5 tables) and admin UI activity. Framework version corrected to Next.js 16 in architecture docs.

### Changes

**Schema creation**
- **DATABASE CREATED** — Replit PostgreSQL instance provisioned; all tables created (schema creation is separate from the seed script)
- **NEW TABLE** `departures` — departure schedule rows for the `/departures` page; not in the v1.0.0 design; added during implementation (see `lib/db/queries.ts` for column definitions)
- **NEW TABLE** `ai_prompt_revisions` — append-only log of AI system prompt edits for rollback support; created automatically on first use via `ensureRevisionsTable()` in `lib/db/queries.ts`

**Seed data loaded via `scripts/seed-db.mjs`** (seeds 5 tables only)
- **SEED DATA** `admin_users` — 1 superadmin row (`admin@sightseeing.lu`, bcrypt 12-round hash for `Admin1234!`, role `superadmin`)
- **SEED DATA** `trips` — trip rows seeded from inline data in the script (Palisis catalog)
- **SEED DATA** `blog_posts` — 2 initial blog posts seeded
- **SEED DATA** `jobs` — 3 initial job listings seeded
- **SEED DATA** `help_articles` — 17 FAQ articles seeded across 5 categories (Booking, Payments, Cancellation, Accessibility, General)

**Other tables populated separately** (via admin UI or runtime application behaviour, not by seed-db.mjs)
- `pages` — 10 system pages (home, about, explore, search, planner, departures, blog, careers, help, checkout) with `is_system_page = TRUE`
- `ai_system_configs` — rows for `planner`, `chat`, `help` system keys (plus `itinerary` and `blog` added during implementation)
- `integrations` — initial 8 API key slots (openWeather, mapbox, anthropic, openai, palisis, weglot, googlePlaceId, googleReviews); additional runtime configuration keys are written by the application as needed (e.g. `palisis_auto_sync`, `departing_soon_*`, `lmd_*`)
- `header_footer_blocks` — 5 blocks (announcement_banner, head_scripts, chat_widget, analytics, cookie_consent); all disabled by default

**Documentation**
- **DOC UPDATE** `docs/database-architecture.md` — status updated from "Design only" to "Live"; Next.js version corrected from 14 to 16; Section 10 updated to reflect completed migration and accurate seed-db.mjs scope

### Migration SQL

```sql
-- Schema was created separately from the seed script (via Replit DB tooling or direct SQL).
-- To reseed initial content data into an existing schema, run:
--   node scripts/seed-db.mjs
-- This script seeds only: admin_users, trips, blog_posts, jobs, help_articles.
-- Other tables (pages, ai_system_configs, integrations, header_footer_blocks)
-- require the admin UI or separate SQL to populate initial rows.
```

### Notes

- `scripts/seed-db.mjs` does NOT create the database schema — it only inserts data into tables that already exist. Schema creation must be handled separately.
- The `integrations` table acts as a general key/value settings store beyond API keys; the app writes runtime configuration keys automatically, so the row count grows as features are used.
- All public-facing pages (`/blog`, `/careers`, `/explore`, `/departures`, `/trip/[id]`) read from the live database.
- The `help` page still uses hardcoded `FAQ_DATA` in `HelpClient` for AI chat complexity reasons — tracked as a known remaining item.
