# Language-prefixed URLs + multilingual SEO — Design

- **Date:** 2026-08-18
- **Status:** Approved (design), ready for implementation plan
- **Author:** Prashant Lukhi + Claude

## Problem

The old (WordPress + Weglot) site served translated pages under subdirectory URLs
(`sightseeing.lu/de/…`, `sightseeing.lu/fr/…`). Google indexed those URLs. The new
Next.js site replaced Weglot's snippet with a **custom client-side DOM translator**
(`components/i18n/translator.tsx`) that translates in place with **no URL change**
(see `docs/superpowers/specs/2026-08-12-client-side-translation-design.md`). Weglot is
now only a **backend machine-translation API**, called server-side and cached in Postgres.

Consequence: the `/de/…` and `/fr/…` URLs no longer exist, so every translated URL Google
has indexed now **404s** (or, if it resolves at all, shows English). The earlier design
explicitly listed this under Open Items: *"SEO — NOT SOLVED … this approach gives that up …
Track this."* This spec is that tracked item.

Restoring `/de/`, `/fr/` on the new stack is **not** a Weglot dashboard toggle (we have only
the API key, no dashboard access, and the app is heavily client-rendered). The URL scheme
must be rebuilt on our side in Next.js — with **no redirects** for the language prefix
(internal rewrites), so old inbound links resolve directly.

## Decisions (locked with stakeholder)

1. **Scope:** Full multilingual SEO — not just "stop the 404s".
2. **URL scheme:** lowercase prefixes, **English at root**:
   - EN: `sightseeing.lu/trip/x` (unprefixed)
   - DE: `sightseeing.lu/de/trip/x`
   - FR: `sightseeing.lu/fr/trip/x`
   - hreflang codes: `en`, `de`, `fr` (lowercase) + `x-default` → English.
3. **Navigation:** **Prefix-aware links** — the active `/de` or `/fr` prefix persists on
   every internal link, so URLs stay under `/de/…` for the whole session and each language
   cluster is self-contained.

## Goals

- Old inbound `/de/…` and `/fr/…` URLs resolve with **HTTP 200, no redirect**, rendering the
  translated page.
- Google indexes genuine localized pages: per-language `<html lang>`, `<title>`, meta
  description, self-referencing canonical, reciprocal `hreflang` alternates, localized OG,
  and `/de` `/fr` entries in the sitemap.
- A visitor landing on `/de/trip/x` from Google (no cookie) sees German immediately, and the
  `/de` prefix persists as they navigate.
- Reuse the existing cached translate layer (`lib/i18n/cache` + `translateWithWeglot`) so
  metadata translation adds no new backend and stays cheap.

## Non-goals (this iteration)

- **Server-side translation of visible body text.** Body text remains client-translated by
  the existing engine (Google executes JS, so it can still index translated content; the raw
  SSR HTML body stays English). Full server-side body translation needs a Weglot proxy and is
  out of scope. **Accepted limitation.**
- Translating admin routes (`/admin/**`) or API routes — public site only.
- Changing the source-language (English) URLs — they stay at root, unchanged, to preserve
  existing English rankings.
- Cache invalidation / glossary parity beyond what already exists.

## Architecture

```
Googlebot / user  ->  GET /de/trip/x
                          |
                   [middleware.ts]  first segment = "de"?
                     - lowercase   -> rewrite to /trip/x
                                      set req header x-locale=de
                                      set cookie site_lang=de   (HTTP 200, no redirect)
                     - UpperCase   -> 301 -> /de/trip/x (lowercased)
                     - none/other  -> pass through (English)
                          |
                   App Router renders /trip/[id]
                     - RootLayout: <html lang> = getRequestLocale()  (headers x-locale)
                     - generateMetadata: translateMeta(de, {title,desc}) [cached],
                       buildAlternates() -> canonical + hreflang en/de/fr/x-default, OG locale
                          |
                   Client:
                     - Translator reads locale from location.pathname prefix (cookie fallback)
                       -> translates visible DOM to German
                     - <Link> wrapper prepends /de to internal hrefs -> prefix persists
```

### Components

