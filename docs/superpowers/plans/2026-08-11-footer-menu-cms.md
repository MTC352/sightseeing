# Footer Menu CMS + Affiliate Page Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the site footer menu fully admin-editable (add/remove/reorder/rename groups & items, custom URLs, external flag, per-item hide), and have hidden affiliate pages return 404 (admins preview) — all server-rendered so there is no first-paint flash.

**Architecture:** A single JSONB document lives in the existing `integrations` table (`key='footer_menu'`). A pure, unit-tested `normalizeFooterMenu()` guards both read and write. The footer (async server component) resolves the menu server-side before render (code default only when the row is missing). The 5 affiliate page routes guard on the same document via `pageKey`. Admin edits through a new "Footer Menu" panel on the existing header-footer settings page.

**Tech Stack:** Next.js 16 App Router (React 19 server + client components), TypeScript, Tailwind, Postgres (`lib/db`), `node --test` for pure-logic units.

## Global Constraints

- **No schema migration** — reuse the existing `integrations` table (JSONB `meta`), same pattern as `site_protection`. If any step is tempted to add a table/column, STOP: the design forbids it.
- **No data migration** — the default menu is code-seeded (`FOOTER_MENU_DEFAULT`); the row is created on first admin Save. A one-time seed is documented as a guide only (`docs/footer-menu-seed.md`), never a migration.
- **No first-paint flash** — the footer MUST stay an async server component that `await`s the menu before rendering. Never fetch the menu from a client component / `useEffect`.
- **Fail-open** — any read/parse error resolves to `FOOTER_MENU_DEFAULT` (footer) or "not hidden" (affiliate guard). The footer must never crash or 404 a page due to a settings glitch.
- **`pageKey` is not admin-editable** — it is `travel|flights|trains|cars|hotels` on the 5 seeded affiliate items and `null` on every other/new item. The admin editor never sets it.
- Affiliate page keys (verbatim): `travel` (`/travel`, "Vacation Aggregator"), `flights` (`/flights`), `trains` (`/trains`), `cars` (`/cars`), `hotels` (`/hotels`).

---

### Task 1: Types + default menu document

**Files:**
- Create: `lib/footer-menu-types.ts`
- Create: `lib/footer-menu-default.ts`

**Interfaces:**
- Consumes: nothing (dependency-free).
- Produces:
  - `type AffiliatePageKey = "travel" | "flights" | "trains" | "cars" | "hotels"`
  - `interface FooterItem { id: string; label: string; href: string; external?: boolean; hidden?: boolean; pageKey?: AffiliatePageKey | null }`
  - `interface FooterGroup { id: string; title: string; items: FooterItem[] }`
  - `interface FooterMenu { groups: FooterGroup[] }`
  - `const FOOTER_MENU_DEFAULT: FooterMenu`

- [ ] **Step 1: Write the types module**

Create `lib/footer-menu-types.ts`:

```typescript
export type AffiliatePageKey = "travel" | "flights" | "trains" | "cars" | "hotels"

export const AFFILIATE_PAGE_KEYS: AffiliatePageKey[] = ["travel", "flights", "trains", "cars", "hotels"]

export interface FooterItem {
  id: string
  label: string
  href: string
  external?: boolean
  hidden?: boolean
  /** Set only on the 5 seeded affiliate items; null everywhere else. Not admin-editable. */
  pageKey?: AffiliatePageKey | null
}

export interface FooterGroup {
  id: string
  title: string
  items: FooterItem[]
}

export interface FooterMenu {
  groups: FooterGroup[]
}
```

- [ ] **Step 2: Write the default document**

Create `lib/footer-menu-default.ts` — the current hardcoded `LINKS` (from `components/site-footer.tsx`) reshaped, with stable ids and `pageKey` on the affiliate items. Copy the labels/hrefs EXACTLY as they exist today (including the "Vacation Agregator" spelling is corrected to "Vacation Aggregator" per the design; keep all other labels verbatim):

