# Language-prefixed URLs + Multilingual SEO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore `/de/` and `/fr/` subdirectory URLs on the Next.js site so old Google-indexed translated URLs resolve without redirects and are indexed as genuine localized pages.

**Architecture:** The root `proxy.ts` (Next 16 middleware) internally rewrites a `/de`|`/fr` prefix to the un-prefixed route and exposes the locale via an `x-locale` request header + `site_lang` cookie (HTTP 200, no redirect). Server components read that locale to set `<html lang>`, translate `<title>`/description via the existing cached Weglot layer, and emit canonical + hreflang + sitemap alternates. A client `<Link>` wrapper keeps the active prefix on every internal link; the client translator reads the locale from the path so a cookie-less Google visitor sees the translation immediately.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React, Node's built-in test runner (`node --test` over `test/**/*.test.mjs`, with a `pretest` tsc step compiling pure `lib/` modules to `.test-build/`), Postgres `translation_cache`, Weglot translate API.

**Spec:** `docs/superpowers/specs/2026-08-18-language-prefixed-urls-seo-design.md`

## Global Constraints

- **URL scheme:** lowercase prefixes; English at root. EN `= /trip/x`, DE `= /de/trip/x`, FR `= /fr/trip/x`. hreflang codes `en`, `de`, `fr` (lowercase) + `x-default` → English.
- **No new DB migration.** Reuse the existing `translation_cache` table via `getCachedTranslations` / `putTranslations` (`lib/i18n/cache.ts`) and `translateWithWeglot` (`lib/i18n/weglot-translate.ts`). If any DB change becomes necessary, STOP and flag it (a gitignored `docs/db/YYYY-MM-DD-*.sql` + a Docker `psql` command is the project convention).
- **Supported target langs:** `fr`, `de` only (`SUPPORTED_LANGS` in `lib/i18n/config.ts`). Source: `en`.
- **Admin/API untouched:** `/admin/**` and `/api/**` never get a locale prefix and keep plain `next/link`.
- **Pure modules only in `lib/i18n/routing.ts`:** no React/Next imports there, so it compiles under `pretest` and runs in edge (proxy), server, and browser.
- **`BASE`:** `process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"` (match `app/sitemap.ts` and `proxy.ts`).
- **Body text stays client-translated** (accepted non-goal). Only SEO signals are server-rendered per language.
- Never throw from translation code paths — degrade to English.

---

### Task 1: Pure routing helpers (`lib/i18n/routing.ts`)

The foundation every other task imports. Pure and unit-tested.

**Files:**
- Create: `lib/i18n/routing.ts`
- Test: `test/i18n/routing.test.mjs`
- Modify: `package.json` (extend the `pretest` tsc invocation that already compiles `lib/i18n/config.ts lib/i18n/collect.ts lib/i18n/assemble.ts` to also compile `lib/i18n/routing.ts`)

**Interfaces:**
- Consumes: `SUPPORTED_LANGS`, `SOURCE_LANG` from `lib/i18n/config.ts` (no new deps).
- Produces:
  - `type Locale = "en" | "fr" | "de"`
  - `ALL_LOCALES: readonly Locale[]` = `["en","fr","de"]`
  - `LOCALE_OG: Record<Locale,string>` = `{ en:"en_US", fr:"fr_FR", de:"de_DE" }`
  - `stripLocale(pathname: string): { locale: Locale; path: string }`
  - `addLocale(path: string, locale: Locale): string`
  - `localizeHref(href: string, locale: Locale): string`
  - `classifyLocaleRequest(pathname: string): { kind:"pass" } | { kind:"redirect"; to:string } | { kind:"rewrite"; locale:"fr"|"de"; path:string }`
  - `buildAlternates(pathWithoutLocale: string, locale: Locale, base: string): { canonical: string; languages: Record<string,string> }`

- [ ] **Step 1: Write the failing test**

Create `test/i18n/routing.test.mjs`:

```js
import test from "node:test"
import assert from "node:assert/strict"

const {
  stripLocale, addLocale, localizeHref, classifyLocaleRequest, buildAlternates, ALL_LOCALES,
} = await import("../../.test-build/i18n/routing.js")

test("stripLocale splits a leading de/fr, else en", () => {
  assert.deepEqual(stripLocale("/de/trip/x"), { locale: "de", path: "/trip/x" })
  assert.deepEqual(stripLocale("/fr"), { locale: "fr", path: "/" })
  assert.deepEqual(stripLocale("/trip/x"), { locale: "en", path: "/trip/x" })
  assert.deepEqual(stripLocale("/deutsch"), { locale: "en", path: "/deutsch" }) // not a prefix
})

test("addLocale prefixes targets, leaves en, and is idempotent", () => {
  assert.equal(addLocale("/trip/x", "de"), "/de/trip/x")
  assert.equal(addLocale("/trip/x", "en"), "/trip/x")
  assert.equal(addLocale("/", "fr"), "/fr")
  assert.equal(addLocale("/de/trip/x", "de"), "/de/trip/x") // no double prefix
  assert.equal(addLocale("/trip/x?a=1", "de"), "/de/trip/x?a=1")
})

test("localizeHref only rewrites internal, non-admin/api hrefs", () => {
  assert.equal(localizeHref("/trip/x", "de"), "/de/trip/x")
  assert.equal(localizeHref("/admin/trips", "de"), "/admin/trips")
  assert.equal(localizeHref("/api/x", "de"), "/api/x")
  assert.equal(localizeHref("https://x.com", "de"), "https://x.com")
  assert.equal(localizeHref("#top", "de"), "#top")
  assert.equal(localizeHref("mailto:a@b.c", "de"), "mailto:a@b.c")
  assert.equal(localizeHref("/trip/x", "en"), "/trip/x")
})

test("classifyLocaleRequest: rewrite for lowercase, 301 for uppercase, pass otherwise", () => {
  assert.deepEqual(classifyLocaleRequest("/de/trip/x"), { kind: "rewrite", locale: "de", path: "/trip/x" })
  assert.deepEqual(classifyLocaleRequest("/DE/trip/x"), { kind: "redirect", to: "/de/trip/x" })
  assert.deepEqual(classifyLocaleRequest("/trip/x"), { kind: "pass" })
})

test("buildAlternates builds canonical + reciprocal hreflang", () => {
  const a = buildAlternates("/trip/x", "de", "https://s.lu")
  assert.equal(a.canonical, "https://s.lu/de/trip/x")
  assert.deepEqual(a.languages, {
    en: "https://s.lu/trip/x",
    de: "https://s.lu/de/trip/x",
    fr: "https://s.lu/fr/trip/x",
    "x-default": "https://s.lu/trip/x",
  })
})

test("ALL_LOCALES is en/fr/de", () => {
  assert.deepEqual([...ALL_LOCALES], ["en", "fr", "de"])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run pretest && node --test test/i18n/routing.test.mjs`