1. **`lib/i18n/config.ts` (extend — pure, shared server+client)**
   - Existing: `SUPPORTED_LANGS = ["fr","de"]`, `SOURCE_LANG="en"`, `LANG_COOKIE`,
     `isSupportedLang`.
   - Add:
     - `ALL_LOCALES = ["en","fr","de"]` (source + targets).
     - `stripLocale(pathname: string): { locale: "en"|"fr"|"de"; path: string }` — splits a
       leading `/fr` or `/de` (case-insensitive on read is handled in middleware; this helper
       assumes lowercase) off the pathname; returns `en` + original path when none.
     - `addLocale(path: string, locale: string): string` — prepends `/de`/`/fr` for targets,
       returns `path` unchanged for `en`. Idempotent (never double-prefixes).
   - Keep this file free of React/Next imports (it already compiles under the pretest tsc step).

2. **`middleware.ts` (new, repo root)**
   - `export const config = { matcher: [...] }` excluding `/api/*`, `/admin/*`, `/_next/*`,
     `/sitemap.xml`, `/robots.txt`, `/favicon.ico`, and files with an extension.
   - Logic:
     - Extract `seg = first path segment`.
     - If `seg` (lowercased) is a supported target (`fr`|`de`):
       - If `seg` is not already lowercase → `NextResponse.redirect` (301) to the lowercased URL.
       - Else: build `NextResponse.rewrite(strippedUrl)` with request header `x-locale=<lang>`
         (via `request.headers` clone) and set response cookie `site_lang=<lang>`
         (`path=/`, `max-age=31536000`, `samesite=lax`).
     - Else: `NextResponse.next()` (English). Do **not** clobber an existing `site_lang` cookie
       and do **not** redirect based on cookie (avoids cloaking / redirect-on-every-hit).
   - Guard against rewriting to a path that itself begins with another locale (defensive; a
     `/de/de/…` never occurs in normal flow but strip once only).

3. **Locale accessors**
   - **Server:** `lib/i18n/server-locale.ts` → `getRequestLocale(): "en"|"fr"|"de"` reads
     `headers().get("x-locale")`, validates, defaults `en`. Used by RootLayout + all
     `generateMetadata`.
   - **Client:** update `components/i18n/translator.tsx`:
     - `getSiteLang()` resolves **path prefix first** (`stripLocale(location.pathname).locale`),
       then the `site_lang` cookie, then `SOURCE_LANG`.
     - `Translator` mount + `useSiteLang` use this precedence so a fresh (cookie-less) landing
       on `/de/…` activates German.
     - `setSiteLang` continues to write the cookie and drive DOM translation; switching to a
       target no longer needs a reload (navigation handles the URL — see switcher).

4. **`lib/i18n/metadata.ts` (new, server-only)**
   - `translateMeta(locale, fields: { title?: string; description?: string })` →
     for `en` returns the fields unchanged; for `fr`/`de` runs them through
     `getCachedTranslations` → misses → `translateWithWeglot` → `putTranslations`
     (same pipeline as `/api/i18n/translate`, factored so both share it), returning translated
     strings (English fallback on failure). Never throws.
   - `buildAlternates(pathWithoutLocale, locale)` → returns a Next `Metadata["alternates"]`:
     - `canonical`: `BASE + addLocale(pathWithoutLocale, locale)`
     - `languages`: `{ en: BASE+path, de: BASE+/de+path, fr: BASE+/fr+path, "x-default": BASE+path }`
   - `BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"` (match sitemap).

5. **Page metadata updates**
   - Detail pages with existing `generateMetadata`: `/trip/[id]`, `/experiences/[slug]`,
     `/blog/[slug]` — read `getRequestLocale()`, translate title/description via `translateMeta`,
     set `alternates: buildAlternates(canonicalPathForThisPage, locale)` and
     `openGraph.locale` (`en_US` / `de_DE` / `fr_FR`).
   - Indexable static pages (add `generateMetadata` or convert static `metadata`): home,
     `/explore`, `/planner`, `/departures`, `/blog`, `/about`, `/careers`, `/help`, `/search`.
     Each gets translated title/description + `buildAlternates`.
   - `app/layout.tsx`: set `<html lang={getRequestLocale()}>` (currently static). Layout stays
     a server component; reading `headers()` forces dynamic rendering for public routes — acceptable
     (the site is already largely dynamic; verify no route wrongly forced static).