```typescript
import type { FooterMenu } from "@/lib/footer-menu-types"

export const FOOTER_MENU_DEFAULT: FooterMenu = {
  groups: [
    {
      id: "about",
      title: "About sightseeing.lu",
      items: [
        { id: "about-about-us", label: "About us", href: "/about", pageKey: null },
        { id: "about-blog", label: "Blog", href: "/blog", pageKey: null },
        { id: "about-careers", label: "Careers", href: "/careers", pageKey: null },
        { id: "about-contact", label: "Contact", href: "#", pageKey: null },
      ],
    },
    {
      id: "explore",
      title: "Explore",
      items: [
        { id: "explore-all", label: "All Experiences", href: "/explore", pageKey: null },
        { id: "explore-departures", label: "Departures", href: "/departures", pageKey: null },
        { id: "explore-live-tracking", label: "Live Tracking", href: "/live-tracking", pageKey: null },
        { id: "explore-search", label: "Search", href: "/search", pageKey: null },
        { id: "explore-food-events", label: "Food & Events", href: "/experiences/food-events", pageKey: null },
        { id: "explore-tours", label: "Tours", href: "/experiences/tours", pageKey: null },
        { id: "explore-sports-nature", label: "Sports & Nature", href: "/experiences/sports-nature", pageKey: null },
        { id: "explore-culture", label: "Culture", href: "/experiences/culture", pageKey: null },
        { id: "explore-private-tours", label: "Private Tours", href: "/experiences/private-tours", pageKey: null },
        { id: "explore-cfl", label: "CFL Sightseeing", href: "/cfl-sightseeing", pageKey: null },
      ],
    },
    {
      id: "plan",
      title: "Plan Your Trip",
      items: [
        { id: "plan-planner", label: "AI Trip Planner", href: "/planner", pageKey: null },
        { id: "plan-travel", label: "Vacation Aggregator", href: "/travel", pageKey: "travel" },
        { id: "plan-flights", label: "Flights", href: "/flights", pageKey: "flights" },
        { id: "plan-trains", label: "Trains", href: "/trains", pageKey: "trains" },
        { id: "plan-cars", label: "Cars", href: "/cars", pageKey: "cars" },
        { id: "plan-hotels", label: "Hotels", href: "/hotels", pageKey: "hotels" },
        { id: "plan-my-trips", label: "My Trips", href: "/my-trips", pageKey: null },
      ],
    },
    {
      id: "support",
      title: "Support",
      items: [
        { id: "support-help", label: "Help & FAQ", href: "/help", pageKey: null },
        { id: "support-emergency", label: "Emergency & 24/7 Support", href: "/emergency", pageKey: null },
        { id: "support-sitemap", label: "Sitemap", href: "/sitemap.xml", pageKey: null },
        { id: "support-terms", label: "Terms & Conditions", href: "/uploads/1780480029465-u38d41.pdf", external: true, pageKey: null },
        { id: "support-ebike", label: "Ebike Conditions", href: "/uploads/1781248651946-ac09tq.pdf", external: true, pageKey: null },
        { id: "support-privacy", label: "Privacy Policy", href: "https://www.slg.lu/politique-de-confidentialite/", external: true, pageKey: null },
        { id: "support-legal", label: "Legal Notice", href: "/impressum", pageKey: null },
        { id: "support-whistleblower", label: "Whistleblower", href: "https://whistleblowersoftware.com/secure/SLG", external: true, pageKey: null },
      ],
    },
  ],
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -i "footer-menu" | head`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add lib/footer-menu-types.ts lib/footer-menu-default.ts
git commit -m "feat(footer): footer menu types + code-seeded default document"
```

---

### Task 2: Pure `normalizeFooterMenu` + unit tests

**Files:**
- Create: `lib/footer-menu-normalize.ts`
- Create: `test/footer-menu-normalize.test.mjs`
- Modify: `package.json` (pretest compile entry)

**Interfaces:**
- Consumes: types from `@/lib/footer-menu-types`, `FOOTER_MENU_DEFAULT` from `@/lib/footer-menu-default`.
- Produces:
  - `function normalizeFooterMenu(raw: unknown): FooterMenu` — total; any input yields a valid menu; unusable input returns `FOOTER_MENU_DEFAULT`.
  - `function newId(prefix?: string): string` — for the admin UI to mint new ids (uses `crypto.randomUUID()`; NOT called by `normalizeFooterMenu`).

- [ ] **Step 1: Write the failing test**

Create `test/footer-menu-normalize.test.mjs`:

```javascript
import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/footer-menu-normalize.js")
const normalizeFooterMenu = mod.normalizeFooterMenu ?? mod.default?.normalizeFooterMenu
const defMod = await import("../.test-build/footer-menu-default.js")
const FOOTER_MENU_DEFAULT = defMod.FOOTER_MENU_DEFAULT ?? defMod.default?.FOOTER_MENU_DEFAULT

