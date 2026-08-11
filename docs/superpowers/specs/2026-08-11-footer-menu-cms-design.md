# Footer Menu CMS + Affiliate Page Visibility — Design

**Date:** 2026-08-11
**Routes affected:** site footer (all pages), `/travel` `/flights` `/trains` `/cars` `/hotels`, admin `header-footer` page
**Status:** Approved-in-progress design (pending final spec review)

## Problem

Today the site footer's link groups are a **hardcoded** `LINKS` object in
`components/site-footer.tsx` (no admin control). The client wants admins to:

1. **Manage the footer menu fully** — add / remove / reorder / rename groups and
   items, override any item's URL with a custom link (e.g. change "Food & Events"
   from `/experiences/food-events` to `https://new.sightseeing.lu/search?persons=2&tag=food`),
   toggle an item's `external` flag, and hide individual items.
2. **Hide the 5 affiliate pages** (Vacation Aggregator `/travel`, Flights, Trains,
   Cars, Hotels) so a hidden page is dropped from the footer **and returns 404** to
   visitors — while logged-in admins still see the page and its footer link (preview).

## Decisions (confirmed with the user)

- **Full menu editor** — add/remove/reorder groups & items, edit label, URL,
  `external`, and per-item hide. (Not just href/hide overrides.)
- **All footer items** get the controls (including legal links; admin's responsibility).
- Hidden affiliate pages **return 404** with **admin preview bypass**.
- **sitemap.xml** stays as-is this pass. The **top navbar** is untouched.
- **No first-paint glitch:** the footer is resolved server-side before render; the
  browser never shows the default and then swaps to the DB menu.
- **Migrations policy:** create a schema migration only if the DB design changes;
  for one-time data fills provide a written **guide** (applied directly in live),
  not a data migration.

## No first-paint flash — how it's guaranteed

`SiteFooter` is (and stays) an **async server component**. It `await`s the footer
menu from the DB on the server and emits final HTML — there is no client
`useEffect`/RTK Query fetch for the menu, so there is no "default → DB" swap. The
menu links are plain `<Link>`/`<a>` (not `EditableText`), so front-end Edit Mode does
not re-render them on the client either. The code default is used **only** when the
DB row is absent or a read error occurs — it is a fallback, never a placeholder that
gets replaced on hydration.

## Data model

**One JSONB document**, stored in the existing `integrations` table (no schema
change — same pattern as `site_protection` / `announcement`):

- Row: `key = 'footer_menu'`, `label = 'Footer Menu'`, `meta = <document>::jsonb`.
- Document shape:

```jsonc
{
  "groups": [
    {
      "id": "explore",
      "title": "Explore",
      "items": [
        {
          "id": "explore-food-events",
          "label": "Food & Events",
          "href": "/experiences/food-events",
          "external": false,
          "hidden": false,
          "pageKey": null
        }
        // …
      ]
    },
    {
      "id": "plan",
      "title": "Plan Your Trip",
      "items": [
        { "id": "plan-flights", "label": "Flights", "href": "/flights",
          "external": false, "hidden": false, "pageKey": "flights" }
        // …
      ]
    }
  ]
}
```

- **`id`** — stable slug per group/item; generated for new items (e.g.
  `crypto.randomUUID()`), preserved for existing ones so overrides survive re-saves.
- **`pageKey`** — one of `travel | flights | trains | cars | hotels` for the affiliate
  items, else `null`. Drives the 404 guard. Not user-editable in the UI (assigned by
  the seed; new custom items always have `pageKey: null`).
- **`external`** — render as `<a target="_blank" rel="noopener noreferrer">` vs
  Next `<Link>`.
- **`hidden`** — drop from footer for the public; if the item has a `pageKey`, also
  404 that page for the public.

### Default document (code-seeded)

`lib/footer-menu-default.ts` exports `FOOTER_MENU_DEFAULT` — the current hardcoded
`LINKS` reshaped into the document above, with deterministic `id`s and `pageKey` set
on the 5 affiliate items. This is the single source of the default and is returned
whenever the DB row is missing. No data migration seeds it; an **optional guide**
(`docs/footer-menu-seed.md`) documents the exact JSON + an `INSERT` snippet for admins
who want to pre-populate the live row.

### Validation

A pure `normalizeFooterMenu(raw): FooterMenu` (in `lib/footer-menu-normalize.ts`,
dependency-free + unit-tested) coerces an untrusted stored/posted document into the
typed shape: drops malformed groups/items, ensures required string fields, coerces
booleans, fills missing `id`s, clamps to sane sizes, and returns the default if the
input is unusable. Both the read path and the write path run through it, so the footer
can never crash on bad data.

## Components

### New

- `lib/footer-menu-types.ts` — `FooterMenu`, `FooterGroup`, `FooterItem`,
  `AffiliatePageKey` types. Dependency-free (client + server importable).
- `lib/footer-menu-normalize.ts` — pure `normalizeFooterMenu()` + `newId()` helper.
  Dependency-free, unit-tested.
- `lib/footer-menu-default.ts` — `FOOTER_MENU_DEFAULT` (reshaped current `LINKS`).
- `lib/footer-menu.ts` — server helpers:
  - `getFooterMenu(): Promise<FooterMenu>` — `dbGetFooterMenu()` → normalize → default
    fallback. Fail-open.
  - `getViewerFooterMenu(): Promise<FooterMenu>` — `getFooterMenu()` then, for
    non-admins, filters out `hidden` items (and empty groups). Admins get the full
    menu (preview). Uses `getSession()` for the admin check (mirrors `isPlannerHidden`).
  - `isAffiliatePageHidden(pageKey): Promise<boolean>` — true when an item with that
    `pageKey` is `hidden` **and** the viewer is not an admin. Used by page guards.
- `docs/footer-menu-seed.md` — the optional live-seed guide (default JSON + INSERT).

### Modified — DB (`lib/db/queries.ts`)

- `dbGetFooterMenu(): Promise<FooterMenu | null>` — reads `integrations` `footer_menu`
  `meta`; returns `null` when the row is missing (caller applies the default).
- `dbUpdateFooterMenu(menu: FooterMenu): Promise<FooterMenu>` — upsert
  `INSERT … ON CONFLICT (key) DO UPDATE` writing the normalized document to `meta`.
- `dbGetSettings()` — add `footerMenu: (await dbGetFooterMenu()) ?? FOOTER_MENU_DEFAULT`
  to the returned object, exposed to the admin GET.

### Modified — Settings API (`app/api/admin/settings/route.ts`)

- Add `"footerMenu"` to the section union.
- GET: expose `filtered.footerMenu = full.footerMenu` under the `header-footer`
  permission.
- PATCH: `SECTION_PERMISSION.footerMenu = "header-footer"`; dispatch
  `else if (section === "footerMenu") await dbUpdateFooterMenu(normalizeFooterMenu(data.menu))`.
  Not superadmin-only (parity with `contactInfo`).

### Modified — Footer (`components/site-footer.tsx`)

- Replace the hardcoded `LINKS` map with `const menu = await getViewerFooterMenu()`
  and render `menu.groups` → items, honoring `href`, `external`, and (already filtered)
  visibility. Remains an async server component. Contact block unchanged.

### Modified — Affiliate pages (`app/{travel,flights,trains,cars,hotels}/page.tsx`)

- At the top of each server component:
  `import { notFound } from "next/navigation"` +
  `if (await isAffiliatePageHidden("<key>")) notFound()`.
  (Make the component `async` if it isn't already.)

### Modified — Admin UI (`app/admin/header-footer/page.tsx`)

- New **"Footer Menu"** card/section:
  - Loads `s.footerMenu` from the existing `/api/admin/settings` GET into state.
  - Renders groups (title input, ▲▼ reorder, delete, "Add group") and, within each,
    items (label input, URL input, `external` checkbox, `Hide` checkbox, ▲▼ reorder,
    delete, "Add item").
  - "Reset footer menu to default" (loads `FOOTER_MENU_DEFAULT` into state; persists
    on Save).
  - Reorder via ▲▼ buttons (not drag-drop) for reliability.
  - Save posts `{ section: "footerMenu", data: { menu } }` alongside the page's
    existing PATCH calls; `id`/`pageKey` preserved for existing items, `newId()` +
    `pageKey: null` for new ones.

## Data flow

```
integrations(footer_menu).meta ─┐
   (or code default if absent)  ├─► getFooterMenu() → normalize
                                 │       │
                                 │       ├─► getViewerFooterMenu() ──► <SiteFooter/> (SSR, admin sees hidden)
                                 │       └─► isAffiliatePageHidden(key) ──► affiliate page notFound() guard
Admin "Footer Menu" editor ──PATCH footerMenu──► dbUpdateFooterMenu(normalize) ─► same row
```

## Error handling

- `getFooterMenu()` never throws — DB error or malformed data → `FOOTER_MENU_DEFAULT`.
- `normalizeFooterMenu()` is total: any input yields a valid `FooterMenu`.
- Affiliate guard fail-open: on any read error the page renders (never 404 due to a
  settings glitch).
- PATCH normalizes before persisting, so a malformed admin payload can't corrupt the
  stored document.

## Testing

- **Unit (node --test):** `normalizeFooterMenu` — valid doc passes; malformed
  groups/items dropped; missing `id`s filled; bad input returns default; `hidden`
  and `external` coerced. Also assert `FOOTER_MENU_DEFAULT` normalizes to itself and
  contains the 5 `pageKey`s.
- **Manual:** admin edits a URL (Food & Events → custom link), hides Flights, reorders
  a group, adds a group/item, resets to default — each reflected on the frontend after
  save. Verify `/flights` 404s for the public but renders for an admin. Verify the
  footer shows the correct menu on first server render (view-source: no default→DB
  swap).
- **Build/type:** `next build` + `tsc` clean.

## Migrations / one-time data

- **No schema migration** — reuses the existing `integrations` table (JSONB `meta`).
- **No data migration** — default is code-seeded; row is created on first admin Save.
- **Guide only:** `docs/footer-menu-seed.md` gives the default JSON + an `INSERT`
  snippet for optionally pre-seeding the live row directly.

## Files touched (summary)

- New: `lib/footer-menu-types.ts`, `lib/footer-menu-normalize.ts`,
  `lib/footer-menu-default.ts`, `lib/footer-menu.ts`,
  `test/footer-menu-normalize.test.mjs`, `docs/footer-menu-seed.md`.
- Modified: `lib/db/queries.ts`, `app/api/admin/settings/route.ts`,
  `components/site-footer.tsx`, `app/admin/header-footer/page.tsx`,
  `app/travel/page.tsx`, `app/flights/page.tsx`, `app/trains/page.tsx`,
  `app/cars/page.tsx`, `app/hotels/page.tsx`, `package.json` (pretest compile entry
  for the normalize unit test).