6. **Prefix-aware navigation**
   - `components/i18n/link.tsx` — client `Link` wrapping `next/link`:
     - Reads active locale from `usePathname()` via `stripLocale`.
     - For an **internal, root-relative string href** (`/…`), rewrites to `addLocale(href, locale)`.
     - Leaves untouched: external (`http(s)://`, `//`), `#…`, `mailto:`, `tel:`, hrefs already
       under a locale prefix, and `/admin` / `/api`.
     - `UrlObject` hrefs: rewrite `.pathname` only.
     - Forwards all props/`ref`; API-compatible drop-in for `next/link`.
   - `useLocalizedRouter()` (in same module) wraps `useRouter`, applying `addLocale` to
     `push`/`replace` string targets.
   - `localizedHref(path, locale)` — pure helper (re-export of `addLocale` for clarity) for the
     few **server-rendered** anchors, with locale from `getRequestLocale()`.
   - **Migration:** replace `import Link from "next/link"` with
     `import { Link } from "@/components/i18n/link"` in **public** components (everything except
     `app/admin/**` and admin-only components). Programmatic `router.push('/…')` in public
     components → `useLocalizedRouter()`. Enumerate the file set during planning; it is wide but
     mechanical.

7. **Language switcher (`components/site-navbar.tsx`)**
   - Switch target lang: `router.push(addLocale(stripLocale(currentPath).path, lang))` +
     `setSiteLang(lang)` (cookie + DOM). Switch to EN: `router.push(stripLocale(currentPath).path)`.
   - Highlight active language from the path prefix (fallback cookie).

8. **`app/sitemap.ts`**
   - For every entry, add `alternates: { languages: { en, de, fr } }` using the same
     `BASE + addLocale(...)` construction. Primary `url` stays the English (root) URL.

9. **`robots.txt`**
   - Verify `/de` and `/fr` are not disallowed (they inherit root rules; confirm no rule blocks
     them). No change expected.

## Data flow

1. Googlebot GET `/de/trip/x` → middleware rewrites to `/trip/x`, header `x-locale=de`.
2. RootLayout renders `<html lang="de">`; `generateMetadata` returns German title/description,
   canonical `…/de/trip/x`, hreflang cluster, OG `de_DE`.
3. Client `Translator` reads `de` from `location.pathname` → translates visible DOM to German.
4. User clicks a card → `<Link>` produced `/de/trip/y` → stays in German cluster; that page's
   canonical/hreflang are self-consistent.
5. Switch to FR → `router.push('/fr/trip/x')`; switch to EN → `router.push('/trip/x')`.

## Error handling & degradation

- `translateMeta` failure → English metadata (never throws, never 500s the page).
- Middleware only rewrites recognized locale prefixes; everything else passes through, so a
  bad segment just renders the normal 404 for a non-existent route.
- `<Link>` wrapper leaves non-internal / already-prefixed hrefs untouched — no double prefixing,
  no breaking external links.
- Body-translation failures already degrade to English per the existing client engine.

## Testing

- **Unit (jsdom / node):**
  - `stripLocale` / `addLocale`: prefixes, root, idempotency, `en` passthrough.
  - `buildAlternates`: canonical + hreflang map for each locale.
  - `<Link>` href transform: internal/external/hash/mailto/admin/already-prefixed/UrlObject.
  - Middleware: rewrite for `/de/…`, 301 for `/DE/…`, passthrough for `/`, exclusion of
    `/api` `/admin` `/_next` `/sitemap.xml`.
  - `translateMeta`: cache hit, miss→Weglot, error→English fallback, `en` passthrough.
- **Manual / e2e:**
  - Fresh `/de/trip/x` (cleared cookies) → German content + `<html lang=de>` + canonical
    `…/de/trip/x` + reciprocal hreflang.
  - Navigate via cards/nav → URL stays under `/de`.
  - Switch FR → `/fr/…`; switch EN → root; language persists on reload.
  - `/DE/trip/x` → 301 → `/de/trip/x`.
  - `view-source` sitemap.xml → `/de` `/fr` alternates present.
  - `/admin` and `/api` unaffected.

## Rollout / risks

- **Wide diff** from the `<Link>` migration — mechanical but touches many public components;
  plan should batch by area and keep admin untouched.
- **Dynamic rendering:** reading `headers()` in layout/metadata forces dynamic rendering for
  public routes; confirm this doesn't regress any intentionally-static route or caching.
- **Redirect loops:** middleware matcher must exclude assets and the rewrite must strip exactly
  one locale segment.
- **Indexing consolidation:** ensure exactly one canonical per language and reciprocal hreflang
  to avoid duplicate-content signals between root and `/en`-less English.
- **Body still English in raw HTML** — accepted; revisit with a server-side render path or
  Weglot proxy if crawler JS rendering proves insufficient.