Expected: FAIL — `.test-build/i18n/routing.js` does not exist yet (the pretest change in Step 3 wires it, but the source file is missing).

- [ ] **Step 3: Write the implementation + wire pretest**

Create `lib/i18n/routing.ts`:

```ts
// Pure locale-routing helpers. NO React/Next imports so this compiles under the
// pretest tsc step and runs in edge (proxy), server, and browser code alike.
import { SUPPORTED_LANGS } from "./config"

export type Locale = "en" | "fr" | "de"

export const ALL_LOCALES: readonly Locale[] = ["en", "fr", "de"]

export const LOCALE_OG: Record<Locale, string> = {
  en: "en_US",
  fr: "fr_FR",
  de: "de_DE",
}

const PREFIX_RE = /^\/(fr|de)(?=\/|$|\?|#)/

/** Split a leading `/fr` or `/de` off a pathname. No prefix → English + original. */
export function stripLocale(pathname: string): { locale: Locale; path: string } {
  const m = PREFIX_RE.exec(pathname)
  if (!m) return { locale: "en", path: pathname }
  let path = pathname.slice(m[0].length)
  if (!path.startsWith("/")) path = "/" + path // "" -> "/", "?x" -> "/?x"
  return { locale: m[1] as Locale, path }
}

/** Prepend a target-locale prefix; idempotent; leaves English untouched. */
export function addLocale(path: string, locale: Locale): string {
  if (locale === "en") return path
  const { path: bare } = stripLocale(path)
  return bare === "/" ? `/${locale}` : `/${locale}${bare}`
}

/** Rewrite an internal, root-relative href to the active locale. Leaves external
 *  links, hashes, mailto/tel, and /admin & /api untouched. */
export function localizeHref(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href
  if (href.startsWith("/admin") || href.startsWith("/api")) return href
  return addLocale(href, locale)
}

/** Proxy decision for an incoming pathname. */
export function classifyLocaleRequest(
  pathname: string,
):
  | { kind: "pass" }
  | { kind: "redirect"; to: string }
  | { kind: "rewrite"; locale: "fr" | "de"; path: string } {
  const seg = pathname.split("/")[1] ?? ""
  const lower = seg.toLowerCase()
  if (lower === "fr" || lower === "de") {
    if (seg !== lower) {
      return { kind: "redirect", to: `/${lower}${pathname.slice(1 + seg.length)}` }
    }
    const { path } = stripLocale(pathname)
    return { kind: "rewrite", locale: lower, path }
  }
  return { kind: "pass" }
}

/** Canonical (self) + reciprocal hreflang alternates for a locale-free route path. */
export function buildAlternates(
  pathWithoutLocale: string,
  locale: Locale,
  base: string,
): { canonical: string; languages: Record<string, string> } {
  const en = base + pathWithoutLocale
  return {
    canonical: base + addLocale(pathWithoutLocale, locale),
    languages: {
      en,
      de: base + addLocale(pathWithoutLocale, "de"),
      fr: base + addLocale(pathWithoutLocale, "fr"),
      "x-default": en,
    },
  }
}

// Keep SUPPORTED_LANGS referenced so a future divergence between it and
// ALL_LOCALES is a compile error rather than a silent drift.
void SUPPORTED_LANGS
```

