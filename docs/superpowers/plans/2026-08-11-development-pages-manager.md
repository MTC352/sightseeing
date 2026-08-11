# Development Pages Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Development Pages" tab (beside Footer Menu in Header & Footer admin) that lists every public page not already in `/admin/pages`, each with an enable/disable toggle; disabled pages return a real 404 to the public while logged-in admins can still preview them.

**Architecture:** A pure registry module (`lib/development-pages.ts`) is the single source of truth for which slugs are governed and for the block/sanitize logic. Visibility state is one JSONB row in the existing `integrations` table (mirroring `footer_menu`) — no DB migration. The existing `/api/admin/settings` section API reads/writes it. The root layout (`app/layout.tsx`), which already runs server-side with the trusted pathname and DB access, enforces the 404. The admin tab is added to the existing Header & Footer page and persists via that page's existing Save button.

**Tech Stack:** Next.js App Router (server components), raw PostgreSQL via `pg`, TypeScript, Node's built-in test runner (`node --test`, `.test.mjs` compiled from TS via the `pretest` step).

## Global Constraints

- **No new DB table or migration.** Persist to the existing `integrations` table via an upsert on `key='page_visibility'`, JSONB payload in the `meta` column. (Matches `dbUpdateFooterMenu`, `lib/db/queries.ts:2028`.)
- **All governed pages default to ENABLED.** "Disabled" means the slug is present in the stored `meta.disabled` array; a missing row means everything is on.
- **Governed slugs (exactly these 9):** `emergency`, `cars`, `flights`, `hotels`, `trains`, `travel`, `widgets`, `impressum`, `privacy`. Do not govern the 12 pages already in `MANAGED_PAGES`, and do not govern dynamic routes.
- **Permission gate:** everything admin-facing sits under the existing `header-footer` permission (same as Footer Menu), enforced by `canAccessPath`/`requireAdminSession`.
- **Admin bypass on the 404 gate:** a request with a valid `admin_session` cookie must still render a disabled page (preview).

---

### Task 1: Registry module + pure helpers (`lib/development-pages.ts`)

**Files:**
- Create: `lib/development-pages.ts`
- Modify: `package.json:10` (add the new file to the `pretest` tsc compile list)
- Test: `test/development-pages.test.mjs`

**Interfaces:**
- Produces:
  - `DEVELOPMENT_PAGES: DevelopmentPage[]` where `interface DevelopmentPage { slug: string; label: string; url: string; description: string }`
  - `DEVELOPMENT_PAGE_SLUGS: Set<string>`
  - `topLevelSlug(pathname: string): string`
  - `sanitizeDisabledSlugs(input: unknown): string[]` — keeps only governed slugs, de-duplicated, order-stable
  - `isDevPageBlocked(pathname: string, disabled: Iterable<string>, isAdmin: boolean): boolean`

- [ ] **Step 1: Write the failing test**

Create `test/development-pages.test.mjs`:

```js
import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/development-pages.js")
const {
  DEVELOPMENT_PAGES,
  DEVELOPMENT_PAGE_SLUGS,
  topLevelSlug,
  sanitizeDisabledSlugs,
  isDevPageBlocked,
} = mod.default ?? mod

test("registry lists exactly the 9 governed pages", () => {
  const slugs = DEVELOPMENT_PAGES.map((p) => p.slug).sort()
  assert.deepEqual(slugs, ["cars", "emergency", "flights", "hotels", "impressum", "privacy", "trains", "travel", "widgets"])
  assert.equal(DEVELOPMENT_PAGE_SLUGS.size, 9)
})

test("topLevelSlug extracts the first path segment", () => {
  assert.equal(topLevelSlug("/emergency"), "emergency")
  assert.equal(topLevelSlug("/emergency/anything"), "emergency")
  assert.equal(topLevelSlug("/"), "")
  assert.equal(topLevelSlug(""), "")
})

test("sanitizeDisabledSlugs keeps only governed slugs, deduped", () => {
  assert.deepEqual(sanitizeDisabledSlugs(["emergency", "emergency", "cars"]), ["emergency", "cars"])
  assert.deepEqual(sanitizeDisabledSlugs(["about", "evil", 42, null, "hotels"]), ["hotels"])
  assert.deepEqual(sanitizeDisabledSlugs("nonsense"), [])
  assert.deepEqual(sanitizeDisabledSlugs(undefined), [])
})

test("isDevPageBlocked: governed + disabled + non-admin → true", () => {
  assert.equal(isDevPageBlocked("/emergency", ["emergency"], false), true)
})

test("isDevPageBlocked: admin always bypasses", () => {
  assert.equal(isDevPageBlocked("/emergency", ["emergency"], true), false)
})

test("isDevPageBlocked: enabled (not in disabled set) → false", () => {
  assert.equal(isDevPageBlocked("/emergency", [], false), false)
  assert.equal(isDevPageBlocked("/emergency", ["cars"], false), false)
})

test("isDevPageBlocked: non-governed page → false even if listed", () => {
  assert.equal(isDevPageBlocked("/about", ["about"], false), false)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test 2>&1 | grep -A2 development-pages`
Expected: FAIL — cannot find `../.test-build/development-pages.js` (module not built / not created).

- [ ] **Step 3: Create the registry module**

Create `lib/development-pages.ts`:

```ts
/**
 * lib/development-pages.ts
 * Single source of truth for the "Development Pages" admin tab and the
 * public-facing 404 gate in app/layout.tsx.
 *
 * These are static public routes (app/<slug>/page.tsx) that are NOT in the
 * hardcoded MANAGED_PAGES list on /admin/pages, so before this module they were
 * unmanageable. All default to ENABLED; a slug is "disabled" only when it
 * appears in the stored integrations row 'page_visibility'.meta.disabled.
 */
export interface DevelopmentPage {
  /** Top-level route segment, e.g. "emergency" for /emergency. */
  slug: string
  label: string
  url: string
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

export const DEVELOPMENT_PAGE_SLUGS: Set<string> = new Set(DEVELOPMENT_PAGES.map((p) => p.slug))

/** First path segment of a pathname ("/emergency/x" → "emergency", "/" → ""). */
export function topLevelSlug(pathname: string): string {
  return pathname.split("/")[1] ?? ""
}

/** Keep only governed slugs, de-duplicated and order-stable. Ignores anything else. */
export function sanitizeDisabledSlugs(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of input) {
    if (typeof v === "string" && DEVELOPMENT_PAGE_SLUGS.has(v) && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

/** True when the request must 404: a governed slug, currently disabled, and the
 *  visitor is not an authenticated admin. */
export function isDevPageBlocked(pathname: string, disabled: Iterable<string>, isAdmin: boolean): boolean {
  if (isAdmin) return false
  const slug = topLevelSlug(pathname)
  if (!DEVELOPMENT_PAGE_SLUGS.has(slug)) return false
  return new Set(disabled).has(slug)
}
```

- [ ] **Step 4: Add the module to the `pretest` build**

In `package.json:10`, extend the final `tsc` invocation (the one ending `lib/footer-menu-normalize.ts --rootDir lib --outDir .test-build ...`) to also compile the new file. Change:

```
tsc lib/footer-menu-types.ts lib/footer-menu-default.ts lib/footer-menu-normalize.ts --rootDir lib --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop
```

to:

```
tsc lib/footer-menu-types.ts lib/footer-menu-default.ts lib/footer-menu-normalize.ts lib/development-pages.ts --rootDir lib --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test 2>&1 | grep -A2 development-pages`
Expected: all `development-pages` tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/development-pages.ts test/development-pages.test.mjs package.json
git commit -m "feat(pages): add development-pages registry + block/sanitize helpers"
```

---

### Task 2: DB helpers for page visibility (`lib/db/queries.ts`)

**Files:**
- Modify: `lib/db/queries.ts` (add two functions near `dbGetFooterMenu`/`dbUpdateFooterMenu`, ~line 2037)

**Interfaces:**
- Consumes: `sanitizeDisabledSlugs` (Task 1); existing `query`/`queryOne` helpers in this file.
- Produces:
  - `dbGetDisabledPages(): Promise<string[]>`
  - `dbUpdatePageVisibility(disabled: string[]): Promise<string[]>`

- [ ] **Step 1: Add the import**

At the top of `lib/db/queries.ts`, alongside the other `@/lib/...` imports, add:

```ts
import { sanitizeDisabledSlugs } from "@/lib/development-pages"
```

- [ ] **Step 2: Add the two helpers**

Insert immediately after `dbUpdateFooterMenu` (after `lib/db/queries.ts:2037`):

```ts
// Single `integrations` row (key='page_visibility', JSONB in `meta`) — mirrors
// the footer_menu pattern above. No dedicated table/migration.

/** Disabled development-page slugs (integrations row 'page_visibility',
 *  JSONB meta.disabled). Empty array when the row is missing → all enabled. */
export async function dbGetDisabledPages(): Promise<string[]> {
  const row = await queryOne<{ meta: unknown }>(
    `SELECT meta FROM integrations WHERE key = 'page_visibility'`,
  )
  const disabled = (row?.meta as { disabled?: unknown } | null)?.disabled
  return sanitizeDisabledSlugs(disabled)
}

/** Persist the disabled set (governed slugs only). Returns the cleaned list. */
export async function dbUpdatePageVisibility(disabled: string[]): Promise<string[]> {
  const clean = sanitizeDisabledSlugs(disabled)
  await query(
    `INSERT INTO integrations (key, label, value, meta)
     VALUES ('page_visibility', 'Page Visibility', '', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET meta = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify({ disabled: clean })],
  )
  return clean
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "queries|development-pages" | head`
Expected: no errors referencing these files.

- [ ] **Step 4: Commit**

```bash
git add lib/db/queries.ts
git commit -m "feat(pages): add dbGetDisabledPages / dbUpdatePageVisibility (integrations row)"
```

---

### Task 3: Wire `pageVisibility` into the settings API

**Files:**
- Modify: `lib/db/queries.ts` — `dbGetSettings()` (~886, return statement at ~1032)
- Modify: `app/api/admin/settings/route.ts` — GET permission filter + POST section handler

**Interfaces:**
- Consumes: `dbGetDisabledPages`, `dbUpdatePageVisibility` (Task 2).
- Produces: settings object gains `pageVisibility: { disabled: string[] }`; POST accepts `{ section: "pageVisibility", data: { disabled: string[] } }`.

- [ ] **Step 1: Add `pageVisibility` to `dbGetSettings()`**

In `lib/db/queries.ts`, near where `footerMenu` is resolved before the return (around `lib/db/queries.ts:1030`), add:

```ts
  const disabledPages = await dbGetDisabledPages().catch(() => [] as string[])
```

Then extend the return object (`lib/db/queries.ts:1032`) to include the new field:

```ts
  return { apiKeys, ai, plannerBehavior, itineraryBehavior, seoBehavior, weglot, announcement, contactInfo, importExcludedFields, aiProvider, aiProviderSelected, header: { customHtml: mergeHtml(headerBlocks) }, footer: { customHtml: mergeHtml(footerBlocks) }, footerMenu, pageVisibility: { disabled: disabledPages } }
```

- [ ] **Step 2: Expose it in the GET filter for `header-footer` employees**

In `app/api/admin/settings/route.ts`, inside the existing `if (perms.includes("header-footer")) { ... }` block (the one that already sets `filtered.footerMenu = full.footerMenu`), add:

```ts
      filtered.pageVisibility = full.pageVisibility
```

(Superadmins already receive the whole object, so no change needed there.)

- [ ] **Step 3: Handle the POST section**

In the same file's POST handler, find where sections are dispatched (the `footerMenu` case, which calls `dbUpdateFooterMenu` / `normalizeFooterMenu`). Add an import at the top:

```ts
import { dbUpdatePageVisibility } from "@/lib/db/queries"
```

(Extend the existing `@/lib/db/queries` import list rather than adding a duplicate line.)

Then add a branch alongside the other section handlers, gated by the same `header-footer` permission check that `footerMenu` uses:

```ts
    if (section === "pageVisibility") {
      if (!hasPermission(session.role, session.permissions, "header-footer")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      const disabled = Array.isArray((data as { disabled?: unknown })?.disabled)
        ? ((data as { disabled: unknown[] }).disabled as string[])
        : []
      const saved = await dbUpdatePageVisibility(disabled)
      await logActivity(session, "settings.pageVisibility.update", { disabled: saved })
      return NextResponse.json({ ok: true, pageVisibility: { disabled: saved } })
    }
```

> Note: match the exact control-flow style already in this file — if it uses a `switch (section)` rather than sequential `if`s, add a `case "pageVisibility":` mirroring the `footerMenu` case instead. Read the existing `footerMenu` handler first and copy its shape (permission check, `logActivity` call signature, response shape) exactly.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "settings/route|queries" | head`
Expected: no errors.

- [ ] **Step 5: Manual API smoke test** (dev server running on the configured port)

Log into `/admin` in the browser, then in the browser devtools console on an admin page:

```js
await (await fetch("/api/admin/settings")).json()  // → object contains pageVisibility: { disabled: [] }
await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ section: "pageVisibility", data: { disabled: ["emergency"] } }) }).then(r => r.json())  // → { ok: true, pageVisibility: { disabled: ["emergency"] } }
```

Expected: GET shows the field; POST returns the cleaned disabled list. Reset with `data: { disabled: [] }` afterward.

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries.ts app/api/admin/settings/route.ts
git commit -m "feat(pages): expose + persist pageVisibility via settings API (header-footer gated)"
```

