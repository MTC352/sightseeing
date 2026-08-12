# Client-side translation (Weglot API backend, cached) — Design

- **Date:** 2026-08-12
- **Status:** Approved (design), ready for implementation plan
- **Author:** Prashant Lukhi + Claude

## Problem

The site's language switcher (EN / FR / DE) does not translate the site.

Root cause (confirmed via Weglot's settings API + live console testing):

- The Weglot project (`project_slug: sightseeing-2`) is a **WordPress / subdirectory**
  integration (`technology_id: 1`, `technology_name: "WordPress"`). In this mode Weglot
  expects translated HTML to be produced **server-side** at `/fr`, `/de` subdirectory URLs;
  the `weglot.min.js` snippet only drives the switcher and **redirects** to those URLs.
- This app is self-hosted **Next.js** with **no** Weglot proxy/server-side plugin, so `/fr`
  is never translated. `Weglot.switchTo('fr')` hard-redirects to `/fr` (dropping the port on
  localhost) and the destination 404s or shows English.
- The integration mode is a **dashboard toggle** ("Subdomains or Subdirectories"). We have
  **only the API key**, not dashboard access, so we cannot switch the project to in-place
  JavaScript mode.
- Additionally, the site is **heavily client-rendered**: the homepage's real content
  (trips, categories, prices, descriptions) is fetched client-side after load and is **not**
  in the server-rendered HTML. So pure server-side HTML translation would leave most of the
  page in English.

Conclusion: with only the API key and a client-rendered app, we must supply our own
translation layer that translates the **rendered DOM** (covering client-fetched content),
using Weglot's translate API as the machine-translation backend.

## Validated assumptions

- `POST https://api.weglot.com/translate?api_key=<key>` with
  `{ l_from, l_to, request_url, words: [{ t: 1, w: "text" }, ...] }` returns HTTP 200 with
  aligned `from_words` / `to_words` arrays. Verified with the configured key:
  - "Book now" → "Réservez dès maintenant"
  - "Best outdoor experiences today" → "Les meilleures activités de plein air du jour"
- Project target languages: `fr`, `de`; source language: `en`.

## Goals

- Clicking FR / DE translates the **entire visible page** (static shell **and** client-fetched
  content) in place, with **no URL change and no redirect**.
- Language choice persists across navigation and reloads (cookie).
- Translation cost/quota stays low via a **shared, persistent cache**.
- Graceful degradation: any translation failure leaves the affected text in English; the page
  never breaks.

## Non-goals (this iteration)

- Per-language SEO (see Open Items — deferred, still important).
- Translating admin routes (`/admin/**`) — public site only.
- Restoring the Weglot subdirectory `/fr` URL scheme.
- Glossary / exclusion-block parity with Weglot beyond basic skip rules.

## Architecture

Replace the Weglot snippet entirely with a custom, lightweight i18n engine backed by a
cached server-side translate proxy.

```
[Navbar switcher] --setLang(fr)--> [Translator engine (client)]
                                         | collect DOM text/attrs, dedupe, filter
                                         v
                            POST /api/i18n/translate { lang, texts[] }
                                         |
                                         v
                         [translation_cache (Postgres)]  --miss-->  [Weglot translate API]
                                         |  <--cache/return--            (key server-side)
                                         v
                            { source -> translated } applied to the DOM
                                         ^
                            [MutationObserver] re-applies to client-fetched
                            content and after React re-renders
```

### Components

1. **DB cache table `translation_cache`**
   - Columns: `lang TEXT`, `source_hash TEXT`, `source_text TEXT`, `translated_text TEXT`,
     `created_at TIMESTAMPTZ DEFAULT now()`.
   - Primary key: `(lang, source_hash)` where `source_hash = sha256(source_text)`.
   - One shared cache across all visitors. Translations are stable, so no TTL for now
     (invalidation is a future concern; see Open Items).

2. **Server route `POST /api/i18n/translate`**
   - Input: `{ lang: "fr" | "de", texts: string[] }`.
   - Validates `lang` against the supported target set (`fr`, `de`); rejects others (400).
   - Dedupes `texts`; caps batch size (e.g. 200 per request — client chunks larger sets).
   - Looks up `(lang, hash)` in `translation_cache`; collects misses.
   - For misses: calls Weglot translate API (key via existing `dbGetWeglotApiKey`, server-side
     only), inserts results into cache.
   - Returns `{ translations: { [sourceText]: translatedText } }`.
   - On Weglot error / timeout: returns source text for the affected entries (English fallback);
     does not cache failures. Never 500s the whole request for a partial failure.

3. **Client engine `components/i18n/translator.tsx`** (`"use client"`, mounted globally in the
   root layout for non-admin routes)
   - Reads current language from a `site_lang` cookie (default `en`).
   - `setLang(lang)`: writes the cookie, sets `document.documentElement.lang`, and either
     translates (fr/de) or reloads to restore English (en).
   - **Collect**: walk `document.body` for translatable text nodes and translatable attributes
     (`placeholder`, `alt`, `title`, `aria-label`).
     - Skip: `script`, `style`, `noscript`, editable elements (`input`/`textarea`/
       `[contenteditable]`), nodes under `[translate="no"]` or `[data-no-i18n]`, and strings that
       are whitespace/number/symbol-only.
   - **Fetch**: check client cache (in-memory Map + `localStorage`) first; for unknown strings,
     `POST /api/i18n/translate` in chunks.
   - **Apply**: replace text-node content / attribute values with translations; record applied
     nodes in a `WeakSet` and maintain a `source -> translated` Map for the active language.
   - **MutationObserver** on `document.body` (`childList`, `subtree`, `characterData`), debounced
     (~150 ms): collects newly added / reverted translatable strings and applies translations.
     If an observed English string is already in the `source -> translated` Map, it is swapped
     immediately without a network call (handles React re-renders / reverts and client-fetched
     content). This is the mechanism that makes the engine robust rather than fragile.
   - Ready state exposed so the navbar can enable the switcher.

4. **Language switcher (existing `components/site-navbar.tsx`)**
   - Replace `Weglot.switchTo(code)` with the engine's `setLang(code)`.
   - Replace `weglotReady` / `Weglot.getCurrentLang()` with the engine's ready state and the
     `site_lang` cookie.
   - Keep the EN / FR / DE desktop + mobile UI.

### Data flow

1. FR clicked → `setLang('fr')` → cookie `site_lang=fr`, `<html lang="fr">`, run full translate pass.
2. Collect → dedupe → client cache → miss list → `POST /api/i18n/translate` → server cache / Weglot
   → apply to DOM → populate client cache.
3. Client-fetched content or client navigation renders new nodes → observer → translate/apply.
4. Reload with `site_lang=fr` → engine runs a full pass on load; observer catches late content.
5. Switch to EN → cookie `site_lang=en` → reload (source language, cleanest restore).

### Removals / reverts

- Remove `WeglotScript` (redirecting snippet) and its `data-cookieconsent="ignore"` attribute —
  no third-party script remains; `/api/i18n/translate` is same-origin, so consent gating is moot.
- Revert the `proxy.ts` `/fr` `/de` rewrite (commit `118992f`).
- Revert the navbar URL-highlight change.
- Keep the Weglot **API key** (now used only server-side by the proxy).

## Error handling & degradation

- Translate proxy failure or partial Weglot error → affected strings stay English; page intact.
- Numeric / price / symbol-only strings are skipped to avoid mistranslation.
- Batching + debounce bound performance and API load.

## Testing

- **Server route**: cache hit/miss, Weglot-error → English fallback, `lang` validation, batch
  dedupe, hashing.
- **Engine pure helpers**: translatable-string filter, dedupe, apply-map — unit-tested (jsdom).
- **Manual / e2e**: switch FR/DE; confirm static shell **and** client-fetched content translate;
  confirm EN restores; confirm a reload keeps the chosen language.

## Open items (deferred, still important)

- **SEO — NOT SOLVED.** Translation is client-side / post-load, so search engines and social
  crawlers see **English only**. The previous Weglot subdirectory mode promised per-language
  SEO URLs (`/fr`, `/de`); this approach gives that up. A future solution (e.g. server-side
  translated routes for crawlers, or regaining Weglot dashboard access to run a proper
  integration) is required if per-language SEO becomes a requirement. **Track this.**
- **Cache invalidation:** no TTL yet; if source copy changes, stale translations persist under a
  new hash automatically (new hash = new entry), but removed strings linger. Acceptable for now.
- **FOUC:** brief English flash before translation applies, especially for client-fetched content.
```