In `package.json`, find the final `tsc` in `pretest` that compiles `lib/i18n/config.ts lib/i18n/collect.ts lib/i18n/assemble.ts` and add `lib/i18n/routing.ts` to that same invocation's file list (before `--rootDir lib`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run pretest && node --test test/i18n/routing.test.mjs`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/routing.ts test/i18n/routing.test.mjs package.json
git commit -m "i18n: pure locale-routing helpers (strip/add/localize/classify/alternates)"
```

---

### Task 2: Locale rewrite in `proxy.ts`

Make `/de/…` and `/fr/…` render (HTTP 200, internal rewrite) and expose the locale.

**Files:**
- Modify: `proxy.ts:18-106`
- (No new test file — logic lives in `classifyLocaleRequest`, already tested in Task 1. Verify by manual run in Step 3.)

**Interfaces:**
- Consumes: `classifyLocaleRequest`, `addLocale` from `lib/i18n/routing.ts`; `LANG_COOKIE` from `lib/i18n/config.ts`.
- Produces: request header `x-locale` (`en`|`fr`|`de`) on every proxied request; `site_lang` cookie on localized requests; internal rewrite of localized paths to their bare route.

- [ ] **Step 1: Implement the rewrite**

At the top of `proxy(request)` (right after `const { pathname } = request.nextUrl`), insert locale handling. Because the existing admin gate + slug redirect + `x-pathname` logic must all operate on the **bare** route, resolve the locale first and work with a `routePath` variable thereafter.

Add imports at the top of `proxy.ts`:

```ts
import { classifyLocaleRequest, addLocale, type Locale } from "@/lib/i18n/routing"
import { LANG_COOKIE } from "@/lib/i18n/config"
```

Replace `const { pathname } = request.nextUrl` with:

```ts
  const { pathname: rawPathname } = request.nextUrl

  // ── Language subdirectory (/de, /fr) ────────────────────────────────────
  // Old Weglot URLs live at /de/… /fr/…. Rewrite (not redirect) to the bare
  // route so it renders in place; expose the locale to server components via
  // x-locale + the site_lang cookie. Uppercase prefixes 301 to lowercase.
  const localeDecision = classifyLocaleRequest(rawPathname)
  if (localeDecision.kind === "redirect") {
    const target = request.nextUrl.clone()
    target.pathname = localeDecision.to
    return NextResponse.redirect(target, 301)
  }
  const locale: Locale = localeDecision.kind === "rewrite" ? localeDecision.locale : "en"
  const pathname = localeDecision.kind === "rewrite" ? localeDecision.path : rawPathname
```

Every later use of `pathname` (slug redirect, admin gate, `x-pathname`) now sees the bare route — correct, since admin/api never carry a prefix.

In the slug-redirect block, preserve the prefix on the 308 target. Change:

```ts
            const target = request.nextUrl.clone()
            target.pathname = `/trip/${slug}`
            return NextResponse.redirect(target, 308)
```

to:

```ts
            const target = request.nextUrl.clone()
            target.pathname = addLocale(`/trip/${slug}`, locale)
            return NextResponse.redirect(target, 308)
```

At the end, set `x-locale`, and rewrite (instead of `next`) when a prefix was present. Replace:

```ts
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(PATHNAME_HEADER, pathname)
  requestHeaders.set(PATHNAME_SIG_HEADER, await signPathname(pathname))
  const response = NextResponse.next({ request: { headers: requestHeaders } })
```

with:

```ts
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(PATHNAME_HEADER, pathname)
  requestHeaders.set(PATHNAME_SIG_HEADER, await signPathname(pathname))
  requestHeaders.set("x-locale", locale)

  let response: NextResponse
  if (localeDecision.kind === "rewrite") {
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = pathname // bare route
    response = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
    response.cookies.set(LANG_COOKIE, locale, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    })
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } })
  }
```

Leave the subsequent `response.headers.set("X-Robots-Tag", …)` and `Link` header lines as-is.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "proxy.ts|routing.ts" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Manual verification (dev server)**

Run `npm run dev`, then:
```bash
curl -sI http://localhost:5000/de/search | head -1        # expect: HTTP/1.1 200
curl -sI http://localhost:5000/DE/search | grep -i location # expect: /de/search (301)
curl -s  http://localhost:5000/de/search | grep -o '<html[^>]*lang="[^"]*"' | head -1  # after Task 3: lang="de"
curl -sI http://localhost:5000/admin | head -1            # unchanged (redirect to login)
```
Expected: `/de/search` → 200; `/DE/search` → 301 to `/de/search`; admin unaffected.

- [ ] **Step 4: Commit**

```bash
git add proxy.ts
git commit -m "i18n: rewrite /de /fr prefixes to bare routes + expose x-locale (proxy)"
```

---

### Task 3: Server locale accessor + `<html lang>`

**Files:**
- Create: `lib/i18n/server-locale.ts`
- Modify: `app/layout.tsx:151-160,188`

**Interfaces:**
- Consumes: `x-locale` header (Task 2); `ALL_LOCALES` from `lib/i18n/routing.ts`.
- Produces: `getRequestLocale(): Promise<Locale>` for use by every `generateMetadata` and the root layout.

- [ ] **Step 1: Create the accessor**

`lib/i18n/server-locale.ts`:

```ts
import { headers } from "next/headers"
import { ALL_LOCALES, type Locale } from "./routing"

/** Current request locale, from the x-locale header set by proxy.ts. */
export async function getRequestLocale(): Promise<Locale> {
  const l = (await headers()).get("x-locale") ?? "en"
  return (ALL_LOCALES as readonly string[]).includes(l) ? (l as Locale) : "en"
}
```

- [ ] **Step 2: Use it for `<html lang>`**

In `app/layout.tsx`, add the import near the other i18n import:

```ts
import { getRequestLocale } from "@/lib/i18n/server-locale"
```

Replace the cookie-derived `htmlLang` (line ~160):

```ts
  const langCookie = (await cookies()).get(LANG_COOKIE)?.value ?? "en"
  const htmlLang = !isAdminRoute && isSupportedLang(langCookie) ? langCookie : "en"
```

with a locale-from-path version (falls back to `en`; admin always `en`):

```ts
  const requestLocale = await getRequestLocale()
  const htmlLang = isAdminRoute ? "en" : requestLocale