---

### Task 4: Enforce the 404 in the root layout

**Files:**
- Modify: `app/layout.tsx` (imports + gate insertion after `isAdminRoute` is computed, ~line 150)

**Interfaces:**
- Consumes: `isDevPageBlocked` (Task 1), `dbGetDisabledPages` (Task 2), existing `verifySession` from `@/lib/auth`, `pathname`/`isAdminRoute` already computed in the layout, `cookies()` from `next/headers` (already imported).

- [ ] **Step 1: Add imports**

In `app/layout.tsx`, add to the top imports:

```ts
import { notFound } from "next/navigation"
import { verifySession } from "@/lib/auth"
import { isDevPageBlocked } from "@/lib/development-pages"
```

Extend the existing `@/lib/db/queries` import to also pull in `dbGetDisabledPages`:

```ts
import { dbGetInjectionBlocks, dbGetWeglotApiKey, dbGetAnnouncement, dbGetSiteProtection, dbGetCookieSettings, DEFAULT_COOKIE_SETTINGS, dbGetPageContent, dbGetCookiebotId, dbGetDisabledPages } from "@/lib/db/queries"
```

- [ ] **Step 2: Insert the gate right after `isAdminRoute` is set**

Immediately after `const isAdminRoute = pathname.startsWith("/admin")` (`app/layout.tsx:150`), add:

```ts
  // ── Development-page visibility gate (real 404 for disabled pages) ─────────
  // Governed static pages (see lib/development-pages.ts) can be toggled off in
  // Admin → Header & Footer → Development Pages. A disabled page 404s for the
  // public but still renders for a logged-in admin (preview). Only touches the
  // DB when the path is actually a governed slug.
  if (!isAdminRoute) {
    const { topLevelSlug, DEVELOPMENT_PAGE_SLUGS } = await import("@/lib/development-pages")
    if (DEVELOPMENT_PAGE_SLUGS.has(topLevelSlug(pathname))) {
      const adminToken = (await cookies()).get("admin_session")?.value
      const isAdmin = adminToken ? Boolean(await verifySession(adminToken)) : false
      const disabled = await dbGetDisabledPages().catch(() => [] as string[])
      if (isDevPageBlocked(pathname, disabled, isAdmin)) {
        notFound()
      }
    }
  }
```

