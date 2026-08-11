# Development Pages Manager — Design

**Date:** 2026-08-11
**Status:** Approved (design)

## Context

The site has public route pages that exist as code (`app/<slug>/page.tsx`) but are **not**
registered anywhere an admin can manage them. `/emergency` is the motivating example: it
returns HTTP 200 to the public, but it appears in no admin screen, so there is no way to take
it offline.

Two facts drive this:

- **`/admin/pages` is a hardcoded list.** `app/admin/pages/page.tsx` renders a static
  `MANAGED_PAGES` array of 12 pages used only for inline content editing. It is not backed by
  the database and does not scan routes, so pages outside that array are invisible to it.
- **There is no per-page access gate.** `proxy.ts` only guards `/admin/*`. The DB `pages`
  table has a `status` field, but it is not wired to route access. Public route components are
  always reachable. So there is currently **no** way to disable a page like `/emergency`.

The goal: give admins a place to see every public page not already in `/admin/pages` and
toggle each one on/off, where "off" means the public gets a real **404** while a logged-in
admin can still preview it.

## Decisions (locked with the user)

- **Location:** a new **"Development Pages"** tab inside the Header & Footer admin screen
  (`/admin/header-footer`), beside the Footer Menu tab.
- **Scope:** the static public routes **not** in `/admin/pages`' `MANAGED_PAGES`:
  `emergency`, `cars`, `flights`, `hotels`, `trains`, `travel`, `widgets`, `impressum`,
  `privacy`. Dynamic routes (`/trip/[id]`, `/experiences/[slug]`) are excluded — they are not
  standalone dev pages.
- **Disabled behavior:** real **404 Not Found**. Logged-in admins bypass the gate so they can
  still preview/edit a disabled page.
- **No DB migration.** State is a single JSONB row in the existing `integrations` table,
  upserted at runtime on first Save — no schema change to deploy.

## Components

### 1. Registry — `lib/development-pages.ts` (new)

A single source of truth listing the governed pages. Both the admin tab (what to list) and the
404 gate (what to govern) read from it. Adding a future dev page is a one-line change here.

```ts
export interface DevelopmentPage {
  slug: string   // top-level route segment, e.g. "emergency"
  label: string  // human label for the admin row
  url: string    // "/emergency"
  description: string
}

export const DEVELOPMENT_PAGES: DevelopmentPage[] = [
  { slug: "emergency", label: "Emergency", url: "/emergency", description: "Emergency contacts & business hours" },
  { slug: "cars",      label: "Cars",      url: "/cars",      description: "Car rental vertical" },
  { slug: "flights",   label: "Flights",   url: "/flights",   description: "Flights vertical" },
  { slug: "hotels",    label: "Hotels",    url: "/hotels",    description: "Hotels vertical" },
  { slug: "trains",    label: "Trains",    url: "/trains",    description: "Trains vertical" },
  { slug: "travel",    label: "Travel",    url: "/travel",    description: "Travel vertical" },
  { slug: "widgets",   label: "Widgets",   url: "/widgets",   description: "Embeddable widgets demo" },
  { slug: "impressum", label: "Impressum", url: "/impressum", description: "Legal notice (Impressum)" },
  { slug: "privacy",   label: "Privacy",   url: "/privacy",   description: "Privacy policy" },
]

/** Set of governed slugs — for O(1) membership checks in the layout gate. */
export const DEVELOPMENT_PAGE_SLUGS = new Set(DEVELOPMENT_PAGES.map((p) => p.slug))
```

All pages default to **enabled**. "Disabled" is expressed by the slug appearing in the stored
disabled set (below), so a fresh install with no stored row leaves every page on.

### 2. Storage — `integrations` row, mirroring `footer_menu`

No new table. Reuse the exact pattern of `dbGetFooterMenu` / `dbUpdateFooterMenu`
(`lib/db/queries.ts` ~2020–2037): a single `integrations` row `key='page_visibility'` with the
payload in the JSONB `meta` column.

New helpers in `lib/db/queries.ts`:

```ts
/** Disabled dev-page slugs (integrations row 'page_visibility', JSONB meta.disabled).
 *  Empty array when the row is missing → all pages enabled. */
export async function dbGetDisabledPages(): Promise<string[]> {
  const row = await queryOne<{ meta: unknown }>(
    `SELECT meta FROM integrations WHERE key = 'page_visibility'`,
  )
  const disabled = (row?.meta as { disabled?: unknown } | null)?.disabled
  return Array.isArray(disabled) ? disabled.filter((s): s is string => typeof s === "string") : []
}

export async function dbUpdatePageVisibility(disabled: string[]): Promise<string[]> {
  // Only persist slugs we actually govern — ignores anything unknown.
  const clean = [...new Set(disabled)].filter((s) => DEVELOPMENT_PAGE_SLUGS.has(s))
  await query(
    `INSERT INTO integrations (key, label, value, meta)
     VALUES ('page_visibility', 'Page Visibility', '', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET meta = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify({ disabled: clean })],
  )
  return clean
}
```

### 3. Settings API wiring — `app/api/admin/settings/route.ts` + `dbGetSettings`

- `dbGetSettings()` (`queries.ts` ~886, return at ~1032): add `pageVisibility: { disabled }`
  to the returned object (call `dbGetDisabledPages()`), mirroring how `footerMenu` is folded in.
- **GET filter:** under the existing `perms.includes("header-footer")` block, expose
  `filtered.pageVisibility = full.pageVisibility` (same gate as `footerMenu`).
- **PATCH handler:** add an `else if (section === "pageVisibility")` branch that calls
  `dbUpdatePageVisibility(data.disabled)`, gated by the `header-footer` permission — mirroring
  the existing `footerMenu` section handling.

### 4. Admin UI — new tab in `app/admin/header-footer/page.tsx`

- Extend `type TabKey = Section | "footer-menu" | "pages"`.
- Add `{ key: "pages", label: "Development Pages", Icon: FileText }` to the tab list
  (~line 940, beside the `footer-menu` entry). Import `FileText` from `lucide-react`.
- Add state `const [disabledPages, setDisabledPages] = useState<string[]>([])`, hydrated in the
  existing settings `fetch` (~line 789) from `s.pageVisibility?.disabled`.
- In `save()` (~line 832), add a `fetch("/api/admin/settings", { method: PATCH, body:
  JSON.stringify({ section: "pageVisibility", data: { disabled: disabledPages } }) })` call
  alongside the other section saves.
- Render `<DevelopmentPagesEditor value={disabledPages} onChange={setDisabledPages} />` when
  `tab === "pages"`. The component maps `DEVELOPMENT_PAGES` to rows; each row shows the label +
  url, a preview link (`<a href={url} target="_blank">`), and an enabled/disabled toggle built
  from the existing `Eye`/`EyeOff` visual pattern. Toggling adds/removes the slug in the
  `disabled` array. Persisted by the page's existing **Save** button.

### 5. Enforcement (404) — `app/layout.tsx`

The root layout already runs server-side (Node runtime), reads the trusted `pathname`
(`x-pathname` + signature, ~line 145), and performs DB reads (the site-protection password). Add
the gate right after `pathname` / `isAdminRoute` are computed (~line 150):

1. Derive the top-level slug: `const topSlug = pathname.split("/")[1] ?? ""`.
2. If `DEVELOPMENT_PAGE_SLUGS.has(topSlug)` and it's not an admin route:
   - Read disabled set: `const disabled = await dbGetDisabledPages()`.
   - If `disabled.includes(topSlug)`:
     - **Admin bypass:** read the `admin_session` cookie and `verifySession(token)`; if valid,
       skip (admin preview allowed).
     - Otherwise `notFound()` → real HTTP 404.

Notes:
- Governed pages are few and low-traffic, so the extra `dbGetDisabledPages()` read (only when
  the path is a governed slug) is negligible. The layout is already dynamic (reads cookies +
  DB), so no static-rendering regression.
- `verifySession` is a JWT verify (jose), no DB round-trip — cheap and Edge/Node-safe.

## Data flow

```
Admin toggles page off  ──PATCH /api/admin/settings {section:"pageVisibility"}──▶ dbUpdatePageVisibility
                                                                                   └─ integrations row 'page_visibility'.meta.disabled

Public GET /emergency ──▶ proxy sets x-pathname ──▶ app/layout.tsx
                                                      ├─ topSlug="emergency" governed?  yes
                                                      ├─ dbGetDisabledPages() includes it?  yes
                                                      ├─ admin_session valid?  no  ──▶ notFound()  (404)
                                                      └─ admin_session valid?  yes ──▶ render page (preview)
```

## Out of scope

- No changes to the DB `pages` table / CMS or to `/admin/pages`' `MANAGED_PAGES` list.
- No enable/disable for dynamic routes (`/trip/[id]`, `/experiences/[slug]`) or for the 12
  already-managed pages.
- No new DB migration (runtime upsert into an existing table).

## Verification

1. `pnpm dev` (or the running instance on :3001). Log into `/admin`.
2. Open **Header & Footer → Development Pages**. Confirm all 9 pages listed, all enabled.
3. Toggle **Emergency** off, click **Save**.
4. In a private window (not logged in) load `/emergency` → expect **404**.
5. In the admin session, load `/emergency` → still renders (preview bypass).
6. Toggle **Emergency** back on, Save → `/emergency` returns **200** publicly again.
7. Repeat steps 3–6 for a second page (e.g. `/cars`) to confirm it generalizes.
8. Confirm a non-governed page (e.g. `/about`) is unaffected throughout.