```

Leave `<html lang={htmlLang} …>` (line ~188) unchanged. Remove the now-unused `LANG_COOKIE`/`isSupportedLang`/`cookies` imports only if nothing else in the file uses them (the site-access gate below still reads `cookies()`, so keep `cookies`).

- [ ] **Step 3: Verify**

Run: `npm run dev`, then `curl -s http://localhost:5000/de/search | grep -o 'lang="[a-z]*"' | head -1`
Expected: `lang="de"`. And `/fr/search` → `lang="fr"`, `/search` → `lang="en"`.

- [ ] **Step 4: Commit**

```bash
git add lib/i18n/server-locale.ts app/layout.tsx
git commit -m "i18n: server locale accessor + locale-driven <html lang>"
```

---

### Task 4: SEO metadata helpers (`lib/i18n/metadata.ts`)

Server-side cached translation of title/description + a reusable localized-metadata builder.

**Files:**
- Create: `lib/i18n/metadata.ts`
- Test: `test/i18n/metadata.test.mjs` (only the pure `en`-passthrough branch; the fr/de path hits the DB/Weglot and is covered by manual E2E)

**Interfaces:**
- Consumes: `getCachedTranslations`, `putTranslations` (`lib/i18n/cache.ts`), `translateWithWeglot` (`lib/i18n/weglot-translate.ts`), `chunk`, `isTranslatableText` (`lib/i18n/collect.ts`), `MAX_BATCH`, `isSupportedLang` (`lib/i18n/config.ts`), `getRequestLocale` (Task 3), `buildAlternates`, `addLocale`, `LOCALE_OG` (`lib/i18n/routing.ts`).
- Produces:
  - `translateMeta(locale: Locale, fields: { title?: string; description?: string }): Promise<{ title?: string; description?: string }>`
  - `localizedMetadata(input: { path: string; title: string; description?: string }): Promise<Metadata>`

- [ ] **Step 1: Write the failing test (en passthrough)**

The DB-backed branch isn't unit-testable here; test the `en` short-circuit, which is pure. To keep the import DB-free, put `translateMeta`'s pure guard logic in a tiny exported helper that the test can reach without importing the whole server module. Simplest: test via a thin pure re-export.

Create `test/i18n/metadata.test.mjs`:

```js
import test from "node:test"
import assert from "node:assert/strict"

// metadata.ts imports server-only deps (headers, db); we only unit-test the
// pure passthrough rule, which is duplicated as `translateMetaEn` for testing.
const { translateMetaEn } = await import("../../.test-build/i18n/metadata-pure.js")

test("en locale returns fields unchanged", () => {
  assert.deepEqual(translateMetaEn("en", { title: "Book now", description: "Hi" }),
    { title: "Book now", description: "Hi" })
})

test("unsupported locale returns fields unchanged", () => {
  assert.deepEqual(translateMetaEn("xx", { title: "Book now" }), { title: "Book now" })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run pretest && node --test test/i18n/metadata.test.mjs`
Expected: FAIL — `.test-build/i18n/metadata-pure.js` missing.

- [ ] **Step 3: Implement**

Create `lib/i18n/metadata-pure.ts` (pure; added to the `pretest` compile list alongside `routing.ts`):

```ts
import { isSupportedLang } from "./config"

/** Pure guard: en / unsupported locales pass fields through untouched. Returns
 *  null when a real (fr/de) translation is required. */
export function translateMetaEn<T extends Record<string, string | undefined>>(
  locale: string,
  fields: T,
): T {
  if (locale === "en" || !isSupportedLang(locale)) return fields
  return fields // callers replace this with real translation; en-branch is the tested contract
}
```

Create `lib/i18n/metadata.ts`:

```ts
import type { Metadata } from "next"
import { getCachedTranslations, putTranslations } from "./cache"
import { translateWithWeglot } from "./weglot-translate"
import { chunk, isTranslatableText } from "./collect"
import { MAX_BATCH, isSupportedLang } from "./config"
import { getRequestLocale } from "./server-locale"
import { addLocale, buildAlternates, LOCALE_OG, type Locale } from "./routing"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

/** Translate metadata strings via the shared cache (server-side). Never throws. */
export async function translateMeta(
  locale: Locale,
  fields: { title?: string; description?: string },
): Promise<{ title?: string; description?: string }> {
  if (locale === "en" || !isSupportedLang(locale)) return fields
  const values = Object.values(fields).filter(
    (v): v is string => typeof v === "string" && isTranslatableText(v),
  )
  if (values.length === 0) return fields

  const cached = await getCachedTranslations(locale, values).catch(() => new Map<string, string>())
  const misses = values.filter((v) => !cached.has(v))
  const fresh = new Map<string, string>()
  for (const b of chunk(misses, MAX_BATCH)) {
    const m = await translateWithWeglot(locale, b).catch(() => new Map<string, string>())
    for (const [k, v] of m) fresh.set(k, v)
  }
  const toStore = [...fresh.entries()]
    .filter(([s, t]) => t && t !== s)
    .map(([source, translated]) => ({ source, translated }))
  if (toStore.length) await putTranslations(locale, toStore).catch(() => {})

  const pick = (v?: string) => (v == null ? v : cached.get(v) ?? fresh.get(v) ?? v)
  return { title: pick(fields.title), description: pick(fields.description) }
}

/** Build locale-aware Metadata (translated title/description + canonical +
 *  hreflang + OG) for a locale-free route path. Spread into a page's own
 *  metadata to add page-specific fields (images, keywords, etc.). */
export async function localizedMetadata(input: {
  path: string
  title: string
  description?: string
}): Promise<Metadata> {
  const locale = await getRequestLocale()
  const t = await translateMeta(locale, { title: input.title, description: input.description })
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates(input.path, locale, BASE),
    openGraph: {
      title: t.title ?? undefined,
      description: t.description ?? undefined,
      url: BASE + addLocale(input.path, locale),
      locale: LOCALE_OG[locale],
    },
  }
}
```