> The dynamic `import()` keeps `topLevelSlug`/`DEVELOPMENT_PAGE_SLUGS` local to this block; alternatively add them to the static `@/lib/development-pages` import at the top alongside `isDevPageBlocked` and drop the inline import — either is fine, pick one and keep it consistent.

- [ ] **Step 3: Verify the admin_session cookie name**

Run: `grep -rn '"admin_session"' proxy.ts lib/auth.ts | head`
Expected: confirms the cookie is named `admin_session` (used in `proxy.ts:57`). If the name differs, use the confirmed name in Step 2.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "layout" | head`
Expected: no errors.

- [ ] **Step 5: Manual verification**

With the dev server running and `emergency` disabled (via the API smoke test in Task 3, Step 5):
- Private/incognito window (not logged in) → load `/emergency` → **404**.
- Logged-in admin browser → load `/emergency` → page still renders.
- Re-enable (`disabled: []`) → `/emergency` returns 200 for the public.

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(pages): 404 disabled development pages in root layout (admin preview bypass)"
```

---

### Task 5: "Development Pages" admin tab (`app/admin/header-footer/page.tsx`)

**Files:**
- Modify: `app/admin/header-footer/page.tsx` (TabKey type, tab list, state, load, save, render, new editor component)

**Interfaces:**
- Consumes: `DEVELOPMENT_PAGES` (Task 1); the page's existing `save()` and settings `fetch` flow; the `pageVisibility` settings section (Task 3).

- [ ] **Step 1: Extend the tab type and add the icon import**

- Change `type TabKey = Section | "footer-menu"` (`app/admin/header-footer/page.tsx:24`) to:

```ts
type TabKey = Section | "footer-menu" | "pages"
```

- Add `FileText` to the existing `lucide-react` import block (top of file).

- [ ] **Step 2: Add state and hydrate it from the settings fetch**

- Near the other `useState` declarations (~`app/admin/header-footer/page.tsx:782`, next to `footerMenu`), add:

```ts
  const [disabledPages, setDisabledPages] = useState<string[]>([])
```

- In the settings `fetch("/api/admin/settings")` `.then(...)` handler (~line 789–828, where it does `if (s?.footerMenu?.groups) setFooterMenu(...)`), add:

```ts
        if (Array.isArray(s?.pageVisibility?.disabled)) setDisabledPages(s.pageVisibility.disabled as string[])
```

- [ ] **Step 3: Persist in `save()`**

In `save()` (~`app/admin/header-footer/page.tsx:832`), alongside the other `fetch("/api/admin/settings", { method: "POST", ... })` calls (e.g. the `footerMenu` one), add another POST:

```ts
        fetch("/api/admin/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ section: "pageVisibility", data: { disabled: disabledPages } }),
        }),
```

(Match how the surrounding calls are collected — if they are gathered into a `Promise.all([...])`, add this call as another array element with the same shape.)

- [ ] **Step 4: Add the tab button**

In the tab list array (~`app/admin/header-footer/page.tsx:940`, where `{ key: "footer-menu", label: "Footer Menu", Icon: ListTree }` is defined), add after it:

```ts
          { key: "pages", label: "Development Pages", Icon: FileText },
```

- [ ] **Step 5: Render the editor for the new tab**

In the tab-content conditional (~`app/admin/header-footer/page.tsx:981`, `{tab === "footer-menu" ? <FooterMenuEditor .../> : ...}`), add a branch so that when `tab === "pages"` it renders:

```tsx
          {tab === "pages" ? (
            <DevelopmentPagesEditor value={disabledPages} onChange={setDisabledPages} />
          ) : null}
```