test("passes a valid document through unchanged in shape", () => {
  const out = normalizeFooterMenu(FOOTER_MENU_DEFAULT)
  assert.equal(out.groups.length, FOOTER_MENU_DEFAULT.groups.length)
  assert.equal(out.groups[2].items.find((i) => i.id === "plan-flights").pageKey, "flights")
})

test("returns the default for unusable input", () => {
  for (const bad of [null, undefined, 42, "x", {}, { groups: "nope" }, { groups: [] }]) {
    const out = normalizeFooterMenu(bad)
    assert.ok(Array.isArray(out.groups) && out.groups.length > 0, `bad input ${JSON.stringify(bad)} → default`)
  }
})

test("drops malformed groups/items and coerces fields", () => {
  const out = normalizeFooterMenu({
    groups: [
      { id: "g1", title: "G1", items: [
        { id: "i1", label: "A", href: "/a", external: "yes", hidden: 1 },
        { label: "", href: "/b" },              // empty label → dropped
        { id: "i3", label: "C" },               // missing href → dropped
        "garbage",                               // non-object → dropped
      ]},
      { title: "no id but has items", items: [{ label: "D", href: "/d" }] }, // id filled
      { id: "empty", title: "Empty", items: [] }, // no valid items → dropped
      "notagroup",
    ],
  })
  const g1 = out.groups.find((g) => g.id === "g1")
  assert.ok(g1)
  assert.equal(g1.items.length, 1)
  assert.equal(g1.items[0].external, true) // coerced from truthy
  assert.equal(g1.items[0].hidden, true)
  // group missing id still kept (id filled deterministically) because it has a valid item
  const filled = out.groups.find((g) => g.items.some((i) => i.label === "D"))
  assert.ok(filled && typeof filled.id === "string" && filled.id.length > 0)
  // empty group dropped
  assert.ok(!out.groups.some((g) => g.id === "empty"))
})

test("forces pageKey to null when not a known affiliate key", () => {
  const out = normalizeFooterMenu({ groups: [{ id: "g", title: "G", items: [
    { id: "i", label: "X", href: "/x", pageKey: "evil" },
  ]}]})
  assert.equal(out.groups[0].items[0].pageKey, null)
})

test("default document round-trips (normalize is a no-op on it)", () => {
  const out = normalizeFooterMenu(FOOTER_MENU_DEFAULT)
  const keys = out.groups.flatMap((g) => g.items.map((i) => i.pageKey).filter(Boolean)).sort()
  assert.deepEqual(keys, ["cars", "flights", "hotels", "trains", "travel"])
})
```

- [ ] **Step 2: Add both modules to the pretest compile list**

In `package.json`, append to the `pretest` script (after the last existing `tsc … --esModuleInterop`), one more group that compiles the types + default + normalize together (they import each other):

```
&& tsc lib/footer-menu-types.ts lib/footer-menu-default.ts lib/footer-menu-normalize.ts --rootDir lib --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test 2>&1 | tail -20`
Expected: FAIL — `.test-build/footer-menu-normalize.js` missing.

- [ ] **Step 4: Write the implementation**

Create `lib/footer-menu-normalize.ts`:

```typescript
import type { FooterMenu, FooterGroup, FooterItem, AffiliatePageKey } from "@/lib/footer-menu-types"
import { AFFILIATE_PAGE_KEYS } from "@/lib/footer-menu-types"
import { FOOTER_MENU_DEFAULT } from "@/lib/footer-menu-default"

/** Mint a new id for admin-created groups/items. NOT used by normalize (which
 *  fills missing ids deterministically so it stays pure + testable). */
export function newId(prefix = "item"): string {
  const uuid = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  return `${prefix}-${uuid}`
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function normalizeItem(raw: unknown, gi: number, ii: number): FooterItem | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const label = str(r.label).trim()
  const href = str(r.href).trim()
  if (!label || !href) return null
  const pageKey = AFFILIATE_PAGE_KEYS.includes(r.pageKey as AffiliatePageKey)
    ? (r.pageKey as AffiliatePageKey)
    : null
  const id = str(r.id).trim() || `item-${gi}-${ii}`
  const item: FooterItem = { id, label, href, pageKey }
  if (r.external != null) item.external = !!r.external
  if (r.hidden != null) item.hidden = !!r.hidden
  return item
}

function normalizeGroup(raw: unknown, gi: number): FooterGroup | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const title = str(r.title).trim()
  const rawItems = Array.isArray(r.items) ? r.items : []
  const items = rawItems
    .map((it, ii) => normalizeItem(it, gi, ii))
    .filter((it): it is FooterItem => it !== null)
  if (items.length === 0) return null // drop empty groups
  const id = str(r.id).trim() || `group-${gi}`
  return { id, title: title || `Group ${gi + 1}`, items }
}