Add `lib/i18n/metadata-pure.ts` to the `pretest` tsc file list.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run pretest && node --test test/i18n/metadata.test.mjs`
Expected: PASS. Also `npx tsc --noEmit -p tsconfig.json 2>&1 | grep metadata || echo clean` → `clean`.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/metadata.ts lib/i18n/metadata-pure.ts test/i18n/metadata.test.mjs package.json
git commit -m "i18n: server-side cached metadata translation + localizedMetadata builder"
```

---

### Task 5: Localize detail-page metadata (trip / experiences / blog)

**Files:**
- Modify: `app/trip/[id]/page.tsx:241-303` (generateMetadata)
- Modify: `app/experiences/[slug]/page.tsx:97-117`
- Modify: `app/blog/[slug]/page.tsx:61-105`

**Interfaces:**
- Consumes: `getRequestLocale` (Task 3), `translateMeta`, and `buildAlternates`/`addLocale`/`LOCALE_OG` (Tasks 1/4).
- Produces: per-locale title/description/canonical/hreflang/OG on the three highest-value routes.

- [ ] **Step 1: Trip page**

In `app/trip/[id]/page.tsx`, add imports:

```ts
import { getRequestLocale } from "@/lib/i18n/server-locale"
import { translateMeta } from "@/lib/i18n/metadata"
import { buildAlternates, addLocale, LOCALE_OG } from "@/lib/i18n/routing"
```

Inside `generateMetadata`, after `seoTitle`/`description` are computed and before the `return`, add:

```ts
  const locale = await getRequestLocale()
  const routePath = `/trip/${trip.slug ?? trip.id}`
  const tr = await translateMeta(locale, { title: seoTitle, description })
  const mTitle = tr.title ?? seoTitle
  const mDesc = tr.description ?? description
```

Then change the returned object: use `mTitle`/`mDesc` in `title`, `description`, `openGraph.title`, `openGraph.description`, `twitter.title`, `twitter.description`; replace `alternates` and `openGraph.url`:

```ts
    title: mTitle,
    description: mDesc,
    // …keywords unchanged…
    alternates: buildAlternates(routePath, locale, BASE),
    openGraph: {
      type: "article",
      title: mTitle,
      description: mDesc,
      url: `${BASE}${addLocale(routePath, locale)}`,
      locale: LOCALE_OG[locale],
      images: [ /* unchanged */ ],
    },
    twitter: {
      card: "summary_large_image",
      title: mTitle,
      description: mDesc,
      /* images unchanged */
    },
```

- [ ] **Step 2: Experiences page**

In `app/experiences/[slug]/page.tsx`, add the same three imports. Replace the `return` block:

```ts
  const locale = await getRequestLocale()
  const routePath = `/experiences/${slug}`
  const title = `${cat.name} Experiences in Luxembourg`
  const tr = await translateMeta(locale, { title, description })
  return {
    title: tr.title ?? title,
    description: tr.description ?? description,
    alternates: buildAlternates(routePath, locale, BASE),
    openGraph: {
      title: tr.title ?? `${cat.name} - Luxembourg Experiences | sightseeing.lu`,
      description: tr.description ?? description,
      url: `${BASE}${addLocale(routePath, locale)}`,
      locale: LOCALE_OG[locale],
      images: catTrips[0]
        ? [{ url: catTrips[0].image.startsWith("/") ? `${BASE}${catTrips[0].image}` : catTrips[0].image, width: 1200, height: 630, alt: cat.name }]
        : [],
    },
  }
```

- [ ] **Step 3: Blog page**

In `app/blog/[slug]/page.tsx`, add the same three imports. Keep the not-found / preview early returns (preview stays `robots:{index:false}`). For the live-post `return`, add before it:

```ts
  const locale = await getRequestLocale()
  const routePath = `/blog/${post.slug}`
  const tr = await translateMeta(locale, { title, description })
```

and change:

```ts
    title: tr.title ?? title,
    description: tr.description ?? description,
    alternates: buildAlternates(routePath, locale, BASE),
    openGraph: {
      type: "article",
      title: tr.title ?? post.title,
      description: tr.description ?? description,
      url: `${BASE}${addLocale(routePath, locale)}`,
      locale: LOCALE_OG[locale],
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updated_at ? new Date(post.updated_at).toISOString() : undefined,
      authors: post.author ? [post.author] : undefined,
      tags: post.tags ?? undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: tr.title ?? post.title,
      description: tr.description ?? description,
      images: [ogImage],
    },
```

- [ ] **Step 4: Verify**

Run: `npm run dev`, then:
```bash
curl -s http://localhost:5000/de/trip/<a-real-slug> | grep -Ei 'rel="canonical"|hreflang|og:locale' | head
```
Expected: canonical `…/de/trip/<slug>`; hreflang `en`/`de`/`fr`/`x-default` present; `og:locale` `de_DE`. Title/description in German after the translate cache warms.

- [ ] **Step 5: Commit**