(Slot this into the existing conditional chain consistently with how `footer-menu` and the `header`/`footer` tabs are branched — read the surrounding JSX and match its structure.)

- [ ] **Step 6: Add the `DevelopmentPagesEditor` component**

Near `FooterMenuEditor` (~`app/admin/header-footer/page.tsx:653`), add. Ensure `DEVELOPMENT_PAGES` is imported at the top: `import { DEVELOPMENT_PAGES } from "@/lib/development-pages"`.

```tsx
function DevelopmentPagesEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const disabled = new Set(value)
  const toggle = (slug: string) => {
    const next = new Set(value)
    if (next.has(slug)) next.delete(slug)
    else next.add(slug)
    onChange([...next])
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
        <span className="font-semibold">Enabled pages</span> are public. <span className="font-semibold">Disabled pages</span> return a 404 to visitors (you, as an admin, can still preview them). Click <span className="font-semibold">Save</span> to apply.
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {DEVELOPMENT_PAGES.map((p) => {
          const isEnabled = !disabled.has(p.slug)
          return (
            <div key={p.slug} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{p.label}</p>
                <p className="truncate text-[11px] text-muted-foreground">{p.url} — {p.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a href={p.url} target="_blank" rel="noopener noreferrer" title="Preview" className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground">
                  <Eye className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => toggle(p.slug)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${isEnabled ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                >
                  {isEnabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {isEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

(`Eye`/`EyeOff` are already imported at the top of this file.)

- [ ] **Step 7: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "header-footer" | head`
Expected: no errors.

- [ ] **Step 8: Manual UI verification**

- Log into `/admin`, open **Header & Footer**, confirm a **Development Pages** tab appears beside Footer Menu.
- All 9 pages show as **Enabled**.
- Toggle **Emergency** → **Disabled**, click **Save** (top of page). Reload the tab; Emergency is still Disabled (persisted).
- Follow Task 4, Step 5 to confirm the public 404 / admin preview behavior end-to-end.

- [ ] **Step 9: Commit**

```bash
git add app/admin/header-footer/page.tsx
git commit -m "feat(pages): Development Pages tab in Header & Footer admin"
```

---

## Self-Review

**Spec coverage:**
- Registry of governed pages → Task 1. ✅
- Storage in `integrations` row, no migration → Task 2. ✅
- Settings API read/write, header-footer gated → Task 3. ✅
- 404 enforcement + admin preview bypass in layout → Task 4. ✅
- Admin tab beside Footer Menu with toggles + Save → Task 5. ✅
- Verification steps → present in Tasks 3–5 and mirror the spec's verification section. ✅

**Type consistency:** `dbGetDisabledPages`/`dbUpdatePageVisibility` (Task 2) are consumed with identical names in Tasks 3–4. `isDevPageBlocked(pathname, disabled, isAdmin)`, `topLevelSlug`, `DEVELOPMENT_PAGE_SLUGS`, `sanitizeDisabledSlugs`, `DEVELOPMENT_PAGES` (Task 1) are consumed with matching signatures in Tasks 2, 4, 5. Settings shape `pageVisibility: { disabled: string[] }` is written in Task 3 and read in Task 5. ✅

**Placeholder scan:** No TBD/TODO; every code step has concrete content. The two "match the existing style" notes (Task 3 Step 3, Task 5 Steps 3/5) are deliberate instructions to conform to surrounding code whose exact control-flow shape must be read at implementation time — each still specifies the exact permission check, function call, and response shape to produce. ✅

## Notes for the implementer

- **Read before editing the settings route and the header-footer save flow.** Both files have an established shape (switch vs. sequential-if for sections; `Promise.all` vs. sequential awaits for saves). Copy the neighboring `footerMenu` handling exactly rather than inventing a new structure.
- **No migration to run.** The `page_visibility` row is created on first Save; a fresh environment with no row treats every page as enabled.
- **Cache:** the root layout is already dynamic (reads cookies + DB), so adding the gate introduces no static-rendering regression for these low-traffic pages.
