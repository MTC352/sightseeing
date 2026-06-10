# sightseeing.lu — API Reference

> **Generated:** 2026-04-24
> **Base URL (dev):** `http://localhost:5000` · **Base URL (prod):** `https://sightseeing.lu`
> **Format:** All requests and responses are JSON unless marked `multipart/form-data`.
> **Auth:** Admin routes currently have no auth. The target is `HttpOnly` JWT cookie (`admin_session`) set at login. See [Authentication](#authentication).

---

## Table of Contents

### Admin Panel APIs
1. [Authentication](#1-authentication) — `NEW - not yet built`
2. [Dashboard](#2-dashboard) — `NEW - not yet built`
3. [Trips](#3-trips) — `EXISTS`
4. [Blog Posts](#4-blog-posts) — `EXISTS`
5. [Jobs](#5-jobs) — `EXISTS`
6. [Job Applications](#6-job-applications) — `EXISTS`
7. [Help & FAQ Articles](#7-help--faq-articles) — `EXISTS`
8. [Support Tickets](#8-support-tickets) — `EXISTS`
9. [Ticket Replies](#9-ticket-replies) — `EXISTS`
10. [Taxonomies](#10-taxonomies) — `NEW - not yet built`
11. [Pages](#11-pages) — `NEW - not yet built`
12. [Page Content (Inline Edits)](#12-page-content-inline-edits) — `NEW - not yet built`
13. [Settings (Integrations, Header/Footer, AI)](#13-settings) — `EXISTS`
14. [AI Tools](#14-ai-tools) — `EXISTS`
15. [Palisis Sync](#15-palisis-sync) — `EXISTS (mock data)`
16. [File Upload](#16-file-upload) — `EXISTS`
17. [Palisis Webhook](#17-palisis-webhook) — `NEW - not yet built`

### Frontend (Public) APIs
18. [Weather](#18-weather) — `EXISTS`
19. [Trip Catalog (Public)](#19-trip-catalog-public) — `EXISTS`
20. [Blog (Public)](#20-blog-public) — `EXISTS`
21. [AI — Trip Planner](#21-ai--trip-planner) — `EXISTS`
22. [AI — Trip Chat](#22-ai--trip-chat) — `EXISTS`
23. [AI — Help Chat](#23-ai--help-chat) — `EXISTS`
24. [AI — Itinerary Builder](#24-ai--itinerary-builder) — `EXISTS`
25. [Google Reviews](#25-google-reviews) — `EXISTS`
26. [Mapbox Token](#26-mapbox-token) — `EXISTS`
27. [Careers — Submit Application](#27-careers--submit-application) — `EXISTS`
28. [Feedback](#28-feedback) — `EXISTS`
29. [Pitch PDF](#29-pitch-pdf) — `EXISTS`

---

## Authentication

> **Status: NOT YET BUILT.** All `/api/admin/*` routes currently have zero auth protection. See the implementation plan in `docs/implementation-audit.md §3`.

Once built, every admin API response will require a valid `admin_session` `HttpOnly` cookie. The middleware at `middleware.ts` will intercept all `/api/admin/*` and `/admin/*` requests before they reach the handlers.

---

## ADMIN PANEL APIs

---

### 1. Authentication

> **Status: NOT YET BUILT** — These 3 routes need to be created.

---

#### `POST /api/admin/auth/login`

Verifies admin credentials and issues a session cookie.

**Used by:** `/admin/login` page form submit.

**Request body:**
```json
{
  "email": "admin@sightseeing.lu",
  "password": "••••••••"
}
```

**Response (200 OK):**
```json
{ "ok": true, "user": { "id": "uuid", "email": "...", "name": "...", "role": "superadmin" } }
```
Sets `HttpOnly; Secure; SameSite=Lax` cookie named `admin_session` containing a signed JWT.

**Response (401):**
```json
{ "error": "Invalid email or password" }
```
Responds after a fixed 300 ms delay regardless of whether the email exists (prevents timing attacks).

**Response (429):**
```json
{ "error": "Too many attempts. Try again in 15 minutes." }
```

---

#### `POST /api/admin/auth/logout`

Clears the session cookie server-side.

**Used by:** "Log out" button in admin sidebar.

**Request body:** Empty.

**Response (200 OK):**
```json
{ "ok": true }
```
Clears `admin_session` cookie.

---

#### `GET /api/admin/auth/me`

Returns the currently authenticated admin's profile. Used to hydrate the admin sidebar (name, role).

**Used by:** Admin layout on mount.

**Response (200 OK):**
```json
{ "id": "uuid", "email": "...", "name": "...", "role": "superadmin", "lastLogin": "2026-04-24T..." }
```

**Response (401):** `{ "error": "Unauthorized" }`

---

### 2. Dashboard

> **Status: NOT YET BUILT** — Currently the dashboard page calls `listTrips()`, `listJobs()`, `listPosts()` directly from the server component. When data moves to PostgreSQL, a dedicated stats API will be required.

---

#### `GET /api/admin/dashboard`

Returns aggregated counts for the dashboard stat cards.

**Used by:** `/admin` dashboard page.

**Response (200 OK):**
```json
{
  "trips": { "total": 43, "published": 38, "draft": 5, "featured": 6 },
  "posts": { "total": 12, "published": 9, "draft": 3 },
  "jobs": { "total": 4, "open": 3, "closed": 1 },
  "applications": { "total": 27, "new": 8 },
  "tickets": { "total": 14, "open": 5, "inProgress": 3 },
  "helpArticles": { "total": 17, "published": 15, "draft": 2 }
}
```

---

### 3. Trips

> **Status: EXISTS** — Routes are wired and functional against the in-memory store. Must be re-pointed to PostgreSQL when the DB is connected. All 5 operations are implemented.

**Admin page using these APIs:** `/admin/trips`, `/admin/trips/[id]`, `/admin/trips/new`

---

#### `GET /api/admin/trips`

Returns all trips (any status).

**Query params:**
| Param | Type | Description |
|---|---|---|
| `status` | `published\|draft` | Filter by status (optional) |
| `featured` | `true\|false` | Filter featured only (optional) |

**Response (200 OK):** Array of trip objects.

---

#### `POST /api/admin/trips`

Creates a new trip in `draft` status.

**Request body:** Full trip object (without `id`, `createdAt`, `updatedAt`):
```json
{
  "title": "Moselle Wine Tasting",
  "description": "...",
  "price": 49,
  "duration": "3 hours",
  "category": "Food & Drink",
  "tags": ["food", "romantic"],
  "city": "Remich",
  "image": "/images/trips/wine.jpg",
  "rating": 4.7,
  "reviewCount": 0,
  "featured": false,
  "featuredDeparture": false,
  "status": "draft"
}
```

**Response (201 Created):** Created trip object with generated `id`.

---

#### `GET /api/admin/trips/[id]`

Returns a single trip by ID.

**Response (200 OK):** Trip object.
**Response (404):** `{ "error": "Not found" }`

---

#### `PATCH /api/admin/trips/[id]`

Partial update of any trip field. Also used for:
- Toggle `featured` / `featuredDeparture` (from the toggle button on the trips list)
- Toggle `status` between `published` and `draft`
- Save admin overrides (`title_override`, `description_override`)

**Request body (any subset of trip fields):**
```json
{ "featured": true }
```
or
```json
{ "status": "published" }
```
or
```json
{ "title_override": "Custom display title", "price": 55 }
```

**Response (200 OK):** Updated trip object.
**Response (404):** `{ "error": "Not found" }`

---

#### `DELETE /api/admin/trips/[id]`

Permanently deletes a trip.

**Response (200 OK):** `{ "ok": true }`

---

#### `POST /api/admin/trips/upload`

Uploads a trip image to Vercel Blob storage.

**Used by:** Image upload field on `/admin/trips/[id]` edit form.

**Request:** `multipart/form-data` with field `file` (image file).

**Response (200 OK):**
```json
{ "url": "https://blob.vercel-storage.com/trips/filename.jpg" }
```

---

### 4. Blog Posts

> **Status: EXISTS** — Full CRUD is implemented against the in-memory store. Must be re-pointed to PostgreSQL. 5 operations implemented + 1 AI generation route.

**Admin page using these APIs:** `/admin/blog`, `/admin/blog/[id]`, `/admin/blog/new`

---

#### `GET /api/admin/posts`

Returns all blog posts (any status, including drafts). Admin-only.

**Response (200 OK):** Array of post objects.

---

#### `POST /api/admin/posts`

Creates a new blog post.

**Request body:**
```json
{
  "title": "Top 5 Hidden Gems in Luxembourg",
  "slug": "top-5-hidden-gems",
  "excerpt": "...",
  "body": "# Markdown content here...",
  "image": "/images/blog/hidden-gems.jpg",
  "author": "Marie Schmidt",
  "category": "Travel Tips",
  "tags": ["hidden gems", "local"],
  "status": "draft",
  "seoTitle": "...",
  "seoDescription": "..."
}
```

**Response (201 Created):** Created post object with generated `id`.

---

#### `GET /api/admin/posts/[id]`

Returns a single post by ID (admin view — includes drafts).

**Response (200 OK):** Post object.
**Response (404):** `{ "error": "Not found" }`

---

#### `PATCH /api/admin/posts/[id]`

Partial update. Also used for publish/unpublish toggle.

**Request body (any subset):**
```json
{ "status": "published", "publishedAt": "2026-04-24T10:00:00Z" }
```

**Response (200 OK):** Updated post object.

---

#### `DELETE /api/admin/posts/[id]`

Permanently deletes a post.

**Response (200 OK):** `{ "ok": true }`

---

### 5. Jobs

> **Status: EXISTS** — Full CRUD implemented against in-memory store. 5 operations implemented.

**Admin page using these APIs:** `/admin/jobs`, `/admin/jobs/[id]`, `/admin/jobs/new`

---

#### `GET /api/admin/jobs`

Returns all job listings (any status).

**Response (200 OK):** Array of job objects.

---

#### `POST /api/admin/jobs`

Creates a new job listing in `open` status.

**Request body:**
```json
{
  "title": "Tour Guide",
  "department": "Operations",
  "location": "Luxembourg City",
  "type": "Full-time",
  "description": "...",
  "requirements": ["Fluent in English and French", "2+ years experience"],
  "status": "open"
}
```

**Response (201 Created):** Created job object with generated `id`.

---

#### `GET /api/admin/jobs/[id]`

Returns a single job by ID.

**Response (200 OK):** Job object.
**Response (404):** `{ "error": "Not found" }`

---

#### `PATCH /api/admin/jobs/[id]`

Partial update. Also used for the status toggle (`open` ↔ `closed`) from the jobs list.

**Request body:**
```json
{ "status": "closed" }
```

**Response (200 OK):** Updated job object.

---

#### `DELETE /api/admin/jobs/[id]`

Permanently deletes a job listing and all its applications (CASCADE).

**Response (200 OK):** `{ "ok": true }`

---

### 6. Job Applications

> **Status: EXISTS** — List, update status/notes, and delete are implemented. No create endpoint — applications are submitted via the public `/api/careers/apply` route.

**Admin page using these APIs:** `/admin/jobs/applications`

---

#### `GET /api/admin/applications`

Returns all job applications across all jobs.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `jobId` | string | Filter by job (optional) |
| `status` | string | Filter by status: `new\|reviewing\|shortlisted\|rejected\|hired` (optional) |

**Response (200 OK):** Array of application objects including `jobTitle`, `fullName`, `email`, `status`, `notes`, `attachments`, `createdAt`.

---

#### `PATCH /api/admin/applications`

Updates an application's `status` and/or `notes`. Admin reviews and advances candidates through the pipeline.

**Request body:**
```json
{
  "id": "uuid",
  "status": "shortlisted",
  "notes": "Strong candidate, schedule interview."
}
```

**Response (200 OK):** Updated application object.

---

#### `DELETE /api/admin/applications?id=[id]`

Permanently deletes a job application.

**Response (200 OK):** `{ "ok": true }`

---

### 7. Help & FAQ Articles

> **Status: EXISTS** — Full CRUD implemented against in-memory store.

**Admin page using these APIs:** `/admin/help`, `/admin/help/[id]`, `/admin/help/new`

---

#### `GET /api/admin/help`

Returns all help articles (any status). Admin-only — includes drafts.

**Response (200 OK):** Array of article objects grouped or flat, with `id`, `question`, `answer`, `category`, `status`, `order`.

---

#### `POST /api/admin/help`

Creates a new help/FAQ article.

**Request body:**
```json
{
  "question": "Can I cancel my booking?",
  "answer": "Yes, free cancellation up to 24 hours before...",
  "category": "Cancellation",
  "status": "published",
  "order": 10
}
```

**Response (201 Created):** Created article object with generated `id`.

---

#### `GET /api/admin/help/[id]`

Returns a single article by ID.

**Response (200 OK):** Article object.
**Response (404):** `{ "error": "Not found" }`

---

#### `PATCH /api/admin/help/[id]`

Partial update — used for editing content, toggling published/draft, reordering.

**Request body (any subset):**
```json
{ "status": "draft", "order": 5 }
```

**Response (200 OK):** Updated article object.

---

#### `DELETE /api/admin/help/[id]`

Permanently deletes a help article.

**Response (200 OK):** `{ "ok": true }`

---

### 8. Support Tickets

> **Status: EXISTS** — Full CRUD implemented. Create (from admin modal), list, update status, delete all work.

**Admin page using these APIs:** `/admin/tickets`, `/admin/tickets/[id]`

---

#### `GET /api/admin/tickets`

Returns all support tickets.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `status` | string | Filter: `open\|in-progress\|waiting\|resolved\|closed` (optional) |
| `priority` | string | Filter: `low\|medium\|high\|urgent` (optional) |

**Response (200 OK):** Array of ticket objects including embedded `replies` array.

---

#### `POST /api/admin/tickets`

Creates a new support ticket (from the admin "New Ticket" modal).

**Request body:**
```json
{
  "subject": "Palisis API returning 401",
  "description": "Since yesterday, the import panel shows a 401 error...",
  "category": "bug",
  "priority": "high"
}
```

**Response (201 Created):** Created ticket object.

---

#### `GET /api/admin/tickets/[id]`

Returns a single ticket with all its replies.

**Response (200 OK):** Ticket object including `replies` array.
**Response (404):** `{ "error": "Not found" }`

---

#### `PATCH /api/admin/tickets/[id]`

Updates ticket `status`, `priority`, or `assignedTo`.

**Request body:**
```json
{ "status": "in-progress", "priority": "urgent" }
```

**Response (200 OK):** Updated ticket object.

---

#### `DELETE /api/admin/tickets/[id]`

Permanently deletes a ticket and all its replies (CASCADE).

**Response (200 OK):** `{ "ok": true }`

---

### 9. Ticket Replies

> **Status: EXISTS** — `POST` reply to a ticket is implemented. No `DELETE` reply endpoint exists.

**Admin page using these APIs:** `/admin/tickets/[id]` (ticket detail / thread view)

---

#### `POST /api/admin/tickets/[id]/replies`

Adds a reply to a ticket thread.

**Request body:**
```json
{
  "message": "I've reset the Palisis API key. Please try the import again.",
  "authorName": "Admin",
  "authorRole": "admin"
}
```

**Response (201 Created):** The new reply object with `id`, `authorName`, `message`, `createdAt`.

---

### 10. Taxonomies

> **Status: NOT YET BUILT** — The `/admin/taxonomies` page currently stores edits in React `useState` only. When "Save All" is clicked, `handleSave()` sets a UI flag but never calls any API. These two routes need to be created.

**Admin page using these APIs:** `/admin/taxonomies`

---

#### `GET /api/admin/taxonomies`

Returns all site-copy key/value pairs.

**Response (200 OK):**
```json
[
  { "key": "hero_title", "label": "Hero Title", "value": "Handpicked Experiences", "groupKey": "hero" },
  { "key": "hero_subtitle", "label": "Hero Subtitle", "value": "Join us on the hunt...", "groupKey": "hero" }
]
```

---

#### `PATCH /api/admin/taxonomies`

Bulk upsert — saves all changed taxonomy values in one request.

**Request body:**
```json
{
  "items": [
    { "key": "hero_title", "value": "Discover Luxembourg" },
    { "key": "about_tagline", "value": "Luxembourg's #1 tour operator." }
  ]
}
```

**Response (200 OK):** `{ "ok": true, "updated": 2 }`

---

#### `POST /api/admin/taxonomies`

Creates a single new taxonomy entry.

**Request body:**
```json
{ "key": "hero_cta_text", "label": "Hero CTA Button Text", "value": "Explore Trips" }
```

**Response (201 Created):** The created taxonomy entry.

---

#### `DELETE /api/admin/taxonomies/[key]`

Deletes a taxonomy entry by key.

**Response (200 OK):** `{ "ok": true }`

---

### 11. Pages

> **Status: NOT YET BUILT** — The `/admin/pages` page currently only redirects to the public page with `?admin_edit=1`. No API routes exist for pages. These routes must be created to support page management with revision history.

**Admin page using these APIs:** `/admin/pages`, `/admin/pages/[slug]`

---

#### `GET /api/admin/pages`

Returns all managed pages (system and custom).

**Response (200 OK):**
```json
[
  { "id": "uuid", "slug": "home", "title": "Home", "url": "/", "status": "published", "isSystemPage": true, "updatedAt": "..." },
  { "id": "uuid", "slug": "private-tours", "title": "Private Tours", "url": "/experiences/private-tours", "status": "draft", "isSystemPage": false, "updatedAt": "..." }
]
```

---

#### `POST /api/admin/pages`

Creates a new custom page.

**Request body:**
```json
{
  "slug": "private-tours",
  "title": "Private Tours",
  "url": "/experiences/private-tours",
  "description": "Custom page for private tour offerings",
  "content": { "blocks": [], "meta": {} },
  "status": "draft",
  "seoTitle": "Private Tours Luxembourg",
  "seoDescription": "..."
}
```

**Response (201 Created):** Created page object.

---

#### `GET /api/admin/pages/[id]`

Returns a single page's full content for the editor.

**Response (200 OK):** Full page object including `content` JSONB.

---

#### `PATCH /api/admin/pages/[id]`

Saves updated page content. **Also automatically inserts a new `page_revisions` row** before applying the update.

**Request body (any subset):**
```json
{
  "title": "Updated Home",
  "content": { "blocks": [...], "meta": { "seoTitle": "..." } },
  "status": "published",
  "label": "Manual save"
}
```

**Response (200 OK):** Updated page object + `revisionId` of the snapshot just created.

---

#### `DELETE /api/admin/pages/[id]`

Deletes a custom page and all its revisions (CASCADE). System pages (`isSystemPage: true`) cannot be deleted — returns `403`.

**Response (200 OK):** `{ "ok": true }`
**Response (403):** `{ "error": "System pages cannot be deleted" }`

---

#### `GET /api/admin/pages/[id]/revisions`

Returns the revision history for a page, newest first.

**Response (200 OK):**
```json
[
  { "id": "uuid", "revisionNumber": 7, "label": "Manual save", "createdBy": "...", "createdAt": "..." },
  { "id": "uuid", "revisionNumber": 6, "label": "Auto-save", "createdAt": "..." }
]
```

---

#### `POST /api/admin/pages/[id]/revisions/[revisionId]/restore`

Restores a past revision as the current live page. Copies the revision's content back to the `pages` row and inserts a new revision with `label = "Restored from revision #N"`.

**Response (200 OK):** `{ "ok": true, "restoredRevisionNumber": 6, "newRevisionId": "uuid" }`

---

### 12. Page Content (Inline Edits)

> **Status: NOT YET BUILT** — The inline `?admin_edit=1` system stores edits in `lib/page-content-store.ts` (in-memory Map). When "Save all" is clicked in the admin banner, it must POST to an API that persists to `page_content` table in PostgreSQL.

**Admin page using these APIs:** Any public page opened with `?admin_edit=1`

---

#### `GET /api/admin/page-content?slug=[slug]`

Returns all stored inline text edits for a page slug.

**Response (200 OK):**
```json
{
  "home": {
    "hero_title": "Discover Luxembourg",
    "hero_subtitle": "Join us on the hunt..."
  }
}
```

---

#### `POST /api/admin/page-content`

Bulk-saves all inline text edits for a page when admin clicks "Save all" in the edit banner.

**Request body:**
```json
{
  "pageSlug": "home",
  "changes": {
    "hero_title": "Discover Luxembourg",
    "hero_subtitle": "Join us on the hunt for the best activities."
  }
}
```

**Response (200 OK):** `{ "ok": true, "saved": 2 }`

---

### 13. Settings

> **Status: EXISTS** — `GET` and `PATCH` are implemented on a single multiplexed endpoint. One route handles integrations (API keys), AI system configs, Weglot settings, and header/footer injection all via a `section` parameter.

**Admin pages using this API:** `/admin/integrations`, `/admin/integrations/weglot`, `/admin/header-footer`, `/admin/ai-systems/[system]`, `/admin/ai-systems/planner/behavior`

---

#### `GET /api/admin/settings`

Returns the full settings object from the admin store.

**Response (200 OK):**
```json
{
  "apiKeys": { "openWeather": "...", "mapbox": "...", "palisis": "", "weglot": "", "anthropic": "", "openai": "", "googlePlaceId": "", "googleReviews": "" },
  "ai": {
    "planner": { "systemPrompt": "...", "model": "openai/gpt-4o-mini", "temperature": 0.7, "maxTokens": 2048 },
    "chat":    { "systemPrompt": "...", "model": "openai/gpt-4o-mini", "temperature": 0.5, "maxTokens": 1024 },
    "help":    { "systemPrompt": "...", "model": "openai/gpt-4o-mini", "temperature": 0.3, "maxTokens": 1024 }
  },
  "weglot": { "originalLang": "en", "destinationLangs": ["fr", "de"], "showFlags": true, ... },
  "header": { "customHtml": "<!-- merged header blocks -->" },
  "footer": { "customHtml": "<!-- merged footer blocks -->" },
  "plannerBehavior": { "optimizationPriority": "balanced", "maxStopsPerDay": 6, ... }
}
```

---

#### `PATCH /api/admin/settings`

Updates one section of settings. The `section` field determines which section is updated.

**Request body — API Keys (from `/admin/integrations`):**
```json
{
  "section": "apiKeys",
  "data": { "openWeather": "abc123", "mapbox": "pk.eyJ1...", "palisis": "pal_live_..." }
}
```

**Request body — AI system config (from `/admin/ai-systems/[system]`):**
```json
{
  "section": "ai",
  "data": { "system": "planner", "systemPrompt": "You are...", "model": "anthropic/claude-opus-4.6", "temperature": 0.7, "maxTokens": 2048 }
}
```

**Request body — Weglot config (from `/admin/integrations/weglot`):**
```json
{
  "section": "weglot",
  "data": { "originalLang": "en", "destinationLangs": ["fr", "de", "lu"], "showFlags": true }
}
```

**Request body — Header/Footer injection (from `/admin/header-footer`):**
```json
{
  "section": "header",
  "data": { "customHtml": "<!-- Announcement Banner -->\n<div>Spring Sale!</div>" }
}
```

**Response (200 OK):** `{ "ok": true }`

---

### 14. AI Tools

> **Status: EXISTS** — Three admin-only AI routes are live.

**Admin pages using these APIs:** `/admin/ai-systems` (AI advisor), `/admin/blog/[id]` (generate blog), `/admin/trips/[id]` (SEO analyze)

---

#### `POST /api/admin/ai-advisor`

Streaming AI strategy advisor. Analyses the current state of the platform (trip counts, publish rates, blog posts) and provides strategic recommendations.

**Used by:** `AIAdvisorDashboard` component on `/admin/ai-systems`.

**Request body:**
```json
{
  "messages": [{ "role": "user", "content": "What should I focus on this week?" }]
}
```

**Response:** `text/event-stream` — streaming AI response via Vercel AI SDK `UIMessageStreamResponse`.

---

#### `POST /api/admin/generate-blog`

Generates an AI draft blog post from a topic prompt.

**Used by:** "Generate with AI" button on `/admin/blog/new` and `/admin/blog/[id]`.

**Request body:**
```json
{
  "topic": "Top hiking trails near Luxembourg City",
  "tone": "friendly",
  "length": "medium"
}
```

**Response:** `text/event-stream` — streamed markdown content.

---

#### `POST /api/admin/seo-analyze`

Analyses a trip or blog post for SEO quality and returns suggestions.

**Used by:** SEO panel on trip and blog edit forms.

**Request body:**
```json
{
  "type": "trip",
  "title": "Moselle Wine Tasting Cruise",
  "description": "...",
  "tags": ["food", "romantic"]
}
```

**Response (200 OK):**
```json
{
  "score": 74,
  "suggestions": [
    "Title is 38 characters — aim for 50–60 for better click-through.",
    "Description could include a price anchor (from €49).",
    "Add 'Luxembourg' to tags for local SEO."
  ]
}
```

---

#### `POST /api/admin/planner-behavior`

Saves AI trip planner behavior settings (optimization priority, meal breaks, day window, etc.).

**Used by:** `/admin/ai-systems/planner/behavior` page.

**Request body:**
```json
{
  "optimizationPriority": "minimize_travel",
  "maxStopsPerDay": 5,
  "bufferTimeBetweenStops": 30,
  "dayStartTime": "09:00",
  "dayEndTime": "21:00",
  "autoInsertMealBreaks": true,
  "lunchBreakTime": "12:30",
  "dinnerBreakTime": "19:00",
  "mealBreakDuration": 60,
  "suggestionRandomness": 40,
  "localFavoritesBias": 50,
  "model": "openai/gpt-4o-mini"
}
```

**Response (200 OK):** `{ "ok": true }`

---

### 15. Palisis Sync

> **Status: EXISTS but uses mock data.** Both routes are scaffolded. The real Palisis API call is commented out. See `docs/implementation-audit.md §1.1`.

**Admin page using these APIs:** `/admin/palisis`

---

#### `POST /api/admin/palisis-import`

Imports the Palisis trip catalog and upserts trips into the local store. Currently returns mock data.

**Request body:** Empty.

**Response (200 OK):**
```json
{
  "ok": true,
  "imported": 2,
  "skipped": 0,
  "total": 2,
  "note": "Mock data used — set Palisis API key to import live catalog"
}
```

---

#### `POST /api/admin/palisis-availability`

Syncs departure slot availability for all existing trips from Palisis.

**Request body:** Empty.

**Response (200 OK):**
```json
{
  "ok": true,
  "updated": 12,
  "slots": [
    { "tripId": "31898", "tripTitle": "City Train Tour", "date": "2026-04-26", "spotsAvailable": 8, "spotsTotal": 20 }
  ]
}
```

---

### 15.1 DMO / Regiondo Import

> **Status: EXISTS.** Imports the static Regiondo (branded "DMO") product catalog into
> `trips` (`source='regiondo'`) plus `product_variations` / `product_options`. One-way
> (API → DB), static-only — live availability is fetched at view time, never stored.
> Admin-only (permission `regiondo`).

**Admin page using these APIs:** `/admin/regiondo`

---

#### `POST /api/admin/regiondo-import`

Pulls the full Regiondo product catalog and creates/updates DMO trips. Existing DMO
trips are skipped unless `override: true`. **Override is scoped to `source='regiondo'`
only — Palisis trips are never touched.**

**Request body:**
```json
{ "override": false }
```

**Response (200 OK):**
```json
{
  "ok": true,
  "total": 12,
  "imported": 8,
  "updated": 0,
  "skipped": 4,
  "apiErrors": 0,
  "log": ["..."]
}
```

---

#### `GET /api/admin/regiondo-logs?limit=5`

Returns the latest Regiondo import runs from `regiondo_sync_log`.

**Response (200 OK):**
```json
{ "ok": true, "logs": [ { "id": "...", "action": "created", "changes": { "total": 12, "imported": 8 }, "created_at": "..." } ] }
```

---

### 16. File Upload

> **Status: EXISTS** — Generic file upload to Vercel Blob. Used for trip images and job application attachments.

---

#### `POST /api/upload`

Uploads a file to Vercel Blob.

**Request:** `multipart/form-data` with field `file`.

**Response (200 OK):**
```json
{ "url": "https://blob.vercel-storage.com/uploads/filename-abc123.jpg" }
```

---

### 17. Palisis Webhook

> **Status: NOT YET BUILT** — This route needs to be created at the path Palisis will POST to when a trip changes or a booking is made.

---

#### `POST /api/webhooks/palisis`

Receives push events from Palisis when trips are updated or bookings are completed.

**Headers required:**
```
X-Palisis-Signature: sha256=<hmac_hex>
Content-Type: application/json
```

**Request body (Palisis push event — shape TBD per Palisis API docs):**
```json
{
  "event": "trip.updated",
  "tripId": "PAL-001",
  "title": "Casemates du Bock – Guided Tour (Updated)",
  "price": 16,
  "description": "..."
}
```

**Behavior:**
1. Verify `X-Palisis-Signature` HMAC against `process.env.PALISIS_WEBHOOK_SECRET`
2. If signature invalid → return `401`
3. Look up trip by `palisisId` in DB
4. Update base fields (`title`, `description`, `price`) — **never overwrite `title_override` or `description_override`**
5. Insert row into `palisis_sync_log` with `trigger_type = 'webhook'`
6. Return `200`

**Response (200 OK):** `{ "ok": true }`
**Response (401):** `{ "error": "Invalid signature" }`

---

## FRONTEND (PUBLIC) APIs

---

### 18. Weather

> **Status: EXISTS** — Fully implemented with graceful fallback.

---

#### `GET /api/weather`

Returns current weather and 4-day forecast for Luxembourg City from OpenWeatherMap. Returns hardcoded Luxembourg fallback data if the API key is missing or the call fails.

**Used by:** Homepage weather widget, AI trip planner (for activity bias), weather context provider.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `city` | string | Override city name in the response label (optional) |

**Response (200 OK):**
```json
{
  "current": {
    "temp": 14,
    "feelsLike": 12,
    "condition": "Partly Cloudy",
    "humidity": 68,
    "wind": 22,
    "icon": "cloud-sun",
    "city": "Luxembourg City",
    "sunrise": 1745553600,
    "sunset": 1745604000
  },
  "forecast": [
    { "day": "Sat", "high": 16, "low": 8, "icon": "sun", "condition": "Sunny" }
  ],
  "isFallback": false
}
```

---

### 19. Trip Catalog (Public)

> **Status: EXISTS** — Full filtering and sorting. Public-facing with CORS headers and 1-hour CDN cache.

---

#### `GET /api/trips`

Returns the public trip catalog for external consumers (AI agents, third-party integrations).

**Used by:** External AI agents, potential partner integrations. The planner and help chat use the internal `lib/data.ts` store directly, not this endpoint.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `category` | string | Filter by category name (case-insensitive) |
| `city` | string | Filter by city name (case-insensitive) |
| `minPrice` | number | Minimum price filter (inclusive) |
| `maxPrice` | number | Maximum price filter (inclusive) |
| `sort` | `price\|rating\|reviews` | Sort order (default: reviews desc) |
| `limit` | number | Max results returned |

**Response (200 OK):**
```json
{
  "meta": { "total": 43, "categories": [...], "cities": [...], "generatedAt": "...", "source": "sightseeing.lu" },
  "trips": [
    { "id": "31898", "title": "City Train Tour", "url": "https://sightseeing.lu/trip/31898", "price": 18, "currency": "EUR", ... }
  ]
}
```

**Cache:** `public, max-age=3600, s-maxage=3600`

---

### 20. Blog (Public)

> **Status: EXISTS** — Two public routes: list and single post by slug.

---

#### `GET /api/blog`

Returns all published blog posts.

**Used by:** `/blog` index page.

**Response (200 OK):** Array of published post objects (status = `"published"` only).

---

#### `GET /api/blog/[slug]`

Returns a single published blog post by slug.

**Used by:** `/blog/[slug]` page.

**Response (200 OK):** Full blog post object.
**Response (404):** `{ "error": "Post not found" }`

---

### 21. AI — Trip Planner

> **Status: EXISTS** — Streaming AI with 7 tools. Uses Vercel AI SDK `streamText`.

---

#### `POST /api/planner`

Streaming conversational trip planner. Accepts a message history, user preferences, and cart items. Returns a streaming `UIMessageStreamResponse`.

**Used by:** `/planner` page chatbot.

**Request body:**
```json
{
  "messages": [{ "role": "user", "content": "I'm looking for outdoor activities for the weekend" }],
  "preferences": { "group": "couple", "interests": ["outdoor", "culture"], "duration": "full-day", "budget": "moderate" },
  "cartItems": [{ "id": "31898", "title": "City Train Tour" }],
  "groupMembers": [{ "name": "Alice", "interests": ["food"] }, { "name": "Bob", "interests": ["outdoor"] }]
}
```

**Response:** `text/event-stream` — Vercel AI SDK `UIMessageStreamResponse` with tool call results embedded.

**AI Tools available in this route:**
| Tool | Purpose |
|---|---|
| `searchTrips` | Search and filter the trip catalog |
| `showWeather` | Show current weather data |
| `showWeatherAlert` | Show a proactive weather-based recommendation card |
| `offerCoupon` | Generate a one-time discount coupon code |
| `buildItinerary` | Build an optimized day itinerary from saved trips |
| `addToCart` | Signal the client to add a trip to the cart cookie |

---

### 22. AI — Trip Chat

> **Status: EXISTS** — Per-trip streaming chat assistant.

---

#### `POST /api/trip-chat`

Streaming AI chat assistant for a specific trip. Answers questions about that trip.

**Used by:** Trip detail page (`/trip/[id]`) chat widget.

**Request body:**
```json
{
  "messages": [{ "role": "user", "content": "Is this suitable for children?" }],
  "tripId": "31898",
  "tripTitle": "City Train Tour",
  "tripDescription": "..."
}
```

**Response:** `text/event-stream` — streaming AI response.

---

### 23. AI — Help Chat

> **Status: EXISTS** — Help assistant with FAQ knowledge base.

---

#### `POST /api/help-chat`

Streaming AI customer support bot. Reads all published help articles as its knowledge base on each request.

**Used by:** `/help` page chat widget.

**Request body:**
```json
{
  "messages": [{ "role": "user", "content": "Can I get a refund?" }]
}
```

**Response:** `text/event-stream` — streaming AI response.

---

### 24. AI — Itinerary Builder

> **Status: EXISTS** — Standalone itinerary generation endpoint.

---

#### `POST /api/itinerary`

Generates an optimized day itinerary from a list of trip IDs.

**Used by:** Itinerary result view after planner interaction.

**Request body:**
```json
{
  "tripIds": ["31898", "31901", "31915"],
  "date": "2026-04-26",
  "startTime": "09:00"
}
```

**Response (200 OK):**
```json
{
  "itinerary": [
    { "time": "09:00", "tripId": "31898", "tripTitle": "City Train Tour", "durationMinutes": 90, "travelToNext": "15 min walk" },
    { "time": "11:00", "tripId": "31901", "tripTitle": "Casemates du Bock", "durationMinutes": 60, "travelToNext": "10 min bus" }
  ],
  "summary": "A well-rounded day combining transport, history, and culture."
}
```

---

### 25. Google Reviews

> **Status: EXISTS** — Works but has a hardcoded business name bug (see `docs/implementation-audit.md §1.6`).

---

#### `GET /api/google-reviews?url=[url]`

Fetches Google Reviews for a business given a Google Maps URL or Place ID.

**Used by:** Homepage Google Reviews widget.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `url` | string | Google Maps URL or raw Place ID |

**Response (200 OK):**
```json
{
  "name": "Dinner Hopping Luxembourg",
  "rating": 4.9,
  "totalReviews": 312,
  "reviews": [
    { "author": "Marie D.", "avatar": "...", "rating": 5, "date": "a month ago", "text": "Incredible experience!" }
  ]
}
```

**Response (503):** API key not configured.
**Response (400):** Place ID could not be resolved from the URL.

---

### 26. Mapbox Token

> **Status: EXISTS** — Returns the Mapbox public token. Currently open to any caller (security risk).

---

#### `GET /api/mapbox-token`

Returns the Mapbox public access token for client-side map rendering.

**Used by:** `components/chatgpt-widgets/sightseeing-map.tsx`

**Response (200 OK):**
```json
{ "token": "pk.eyJ1IjoiLi4uIn0..." }
```

Returns `{ "token": "" }` if no Mapbox token is configured.

---

### 27. Careers — Submit Application

> **Status: EXISTS** — Accepts `multipart/form-data`, uploads attachments to Vercel Blob, and stores the application.

---

#### `POST /api/careers/apply`

Submits a job application from the public `/careers` page.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `jobId` | string | Yes | ID of the job being applied for |
| `fullName` | string | Yes | Applicant's full name |
| `email` | string | Yes | Applicant's email address |
| `phone` | string | No | Phone number |
| `coverLetter` | string | Yes | Cover letter text |
| `linkedinUrl` | string | No | LinkedIn profile URL |
| `portfolioUrl` | string | No | Portfolio URL |
| `resume` | File | No | Resume file (PDF/Word) — uploaded to Vercel Blob |
| `files` | File[] | No | Additional attachments |

**Response (200 OK):**
```json
{ "success": true, "id": "uuid" }
```

**Response (400):** Missing required fields.
**Response (404):** Job not found.

---

### 28. Feedback

> **Status: EXISTS** — Stores user feedback.

---

#### `POST /api/feedback`

Submits general user feedback from the public site.

**Request body:**
```json
{
  "type": "bug" | "suggestion" | "compliment",
  "message": "The map widget doesn't load on mobile.",
  "page": "/explore",
  "email": "user@example.com"
}
```

**Response (200 OK):** `{ "ok": true }`

---

### 29. Pitch PDF

> **Status: EXISTS** — Generates a PDF pitch deck for the platform.

---

#### `POST /api/pitch-pdf`

Generates a business pitch PDF.

**Used by:** Internal admin / investor-facing page.

**Request body:** Platform stats and configuration.

**Response:** `application/pdf` binary stream.

---

## Route Index — Quick Reference

### Admin Routes Summary

| Route | Method(s) | Status | Used By |
|---|---|---|---|
| `/api/admin/auth/login` | POST | **NOT BUILT** | `/admin/login` |
| `/api/admin/auth/logout` | POST | **NOT BUILT** | Admin sidebar logout |
| `/api/admin/auth/me` | GET | **NOT BUILT** | Admin layout hydration |
| `/api/admin/dashboard` | GET | **NOT BUILT** | `/admin` dashboard |
| `/api/admin/trips` | GET, POST | EXISTS | `/admin/trips`, `/admin/trips/new` |
| `/api/admin/trips/[id]` | GET, PATCH, DELETE | EXISTS | `/admin/trips/[id]` |
| `/api/admin/trips/upload` | POST | EXISTS | Trip image upload |
| `/api/admin/posts` | GET, POST | EXISTS | `/admin/blog`, `/admin/blog/new` |
| `/api/admin/posts/[id]` | GET, PATCH, DELETE | EXISTS | `/admin/blog/[id]` |
| `/api/admin/jobs` | GET, POST | EXISTS | `/admin/jobs`, `/admin/jobs/new` |
| `/api/admin/jobs/[id]` | GET, PATCH, DELETE | EXISTS | `/admin/jobs/[id]` |
| `/api/admin/applications` | GET, PATCH, DELETE | EXISTS | `/admin/jobs/applications` |
| `/api/admin/help` | GET, POST | EXISTS | `/admin/help`, `/admin/help/new` |
| `/api/admin/help/[id]` | GET, PATCH, DELETE | EXISTS | `/admin/help/[id]` |
| `/api/admin/tickets` | GET, POST | EXISTS | `/admin/tickets` |
| `/api/admin/tickets/[id]` | GET, PATCH, DELETE | EXISTS | `/admin/tickets/[id]` |
| `/api/admin/tickets/[id]/replies` | POST | EXISTS | `/admin/tickets/[id]` thread |
| `/api/admin/taxonomies` | GET, POST, PATCH | **NOT BUILT** | `/admin/taxonomies` |
| `/api/admin/taxonomies/[key]` | DELETE | **NOT BUILT** | `/admin/taxonomies` |
| `/api/admin/pages` | GET, POST | **NOT BUILT** | `/admin/pages` |
| `/api/admin/pages/[id]` | GET, PATCH, DELETE | **NOT BUILT** | `/admin/pages/[slug]` |
| `/api/admin/pages/[id]/revisions` | GET | **NOT BUILT** | Page revision history |
| `/api/admin/pages/[id]/revisions/[rid]/restore` | POST | **NOT BUILT** | Restore revision |
| `/api/admin/page-content` | GET, POST | **NOT BUILT** | `?admin_edit=1` inline editor |
| `/api/admin/settings` | GET, PATCH | EXISTS | Integrations, Header/Footer, AI config |
| `/api/admin/ai-advisor` | POST | EXISTS | `/admin/ai-systems` AI advisor |
| `/api/admin/generate-blog` | POST | EXISTS | Blog post AI generation |
| `/api/admin/seo-analyze` | POST | EXISTS | Trip/blog SEO panel |
| `/api/admin/planner-behavior` | POST | EXISTS | `/admin/ai-systems/planner/behavior` |
| `/api/admin/palisis-import` | POST | EXISTS (mock) | `/admin/palisis` import |
| `/api/admin/palisis-availability` | POST | EXISTS (mock) | `/admin/palisis` availability sync |
| `/api/admin/regiondo-import` | POST | EXISTS | `/admin/regiondo` DMO catalog import |
| `/api/admin/regiondo-logs` | GET | EXISTS | `/admin/regiondo` import history |
| `/api/upload` | POST | EXISTS | Trip image upload, file attachments |
| `/api/webhooks/palisis` | POST | **NOT BUILT** | Palisis push webhook receiver |

### Frontend Routes Summary

| Route | Method(s) | Status | Used By |
|---|---|---|---|
| `/api/weather` | GET | EXISTS | Homepage widget, AI planner |
| `/api/trips` | GET | EXISTS | External AI agents, public catalog |
| `/api/blog` | GET | EXISTS | `/blog` index page |
| `/api/blog/[slug]` | GET | EXISTS | `/blog/[slug]` post page |
| `/api/planner` | POST | EXISTS | `/planner` AI chat |
| `/api/trip-chat` | POST | EXISTS | `/trip/[id]` chat widget |
| `/api/help-chat` | POST | EXISTS | `/help` chat widget |
| `/api/itinerary` | POST | EXISTS | Itinerary result view |
| `/api/google-reviews` | GET | EXISTS (bug) | Homepage reviews widget |
| `/api/mapbox-token` | GET | EXISTS | Sightseeing map component |
| `/api/careers/apply` | POST | EXISTS | `/careers` apply form |
| `/api/feedback` | POST | EXISTS | Feedback widget |
| `/api/pitch-pdf` | POST | EXISTS | Internal pitch deck |

---

## APIs That Need Database Connection

When the PostgreSQL database is connected, the following existing routes must be re-pointed from the in-memory `lib/admin-store.ts` functions to SQL queries. No route signature changes required — only the handler internals change.

| Route | Current data source | Target data source |
|---|---|---|
| `GET /api/admin/trips` | `listTrips()` in-memory | `SELECT * FROM trips` |
| `POST /api/admin/trips` | `createTrip()` in-memory | `INSERT INTO trips` |
| `GET /api/admin/trips/[id]` | `getTrip()` in-memory | `SELECT * FROM trips WHERE id = $1` |
| `PATCH /api/admin/trips/[id]` | `updateTrip()` in-memory | `UPDATE trips SET ... WHERE id = $1` |
| `DELETE /api/admin/trips/[id]` | `deleteTrip()` in-memory | `DELETE FROM trips WHERE id = $1` |
| `GET /api/admin/posts` | `listPosts()` in-memory | `SELECT * FROM blog_posts` |
| `POST /api/admin/posts` | `createPost()` in-memory | `INSERT INTO blog_posts` |
| `GET /api/admin/posts/[id]` | `getPost()` in-memory | `SELECT * FROM blog_posts WHERE id = $1` |
| `PATCH /api/admin/posts/[id]` | `updatePost()` in-memory | `UPDATE blog_posts SET ... WHERE id = $1` |
| `DELETE /api/admin/posts/[id]` | `deletePost()` in-memory | `DELETE FROM blog_posts WHERE id = $1` |
| `GET /api/admin/jobs` | `listJobs()` in-memory | `SELECT * FROM jobs` |
| `POST /api/admin/jobs` | `createJob()` in-memory | `INSERT INTO jobs` |
| `GET /api/admin/jobs/[id]` | `getJob()` in-memory | `SELECT * FROM jobs WHERE id = $1` |
| `PATCH /api/admin/jobs/[id]` | `updateJob()` in-memory | `UPDATE jobs SET ... WHERE id = $1` |
| `DELETE /api/admin/jobs/[id]` | `deleteJob()` in-memory | `DELETE FROM jobs WHERE id = $1` |
| `GET /api/admin/applications` | `listApplications()` in-memory | `SELECT * FROM job_applications` |
| `PATCH /api/admin/applications` | `updateApplication()` in-memory | `UPDATE job_applications SET ... WHERE id = $1` |
| `DELETE /api/admin/applications` | `deleteApplication()` in-memory | `DELETE FROM job_applications WHERE id = $1` |
| `GET /api/admin/help` | `listHelpArticles()` in-memory | `SELECT * FROM help_articles` |
| `POST /api/admin/help` | `createHelpArticle()` in-memory | `INSERT INTO help_articles` |
| `PATCH /api/admin/help/[id]` | `updateHelpArticle()` in-memory | `UPDATE help_articles SET ... WHERE id = $1` |
| `DELETE /api/admin/help/[id]` | `deleteHelpArticle()` in-memory | `DELETE FROM help_articles WHERE id = $1` |
| `GET /api/admin/tickets` | `listTickets()` in-memory | `SELECT * FROM support_tickets` |
| `POST /api/admin/tickets` | `createTicket()` in-memory | `INSERT INTO support_tickets` |
| `PATCH /api/admin/tickets/[id]` | `updateTicket()` in-memory | `UPDATE support_tickets SET ... WHERE id = $1` |
| `DELETE /api/admin/tickets/[id]` | `deleteTicket()` in-memory | `DELETE FROM support_tickets WHERE id = $1` |
| `POST /api/admin/tickets/[id]/replies` | `addTicketReply()` in-memory | `INSERT INTO ticket_replies` |
| `GET /api/admin/settings` | `getSettings()` in-memory | Multiple DB table reads |
| `PATCH /api/admin/settings` | `updateApiKeys()` etc in-memory | Multiple DB table updates |
| `POST /api/careers/apply` | `createApplication()` in-memory | `INSERT INTO job_applications` |
| `GET /api/blog` | `listPosts()` in-memory | `SELECT * FROM blog_posts WHERE status = 'published'` |
| `GET /api/blog/[slug]` | `getPostBySlug()` in-memory | `SELECT * FROM blog_posts WHERE slug = $1` |
| `POST /api/admin/ai-advisor` | `listTrips()`, `listPosts()` in-memory | DB queries for context |
| `POST /api/planner` | `trips` from `lib/data.ts` | DB query for published trips |
| `POST /api/help-chat` | `listHelpArticles()` in-memory | `SELECT * FROM help_articles WHERE status = 'published'` |