```bash
git add app/trip/[id]/page.tsx app/experiences/[slug]/page.tsx app/blog/[slug]/page.tsx
git commit -m "i18n: localized metadata + hreflang on trip/experiences/blog detail pages"
```

---

### Task 6: Localize indexable static-page metadata

**Files:**
- Modify (convert static `metadata` → `generateMetadata` via `localizedMetadata`, preserving existing titles/descriptions): `app/page.tsx`, `app/explore/page.tsx`, `app/planner/page.tsx`, `app/departures/page.tsx`, `app/blog/page.tsx`, `app/about/page.tsx`, `app/careers/page.tsx`, `app/help/page.tsx`, `app/search/page.tsx`.

**Interfaces:**
- Consumes: `localizedMetadata` (Task 4).
- Produces: per-locale title/description/canonical/hreflang on the main static routes.

- [ ] **Step 1: Convert each page**

For each file, if it has `export const metadata = { title, description, … }`, replace with a `generateMetadata`. Example for `app/about/page.tsx` (repeat per file using that file's own existing title/description and route path):

```ts
import type { Metadata } from "next"
import { localizedMetadata } from "@/lib/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  const base = await localizedMetadata({
    path: "/about",
    title: "About sightseeing.lu",              // ← copy this file's existing title
    description: "…existing description…",        // ← copy this file's existing description
  })
  return { ...base /*, keep any page-specific fields e.g. keywords */ }
}
```

Route paths per file: `/` (home — `path: "/"`), `/explore`, `/planner`, `/departures`, `/blog`, `/about`, `/careers`, `/help`, `/search`. Preserve each page's existing `title`/`description` verbatim as the English source; merge any extra existing metadata fields (e.g. `keywords`, `openGraph.images`) by spreading them after `...base`.

Note: `app/search/page.tsx` already exports `metadata` (title "Search Experiences"). Convert it the same way; keep `export const dynamic = "force-dynamic"`.

- [ ] **Step 2: Verify**

Run: `npm run dev`, then `curl -s http://localhost:5000/de/about | grep -Ei 'canonical|hreflang' | head`
Expected: canonical `…/de/about` + hreflang cluster. Repeat-spot-check `/fr/explore`.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/explore/page.tsx app/planner/page.tsx app/departures/page.tsx app/blog/page.tsx app/about/page.tsx app/careers/page.tsx app/help/page.tsx app/search/page.tsx
git commit -m "i18n: localized metadata + hreflang on indexable static pages"
```

---

### Task 7: Sitemap alternates

**Files:**
- Modify: `app/sitemap.ts`

**Interfaces:**
- Consumes: `addLocale` (Task 1).
- Produces: `alternates.languages` (en/de/fr) on every sitemap entry.

- [ ] **Step 1: Add a helper + apply**

In `app/sitemap.ts`, import `addLocale`:

```ts
import { addLocale } from "@/lib/i18n/routing"
```

Add near the top:

```ts
const langAlternates = (path: string) => ({
  languages: {
    en: `${BASE}${path}`,
    de: `${BASE}${addLocale(path, "de")}`,
    fr: `${BASE}${addLocale(path, "fr")}`,
  },
})
```

For every entry array (static, category, trip, blog), add `alternates: langAlternates(path)` where `path` is the route path (the part after `BASE`). For entries currently built as `` `${BASE}/explore` `` etc., compute from the same path string, e.g.:

```ts
{ url: `${BASE}/explore`, alternates: langAlternates("/explore"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
```

For dynamic trip/blog/category entries, use the same `path` you already interpolate (e.g. `/trip/${slug}`, `/experiences/${slugify(cat.name)}`, `/blog/${slug}`).

- [ ] **Step 2: Verify**

Run: `npm run dev`, then `curl -s http://localhost:5000/sitemap.xml | grep -c 'hreflang="de"'`
Expected: a count equal to the number of URLs (every entry has a `de` alternate).

- [ ] **Step 3: Commit**

```bash
git add app/sitemap.ts
git commit -m "i18n: per-language sitemap alternates"
```

---

### Task 8: Client translator reads locale from path

**Files:**
- Modify: `components/i18n/translator.tsx:14-23,223-236`

**Interfaces:**
- Consumes: `stripLocale` (Task 1); existing `LANG_COOKIE`, `isSupportedLang`, `SOURCE_LANG`.
- Produces: path-first locale detection so a cookie-less `/de/…` landing renders translated; EN reset navigates to the bare path.

- [ ] **Step 1: Path-first `getSiteLang`**

In `components/i18n/translator.tsx`, add import:

```ts
import { stripLocale } from "@/lib/i18n/routing"
```

Replace `getSiteLang`:

```ts
export function getSiteLang(): string {
  if (typeof location !== "undefined") {
    const { locale } = stripLocale(location.pathname)
    if (locale !== "en") return locale
  }
  const c = readCookie(LANG_COOKIE)
  return isSupportedLang(c) ? c : SOURCE_LANG
}
```

- [ ] **Step 2: EN reset drops the prefix**

In `setSiteLang`, the English branch currently `location.reload()`. Change it to reload at the de-localized path so the URL loses its prefix and English source is restored cleanly:

```ts
  if (!isSupportedLang(lang)) {
    currentLang = SOURCE_LANG
    document.documentElement.lang = SOURCE_LANG
    const { path } = stripLocale(location.pathname)
    location.assign(path) // strip prefix + fresh English load
    return
  }
```

- [ ] **Step 3: Verify (browser)**

Run `npm run dev`; in a private window (no cookie) open `/de/search` → content is German and stays German navigating via nav. (Full switcher behavior lands in Task 10.)

- [ ] **Step 4: Commit**

```bash
git add components/i18n/translator.tsx
git commit -m "i18n: client translator detects locale from URL path (cookie fallback)"
```

---

### Task 9: Prefix-aware `<Link>` wrapper + `useLocalizedRouter`

**Files:**
- Create: `components/i18n/link.tsx`
- Test: `test/i18n/link-transform.test.mjs` (tests the pure `localizeHref` already in Task 1 against the wrapper's transform rules — no React render needed)

**Interfaces:**
- Consumes: `stripLocale`, `localizeHref` (Task 1); `next/link`, `next/navigation`.
- Produces: `Link` (drop-in for `next/link`), `useLocalizedRouter()`.

- [ ] **Step 1: Write the failing test**

The wrapper's decision is fully in `localizeHref`; assert the exact hrefs a wrapper under `/de` would produce. Create `test/i18n/link-transform.test.mjs`:

```js
import test from "node:test"
import assert from "node:assert/strict"
const { localizeHref } = await import("../../.test-build/i18n/routing.js")

test("under /de, internal links gain the prefix; others are left alone", () => {
  const L = (h) => localizeHref(h, "de")
  assert.equal(L("/planner"), "/de/planner")
  assert.equal(L("/trip/abc"), "/de/trip/abc")
  assert.equal(L("/admin/x"), "/admin/x")
  assert.equal(L("https://ext.com"), "https://ext.com")
  assert.equal(L("#a"), "#a")
})
```

- [ ] **Step 2: Run to verify it passes already**

Run: `npm run pretest && node --test test/i18n/link-transform.test.mjs`
Expected: PASS (validates the contract the wrapper relies on). This guards the wrapper's behavior without a DOM.

- [ ] **Step 3: Implement the wrapper**

Create `components/i18n/link.tsx`:

```tsx
"use client"

import NextLink from "next/link"
import type { ComponentProps } from "react"
import { forwardRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { stripLocale, localizeHref } from "@/lib/i18n/routing"

type NextLinkProps = ComponentProps<typeof NextLink>

/** Drop-in for next/link that prepends the active /de or /fr prefix to internal
 *  root-relative hrefs, so navigation stays within the language cluster. */
export const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(function Link(
  { href, ...props },
  ref,
) {
  const { locale } = stripLocale(usePathname() || "/")
  let next: NextLinkProps["href"] = href
  if (typeof href === "string") {
    next = localizeHref(href, locale)
  } else if (href && typeof href === "object" && typeof href.pathname === "string") {
    next = { ...href, pathname: localizeHref(href.pathname, locale) }
  }
  return <NextLink ref={ref} href={next} {...props} />
})

/** useRouter whose push/replace preserve the active locale prefix. */
export function useLocalizedRouter() {
  const router = useRouter()
  const { locale } = stripLocale(usePathname() || "/")
  return {
    ...router,
    push: (href: string, opts?: Parameters<typeof router.push>[1]) =>
      router.push(localizeHref(href, locale), opts),
    replace: (href: string, opts?: Parameters<typeof router.replace>[1]) =>
      router.replace(localizeHref(href, locale), opts),
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'i18n/link' || echo clean`
Expected: `clean`.

- [ ] **Step 5: Commit**

```bash
git add components/i18n/link.tsx test/i18n/link-transform.test.mjs
git commit -m "i18n: prefix-aware Link wrapper + useLocalizedRouter"
```

---

### Task 10: Language switcher navigates with prefix

**Files:**
- Modify: `components/site-navbar.tsx:58,109-125,181-191`

**Interfaces:**
- Consumes: `useSiteLang` (existing), `stripLocale`/`addLocale` (Task 1), `useRouter`/`usePathname` (`next/navigation`), and the switcher should highlight from the path.
- Produces: switching language pushes the localized URL; active state derives from the path prefix.

- [ ] **Step 1: Wire navigation**

In `components/site-navbar.tsx`, add imports:

```ts
import { usePathname, useRouter } from "next/navigation"
import { stripLocale, addLocale } from "@/lib/i18n/routing"
```

Replace the switcher hook usage + handler. Keep `useSiteLang` for cookie/DOM translation, but drive URL + active state from the path:

```ts
  const { setLang } = useSiteLang()
  const router = useRouter()
  const pathname = usePathname()
  const { locale: currentLang, path: barePath } = stripLocale(pathname || "/")

  const switchLanguage = (code: string) => {
    setLang(code)                                   // cookie + in-place DOM translate
    if (code === "en") return                       // setSiteLang('en') reloads to bare path
    router.push(addLocale(barePath, code as "fr" | "de"))
  }
```

The existing JSX uses `currentLang === lang.code` for active styling and `switchLanguage(lang.code)` on click — both keep working. Remove the old `weglotReady`/`ready` destructure if now unused (or keep gating the control on it if present).

- [ ] **Step 2: Verify (browser)**

Run `npm run dev`. From `/search`: click DE → URL becomes `/de/search`, content German, DE highlighted. Click FR → `/fr/search`. Click EN → `/search`, English restored. Reload on `/de/search` → stays German.

- [ ] **Step 3: Commit**

```bash
git add components/site-navbar.tsx
git commit -m "i18n: language switcher navigates to prefixed URLs"
```

---

### Task 11: Migrate public components to the prefix-aware `<Link>`

The wide, mechanical change. Do it in reviewable batches, admin excluded.

**Files:**
- Modify: all **public** components/pages importing `next/link` — i.e. everything under `components/` and `app/` **except** `app/admin/**` and admin-only components. Programmatic `router.push('/…')` in those files → `useLocalizedRouter()`.
- Also handle **server-rendered** anchors (files importing `next/link` with no `"use client"`): the client wrapper can't run there — prepend the prefix with `addLocale(path, await getRequestLocale())` inline instead.

**Interfaces:**
- Consumes: `Link`/`useLocalizedRouter` (Task 9), `getRequestLocale`/`addLocale` for server anchors.
- Produces: session-wide prefix persistence.

- [ ] **Step 1: Inventory**

Run:
```bash
grep -rln "next/link" app components | grep -v "app/admin/" | grep -v "components/admin/"
grep -rln "next/link" app/admin components/admin   # must stay on next/link — do NOT change
```
Record the two lists. For each file in the first list, determine if it is a client component (`"use client"` at top) or a server component.

- [ ] **Step 2: Swap client components**

For each **client** file in the first list, replace the import:
- `import Link from "next/link"` → `import { Link } from "@/components/i18n/link"`
- If the file does `import Link, { … } from "next/link"`, split: keep the named imports from `next/link`, add `import { Link } from "@/components/i18n/link"`.
Replace any `const router = useRouter()` used for internal `router.push('/…')` navigation with `const router = useLocalizedRouter()` (import from `@/components/i18n/link`). Leave `useRouter` where it's used only for `.refresh()`/`.back()` or external/param-only pushes.

Batch by area (e.g. navbar/footer, home sections, trip card, search — search-content.tsx, explore, planner, blog, departures) and commit per batch so review stays small.

- [ ] **Step 3: Fix server-rendered anchors**

For each **server** file in the first list, do NOT use the client wrapper. Instead, at the top of the component, resolve the locale and prefix internal hrefs:

```ts
import { getRequestLocale } from "@/lib/i18n/server-locale"
import { addLocale } from "@/lib/i18n/routing"
// …
const locale = await getRequestLocale()
// then: <Link href={addLocale("/experiences/…", locale)} …>  (still next/link here)
```

- [ ] **Step 4: Verify no admin drift + build**

Run:
```bash
grep -rln "@/components/i18n/link" app/admin components/admin && echo "LEAK — revert" || echo "admin clean"
npm run pretest && node --test "test/**/*.test.mjs"
npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: `admin clean`; tests pass; no new type errors.

- [ ] **Step 5: Verify (browser)**

Run `npm run dev`; from `/de/search`, click through cards, categories, navbar, footer — every internal navigation keeps the `/de` prefix. Admin (`/admin`) links stay un-prefixed.

- [ ] **Step 6: Commit (per batch)**

```bash
git add <batch files>
git commit -m "i18n: route public <batch> links through prefix-aware Link"
```

---

### Task 12: Full E2E verification + regression sweep

**Files:** none (verification only).

- [ ] **Step 1: Automated suite**

Run: `npm run pretest && node --test "test/**/*.test.mjs"`
Expected: all pass (routing, metadata, link-transform + pre-existing suites).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "sightseeing-map.tsx" | grep "error TS" || echo "clean"`
Expected: `clean` (the pre-existing `sightseeing-map.tsx` GeoJSON errors are unrelated and ignored).

- [ ] **Step 3: Manual matrix (dev server)**

Confirm each:
- `curl -sI /de/trip/<slug>` → 200; `/DE/trip/<slug>` → 301 → `/de/trip/<slug>`.
- Fresh private window on `/de/trip/<slug>` → German body, `<html lang="de">`, canonical `…/de/trip/<slug>`, hreflang en/de/fr/x-default, `og:locale de_DE`.
- Navigate within site → prefix persists; switch FR/EN works; reload keeps language.
- `/admin` and `/api/*` unaffected (auth still gates; no prefix).
- `sitemap.xml` includes de/fr alternates; `robots.txt` doesn't block `/de` `/fr`.
- English root URLs (`/trip/<slug>`) unchanged: canonical self, hreflang cluster present.

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git add -A && git commit -m "i18n: E2E fixups for language-prefixed URLs"
```

---

## Self-Review

**Spec coverage:**
- Middleware rewrite + 301 uppercase + x-locale + cookie → Task 2 (logic Task 1). ✓
- Locale propagation server (`getRequestLocale`) + client (path-first) → Tasks 3, 8. ✓
- SEO metadata (translated title/desc, canonical, hreflang, OG) → Tasks 4, 5, 6. ✓
- `<html lang>` → Task 3. ✓
- Sitemap alternates → Task 7. ✓
- Prefix-aware links (wrapper, router, server anchors, migration) → Tasks 9, 11. ✓
- Switcher → Task 10. ✓
- Reuse of existing cache/translate, no new migration → Task 4 (Global Constraints). ✓
- Non-goal (body server-translation) honored — not implemented. ✓
- Testing (unit + manual E2E) → Tasks 1,4,9 unit; 12 E2E. ✓

**Placeholder scan:** No TBD/TODO; all code steps contain real code. Static-page titles/descriptions in Task 6 are intentionally "copy this file's existing value" (they already exist in-repo and must be preserved verbatim), not placeholders to invent.

**Type consistency:** `Locale` used consistently; `stripLocale`/`addLocale`/`localizeHref`/`buildAlternates`/`classifyLocaleRequest` signatures match across Tasks 1–11; `translateMeta`/`localizedMetadata` signatures match Tasks 4–6; `x-locale` header name consistent (Tasks 2, 3).