/** Coerce any untrusted value into a valid FooterMenu. Unusable → default. */
export function normalizeFooterMenu(raw: unknown): FooterMenu {
  if (!raw || typeof raw !== "object") return FOOTER_MENU_DEFAULT
  const groupsRaw = (raw as Record<string, unknown>).groups
  if (!Array.isArray(groupsRaw)) return FOOTER_MENU_DEFAULT
  const groups = groupsRaw
    .map((g, gi) => normalizeGroup(g, gi))
    .filter((g): g is FooterGroup => g !== null)
  if (groups.length === 0) return FOOTER_MENU_DEFAULT
  return { groups }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test 2>&1 | tail -12`
Expected: PASS — all `footer-menu-normalize` tests green, existing tests unaffected.

- [ ] **Step 6: Commit**

```bash
git add lib/footer-menu-normalize.ts test/footer-menu-normalize.test.mjs package.json
git commit -m "feat(footer): pure normalizeFooterMenu + tests"
```

---

### Task 3: DB read/write + settings exposure

**Files:**
- Modify: `lib/db/queries.ts`

**Interfaces:**
- Consumes: `FooterMenu` from `@/lib/footer-menu-types`, `normalizeFooterMenu` from `@/lib/footer-menu-normalize`, `FOOTER_MENU_DEFAULT` from `@/lib/footer-menu-default`.
- Produces:
  - `async function dbGetFooterMenu(): Promise<FooterMenu | null>` — normalized document, or `null` when the row is missing.
  - `async function dbUpdateFooterMenu(menu: FooterMenu): Promise<FooterMenu>` — upsert normalized document.
  - `dbGetSettings()` includes `footerMenu: FooterMenu`.

- [ ] **Step 1: Add imports at the top of `lib/db/queries.ts`**

```typescript
import type { FooterMenu } from "@/lib/footer-menu-types"
import { normalizeFooterMenu } from "@/lib/footer-menu-normalize"
import { FOOTER_MENU_DEFAULT } from "@/lib/footer-menu-default"
```

- [ ] **Step 2: Add the read/write functions** (place near `dbGetSiteProtection`/`dbUpdateSiteProtection`, mirroring that pattern):

```typescript
/** Footer menu document (integrations row 'footer_menu', JSONB in `meta`).
 *  Returns null when the row is missing so callers apply the code default. */
export async function dbGetFooterMenu(): Promise<FooterMenu | null> {
  const row = await queryOne<{ meta: unknown }>(
    `SELECT meta FROM integrations WHERE key = 'footer_menu'`,
  )
  if (!row || row.meta == null) return null
  return normalizeFooterMenu(row.meta)
}

export async function dbUpdateFooterMenu(menu: FooterMenu): Promise<FooterMenu> {
  const normalized = normalizeFooterMenu(menu)
  await query(
    `INSERT INTO integrations (key, label, value, meta)
     VALUES ('footer_menu', 'Footer Menu', '', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET meta = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify(normalized)],
  )
  return normalized
}
```

- [ ] **Step 3: Expose it in `dbGetSettings()`**

In the `dbGetSettings()` return object (around line 1027), add a `footerMenu` field. Fetch it just before the return:

```typescript
  const footerMenu = (await dbGetFooterMenu().catch(() => null)) ?? FOOTER_MENU_DEFAULT
```

and include `footerMenu` in the returned object literal.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -i "queries.ts\|footer-menu" | head`
Expected: clean (pre-existing unrelated errors elsewhere are fine).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts
git commit -m "feat(footer): dbGetFooterMenu/dbUpdateFooterMenu + settings exposure"
```

---

### Task 4: Server visibility helpers

**Files:**
- Create: `lib/footer-menu.ts`

**Interfaces:**
- Consumes: `dbGetFooterMenu` from `@/lib/db/queries`, `FOOTER_MENU_DEFAULT`, types, `getSession` from `@/lib/auth`.
- Produces:
  - `async function getFooterMenu(): Promise<FooterMenu>` — DB doc or default; fail-open.
  - `async function getViewerFooterMenu(): Promise<FooterMenu>` — same, but for non-admins strips `hidden` items (and now-empty groups). Admins get the full menu.
  - `async function isAffiliatePageHidden(pageKey: AffiliatePageKey): Promise<boolean>` — true iff an item with that `pageKey` is `hidden` AND the viewer is not an admin. Fail-open (false on error).

- [ ] **Step 1: Write the helper**

Create `lib/footer-menu.ts`:

```typescript
import { getSession } from "@/lib/auth"
import { dbGetFooterMenu } from "@/lib/db/queries"
import { FOOTER_MENU_DEFAULT } from "@/lib/footer-menu-default"
import type { FooterMenu, AffiliatePageKey } from "@/lib/footer-menu-types"

/** Raw resolved menu (DB doc or code default). Never throws. */
export async function getFooterMenu(): Promise<FooterMenu> {
  try {
    return (await dbGetFooterMenu()) ?? FOOTER_MENU_DEFAULT
  } catch {
    return FOOTER_MENU_DEFAULT
  }
}

async function viewerIsAdmin(): Promise<boolean> {
  const session = await getSession().catch(() => null)
  return !!session
}

/** Menu as the current viewer should see it. Admins see hidden items (preview);
 *  the public has hidden items (and emptied groups) stripped. */
export async function getViewerFooterMenu(): Promise<FooterMenu> {
  const menu = await getFooterMenu()
  if (await viewerIsAdmin()) return menu
  const groups = menu.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.hidden) }))
    .filter((g) => g.items.length > 0)
  return { groups }
}

/** True when the affiliate page for `pageKey` is hidden from the public. Admins
 *  bypass (preview). Fail-open: never hide on a read error. */
export async function isAffiliatePageHidden(pageKey: AffiliatePageKey): Promise<boolean> {
  try {
    const menu = await getFooterMenu()
    const item = menu.groups.flatMap((g) => g.items).find((i) => i.pageKey === pageKey)
    if (!item?.hidden) return false
    return !(await viewerIsAdmin())
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -i "footer-menu.ts" | head`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/footer-menu.ts
git commit -m "feat(footer): viewer-aware footer menu + affiliate hide helpers"
```

---

### Task 5: Settings API — `footerMenu` section

**Files:**
- Modify: `app/api/admin/settings/route.ts`

**Interfaces:**
- Consumes: `dbUpdateFooterMenu` from `@/lib/db/queries`, `normalizeFooterMenu` from `@/lib/footer-menu-normalize`.

- [ ] **Step 1: Import**

Add near the other imports in `route.ts`:

```typescript
import { dbUpdateFooterMenu } from "@/lib/db/queries"
import { normalizeFooterMenu } from "@/lib/footer-menu-normalize"
```

(If `dbUpdateFooterMenu` isn't already exported via the existing `@/lib/db/queries` import list, add it there instead of a duplicate import.)

- [ ] **Step 2: Expose in GET under the `header-footer` permission**

In the GET permission-filter block, inside `if (perms.includes("header-footer")) { … }`, add:

```typescript
      filtered.footerMenu = full.footerMenu
```

- [ ] **Step 3: Add the PATCH section**

- Extend the `section` union type to include `"footerMenu"`.
- Add to `SECTION_PERMISSION`:

```typescript
  footerMenu: "header-footer",
```

- Add a dispatch branch alongside the others:

```typescript
    } else if (section === "footerMenu") {
      await dbUpdateFooterMenu(normalizeFooterMenu((data as { menu?: unknown }).menu))
```

(`footerMenu` is intentionally NOT added to `SUPERADMIN_ONLY_SECTIONS` — it holds no injectable script, parity with `contactInfo`.)

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -i "settings/route" | head`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/settings/route.ts
git commit -m "feat(footer): admin settings footerMenu section (GET+PATCH)"
```

---

### Task 6: Render the footer from the menu

**Files:**
- Modify: `components/site-footer.tsx`

**Interfaces:**
- Consumes: `getViewerFooterMenu` from `@/lib/footer-menu`.

- [ ] **Step 1: Replace the hardcoded `LINKS` map with the resolved menu**

- Remove the `const LINKS = { … }` object (lines ~8–46).
- Add import: `import { getViewerFooterMenu } from "@/lib/footer-menu"`.
- In `SiteFooter()`, after the `contact` fetch, add:

```typescript
  const menu = await getViewerFooterMenu()
```

- Replace the `Object.entries(LINKS).map(([title, links]) => ( … ))` block with:

```tsx
          {menu.groups.map((group) => (
            <nav key={group.id} aria-label={group.title}>
              <h4 className="text-sm font-semibold text-foreground">{group.title}</h4>
              <ul className="mt-3 flex flex-col gap-2">
                {group.items.map((item) => (
                  <li key={item.id}>
                    {item.external ? (
                      <a href={item.href} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground transition-colors hover:text-primary">{item.label}</a>
                    ) : (
                      <Link href={item.href} className="text-xs text-muted-foreground transition-colors hover:text-primary">{item.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
```

Everything else (logo, contact block, bottom bar) stays. `SiteFooter` remains `export async function`.

- [ ] **Step 2: Typecheck + build**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -i "site-footer" | head` (expect clean), then `pnpm build 2>&1 | grep -iE "error|✓ Compiled" | head` (expect "✓ Compiled successfully").

- [ ] **Step 3: Runtime smoke — footer renders server-side, no flash**

Start a prod server on a free port and confirm the default menu is present in the SSR HTML (proves server-side resolution, no client swap):

```bash
pnpm exec next start -p 5151 >/tmp/fm.log 2>&1 &
SRV=$!; sleep 6
curl -s "http://localhost:5151/about" -o /tmp/fm.html -w "status=%{http_code}\n"
grep -c "Plan Your Trip" /tmp/fm.html      # expect >=1 (group renders in HTML)
grep -c "Vacation Aggregator" /tmp/fm.html # expect >=1 (default label in SSR HTML)
kill $SRV
```

Expected: status 200, both counts ≥ 1 — the menu is in the server HTML (no default→DB client swap possible).

- [ ] **Step 4: Commit**

```bash
git add components/site-footer.tsx
git commit -m "feat(footer): render footer from admin-managed menu (SSR, no flash)"
```

---

### Task 7: Affiliate page 404 guards

**Files:**
- Modify: `app/travel/page.tsx`, `app/flights/page.tsx`, `app/trains/page.tsx`, `app/cars/page.tsx`, `app/hotels/page.tsx`

**Interfaces:**
- Consumes: `isAffiliatePageHidden` from `@/lib/footer-menu`, `notFound` from `next/navigation`.

- [ ] **Step 1: Add the guard to each page** (repeat for all five, substituting the key)

For `app/flights/page.tsx` (key `flights`): add imports and make the component `async` with a guard at the very top of its body. Example — change:

```tsx
export default function FlightsPage() {
```
to:
```tsx
export default async function FlightsPage() {
  if (await isAffiliatePageHidden("flights")) notFound()
```
and add at the top of the file:
```tsx
import { notFound } from "next/navigation"
import { isAffiliatePageHidden } from "@/lib/footer-menu"
```

Apply the identical change to the other four, using their keys:
- `app/travel/page.tsx` → `export default async function TravelPage()` + `if (await isAffiliatePageHidden("travel")) notFound()`
- `app/trains/page.tsx` → `TrainsPage` + `"trains"`
- `app/cars/page.tsx` → `CarsPage` + `"cars"`
- `app/hotels/page.tsx` → `HotelsPage` + `"hotels"`

(These are server components with no `"use client"`, so `async` + `notFound()` is valid. If a page references props, none of these five take props.)

- [ ] **Step 2: Typecheck + build**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -iE "app/(travel|flights|trains|cars|hotels)/page" | head` (expect clean), then `pnpm build 2>&1 | grep -iE "error|✓ Compiled" | head` (expect success; the five routes still build as dynamic `ƒ`).

- [ ] **Step 3: Runtime smoke — hidden page 404s for public**

With no DB row, the pages are visible (default `hidden` is unset). Temporarily seed a hidden flag to verify the guard, then remove it:

```bash
# Public sees /flights normally by default:
pnpm exec next start -p 5152 >/tmp/fm2.log 2>&1 &
SRV=$!; sleep 6
curl -s -o /dev/null -w "flights default=%{http_code}\n" "http://localhost:5152/flights"  # expect 200
kill $SRV
```

Expected: `flights default=200`. (Full hidden-path verification — set `plan-flights.hidden=true` via the admin UI in Task 8, then confirm public 404 + admin 200 — is exercised in Task 8's manual check.)

- [ ] **Step 4: Commit**

```bash
git add app/travel/page.tsx app/flights/page.tsx app/trains/page.tsx app/cars/page.tsx app/hotels/page.tsx
git commit -m "feat(footer): affiliate pages 404 when hidden (admin preview bypass)"
```

---

### Task 8: Admin "Footer Menu" editor

**Files:**
- Modify: `app/admin/header-footer/page.tsx`

**Interfaces:**
- Consumes: `FooterMenu`, `FooterGroup`, `FooterItem` types, `newId` from `@/lib/footer-menu-normalize`, `FOOTER_MENU_DEFAULT` from `@/lib/footer-menu-default`.

- [ ] **Step 1: Add imports + state**

At the top of `app/admin/header-footer/page.tsx` add:

```typescript
import type { FooterMenu, FooterGroup, FooterItem } from "@/lib/footer-menu-types"
import { newId } from "@/lib/footer-menu-normalize"
import { FOOTER_MENU_DEFAULT } from "@/lib/footer-menu-default"
```

Inside `HeaderFooterPage()`, add state next to the others:

```typescript
  const [footerMenu, setFooterMenu] = useState<FooterMenu>(FOOTER_MENU_DEFAULT)
```

- [ ] **Step 2: Load it in the existing settings `useEffect`**

Inside the `.then((s) => { … })` block, add:

```typescript
        if (s?.footerMenu?.groups) setFooterMenu(s.footerMenu as FooterMenu)
```

- [ ] **Step 3: Persist it in `save()`**

Add one more request to the `Promise.all([...])` array:

```typescript
        fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: "footerMenu", data: { menu: footerMenu } }),
        }),
```

- [ ] **Step 4: Add the `FooterMenuEditor` component** (place above `HeaderFooterPage`)

```tsx
function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr
  const next = arr.slice()
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x)
  return next
}

function FooterMenuEditor({ value, onChange }: { value: FooterMenu; onChange: (m: FooterMenu) => void }) {
  const setGroups = (groups: FooterGroup[]) => onChange({ groups })

  const updateGroup = (gi: number, patch: Partial<FooterGroup>) =>
    setGroups(value.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  const updateItem = (gi: number, ii: number, patch: Partial<FooterItem>) =>
    updateGroup(gi, { items: value.groups[gi].items.map((it, i) => (i === ii ? { ...it, ...patch } : it)) })

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Footer Menu</h3>
        <button
          type="button"
          onClick={() => onChange(FOOTER_MENU_DEFAULT)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Reset to default
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Edit footer link groups and items. Hiding an item removes it from the footer; for the
        travel-booking pages (Flights, Trains, Cars, Hotels, Vacation Aggregator) it also makes the page
        return 404 to visitors (admins still see it). Save with the button above.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {value.groups.map((group, gi) => (
          <div key={group.id} className="rounded-lg border border-border/70 bg-background p-3">
            <div className="flex items-center gap-2">
              <input
                value={group.title}
                onChange={(e) => updateGroup(gi, { title: e.target.value })}
                placeholder="Group title"
                className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button type="button" title="Move up" onClick={() => setGroups(move(value.groups, gi, gi - 1))} className="rounded p-1 text-muted-foreground hover:bg-muted">▲</button>
              <button type="button" title="Move down" onClick={() => setGroups(move(value.groups, gi, gi + 1))} className="rounded p-1 text-muted-foreground hover:bg-muted">▼</button>
              <button type="button" title="Delete group" onClick={() => setGroups(value.groups.filter((_, i) => i !== gi))} className="rounded p-1 text-destructive hover:bg-destructive/10">✕</button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {group.items.map((item, ii) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card px-2 py-1.5">
                  <input
                    value={item.label}
                    onChange={(e) => updateItem(gi, ii, { label: e.target.value })}
                    placeholder="Label"
                    className="w-40 rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <input
                    value={item.href}
                    onChange={(e) => updateItem(gi, ii, { href: e.target.value })}
                    placeholder="https://… or /path"
                    className="min-w-[220px] flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={!!item.external} onChange={(e) => updateItem(gi, ii, { external: e.target.checked })} /> External
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={!!item.hidden} onChange={(e) => updateItem(gi, ii, { hidden: e.target.checked })} /> Hidden
                  </label>
                  {item.pageKey && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600" title="Hiding this item also 404s its page">page</span>
                  )}
                  <button type="button" title="Move up" onClick={() => updateGroup(gi, { items: move(group.items, ii, ii - 1) })} className="rounded p-1 text-muted-foreground hover:bg-muted">▲</button>
                  <button type="button" title="Move down" onClick={() => updateGroup(gi, { items: move(group.items, ii, ii + 1) })} className="rounded p-1 text-muted-foreground hover:bg-muted">▼</button>
                  <button type="button" title="Delete item" onClick={() => updateGroup(gi, { items: group.items.filter((_, i) => i !== ii) })} className="rounded p-1 text-destructive hover:bg-destructive/10">✕</button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => updateGroup(gi, { items: [...group.items, { id: newId("item"), label: "New link", href: "/", pageKey: null }] })}
                className="self-start rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                + Add item
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setGroups([...value.groups, { id: newId("group"), title: "New group", items: [{ id: newId("item"), label: "New link", href: "/", pageKey: null }] }])}
          className="self-start rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          + Add group
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Render the editor under the "footer" tab**

In the content area, next to `{tab === "footer" && (<ContactInfoEditor … />)}`, add:

```tsx
          {tab === "footer" && (
            <FooterMenuEditor value={footerMenu} onChange={setFooterMenu} />
          )}
```

- [ ] **Step 6: Typecheck + build**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -i "header-footer/page" | head` (expect clean), then `pnpm build 2>&1 | grep -iE "error|✓ Compiled" | head` (expect success).

- [ ] **Step 7: Manual verification (end-to-end)**

Run `pnpm dev` (or `pnpm start`) and, logged in as admin:
1. Admin → Header/Footer → Footer tab: change "Food & Events" URL to `https://new.sightseeing.lu/search?persons=2&tag=food`, tick **Hidden** on "Flights", reorder a group, **Add group** + item, then Save.
2. Frontend `/about` footer: Food & Events points to the custom URL; Flights link is gone for the public; the new group appears; order changed.
3. Visit `/flights` logged OUT (or incognito): returns **404**. Visit `/flights` as **admin**: renders normally (preview), and the Flights footer link is visible to the admin.
4. "Reset to default" restores the original menu after Save.

- [ ] **Step 8: Commit**

```bash
git add app/admin/header-footer/page.tsx
git commit -m "feat(footer): admin Footer Menu editor (groups/items, URL, external, hide)"
```

---

### Task 9: Optional live-seed guide

**Files:**
- Create: `docs/footer-menu-seed.md`

- [ ] **Step 1: Write the guide**

Create `docs/footer-menu-seed.md` documenting that seeding is optional (the app renders the code default until first admin Save), and giving a copy-paste `INSERT`:

```markdown
# Footer Menu — optional live seed

The footer menu renders from the code default (`lib/footer-menu-default.ts`) until an
admin saves the Footer Menu editor (Admin → Header/Footer → Footer). No migration or
data fill is required.

If you want the `integrations.footer_menu` row pre-populated directly in the live DB
(e.g. before handing the editor to a non-technical admin), run this once. Replace the
JSON with the current default from `lib/footer-menu-default.ts` if it has changed.

```sql
INSERT INTO integrations (key, label, value, meta)
VALUES ('footer_menu', 'Footer Menu', '', '<PASTE FOOTER_MENU_DEFAULT AS JSON>'::jsonb)
ON CONFLICT (key) DO UPDATE SET meta = EXCLUDED.meta, updated_at = NOW();
```

To revert to the code default, simply delete the row:

```sql
DELETE FROM integrations WHERE key = 'footer_menu';
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/footer-menu-seed.md
git commit -m "docs(footer): optional live-seed guide for footer_menu row"
```

---

## Final Verification

- [ ] `pnpm test` — all pass (including `footer-menu-normalize`).
- [ ] `pnpm exec tsc --noEmit` — no new errors (pre-existing unrelated errors in `components/chatgpt-widgets/sightseeing-map.tsx` are acceptable).
- [ ] `pnpm build` — production build succeeds.
- [ ] Manual (Task 8 Step 7) passes: custom URL, hide + 404, admin preview, reorder/add, reset.
- [ ] `git status` shows NO changes under any `migrations`/`lib/data-migrations` path (Global Constraint: no migration).

## Self-Review Notes

- **Spec coverage:** types/default (T1); normalize + tests (T2); DB read/write + settings (T3); viewer/affiliate helpers (T4); API section (T5); SSR footer render, no flash (T6); affiliate 404 (T7); full admin editor — add/remove/reorder/rename/URL/external/hide (T8); optional seed guide, no migration (T9). ✓
- **Type consistency:** `FooterMenu`/`FooterGroup`/`FooterItem`/`AffiliatePageKey` defined in T1, consumed unchanged in T2–T8. `normalizeFooterMenu`/`newId` (T2) used in T3/T5/T8. `getViewerFooterMenu`/`isAffiliatePageHidden` (T4) used in T6/T7. ✓
- **No-flash constraint:** footer stays an async server component reading `getViewerFooterMenu()` (T6) — verified in the SSR-HTML smoke check. ✓
- **Migration constraint:** only the existing `integrations` table is used; T9 is a guide, not a migration; Final Verification asserts no migration files. ✓
