# Client-side Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the redirecting Weglot subdirectory snippet with a custom client-side DOM translator that translates the whole rendered page (static + client-fetched) in place, backed by a cached server proxy over Weglot's translate API, with language stored in a cookie (no `/fr` URLs).

**Architecture:** A client engine walks the DOM, collects translatable text/attributes, and asks our own `/api/i18n/translate` route for translations; that route serves from a Postgres cache and calls Weglot only for misses. A debounced `MutationObserver` re-applies translations to client-fetched content and after React re-renders. All testable logic lives in pure `lib/i18n/*` modules; DOM/DB/network wiring is thin.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Postgres (`@/lib/db`), Weglot translate API, Node built-in test runner (`node --test`).

## Global Constraints

- Supported target languages: `fr`, `de`. Source language: `en`. (Copied from spec.)
- Language cookie name: `site_lang`. Default `en`.
- Weglot translate endpoint: `POST https://api.weglot.com/translate?api_key=<key>` with body `{ l_from, l_to, request_url, words: [{ t: 1, w: string }] }`, returning aligned `from_words` / `to_words` arrays. Key resolved server-side only via `dbGetWeglotApiKey()` from `@/lib/db/queries`.
- Max texts per translate request batch: `200` (client chunks larger sets).
- Graceful degradation: any translation miss/error leaves the affected text in English; never break the page or 500 the whole request for a partial failure.
- Do not translate admin routes (`/admin/**`).
- Pure logic (unit-testable) goes in `lib/i18n/` with NO React/Next/`@/` imports so it compiles under the `pretest` tsc step (`--module commonjs --rootDir lib`).
- Follow the existing lazy `CREATE TABLE IF NOT EXISTS` + cached-promise pattern (see `lib/db/queries.ts` `ensureRevisionsTable`).

---

## File Structure

- Create `lib/i18n/config.ts` — constants + `isSupportedLang`. Pure.
- Create `lib/i18n/collect.ts` — `isTranslatableText`, `dedupe`, `chunk`. Pure, isomorphic.
- Create `lib/i18n/assemble.ts` — `splitCacheMisses`, `assembleTranslations`. Pure.
- Create `lib/i18n/hash.ts` — `sha256Hex` (server, `node:crypto`).
- Create `lib/i18n/cache.ts` — `getCachedTranslations`, `putTranslations` (+ lazy table). Server.
- Create `lib/i18n/weglot-translate.ts` — `translateWithWeglot`. Server.
- Create `app/api/i18n/translate/route.ts` — the cached proxy route.
- Create `components/i18n/translator.tsx` — client engine + `setSiteLang` / `getSiteLang`.
- Modify `app/layout.tsx` — mount `<Translator />` for non-admin, set `<html lang>` from cookie, remove `<WeglotScript>`.
- Modify `components/site-navbar.tsx` — switcher calls `setSiteLang` instead of Weglot.
- Modify `components/cookie-banner.tsx` — remove `WeglotScript`.
- Modify `proxy.ts` — revert the `/fr` `/de` locale rewrite.
- Modify `test/**` + `package.json` `pretest` — compile & test the pure `lib/i18n` modules.

---

## Task 1: i18n constants + pure collection helpers

**Files:**
- Create: `lib/i18n/config.ts`
- Create: `lib/i18n/collect.ts`
- Modify: `package.json` (`pretest` script)
- Test: `test/i18n/collect.test.mjs`

**Interfaces:**
- Produces:
  - `SUPPORTED_LANGS: readonly ["fr","de"]`, `SOURCE_LANG: "en"`, `LANG_COOKIE: "site_lang"`, `MAX_BATCH: 200` (from `config.ts`)
  - `isSupportedLang(x: string): x is "fr"|"de"` (from `config.ts`)
  - `isTranslatableText(s: string): boolean`, `dedupe(xs: string[]): string[]`, `chunk<T>(xs: T[], size: number): T[][]` (from `collect.ts`)

- [ ] **Step 1: Write the failing test**

Create `test/i18n/collect.test.mjs`:

```js
import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/i18n/collect.js")
const { isTranslatableText, dedupe, chunk } = mod

test("isTranslatableText rejects empty / whitespace / numeric / symbol-only", () => {
  assert.equal(isTranslatableText(""), false)
  assert.equal(isTranslatableText("   "), false)
  assert.equal(isTranslatableText("\n\t "), false)
  assert.equal(isTranslatableText("123"), false)
  assert.equal(isTranslatableText("€11"), false)
  assert.equal(isTranslatableText("45 - 60"), false)
  assert.equal(isTranslatableText("—"), false)
})

test("isTranslatableText accepts real words", () => {
  assert.equal(isTranslatableText("Book now"), true)
  assert.equal(isTranslatableText("Luxembourg"), true)
  assert.equal(isTranslatableText("Today's Best"), true)
})

test("dedupe preserves first-seen order", () => {
  assert.deepEqual(dedupe(["a", "b", "a", "c", "b"]), ["a", "b", "c"])
})

test("chunk splits into fixed-size groups", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(chunk([], 3), [])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mkdir -p test/i18n && node --test "test/i18n/collect.test.mjs"`
Expected: FAIL — cannot find `../../.test-build/i18n/collect.js`.

- [ ] **Step 3: Write `lib/i18n/config.ts`**

```ts
// Central i18n constants. Pure (no React/Next imports) so it compiles under the
// pretest tsc step and is safe to import from both server and client code.
export const SUPPORTED_LANGS = ["fr", "de"] as const
export type TargetLang = (typeof SUPPORTED_LANGS)[number]
export const SOURCE_LANG = "en" as const
export const LANG_COOKIE = "site_lang"
export const MAX_BATCH = 200

export function isSupportedLang(x: string): x is TargetLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(x)
}
```

- [ ] **Step 4: Write `lib/i18n/collect.ts`**

```ts
// Pure, isomorphic helpers for gathering and batching translatable strings.
// No DOM or Next imports here so this compiles for both the browser engine and
// the Node test runner.

// A string is worth translating only if it contains at least one letter.
// This skips whitespace, pure numbers, prices ("€11"), ranges ("45 - 60"),
// and punctuation/symbol-only nodes.
const HAS_LETTER = /\p{L}/u

export function isTranslatableText(s: string): boolean {
  const t = s.trim()
  if (t.length === 0) return false
  return HAS_LETTER.test(t)
}

export function dedupe(xs: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of xs) {
    if (!seen.has(x)) {
      seen.add(x)
      out.push(x)
    }
  }
  return out
}

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}
```

- [ ] **Step 5: Wire the pure modules into `pretest`**

In `package.json`, append this segment to the end of the existing `pretest` command (after the last `&& tsc ...` clause), so `.test-build/i18n/*.js` is produced:

```
 && tsc lib/i18n/config.ts lib/i18n/collect.ts lib/i18n/assemble.ts --rootDir lib --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop
```

(`assemble.ts` is created in Task 2; it is safe to list now — Task 2 runs before the next `npm test`.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run pretest && node --test "test/i18n/collect.test.mjs"`
Expected: PASS (4 tests).

> Note: if `pretest` errors because `lib/i18n/assemble.ts` does not exist yet, create an empty `export {}` placeholder in `lib/i18n/assemble.ts` to unblock this task; Task 2 fills it in.

- [ ] **Step 7: Commit**

```bash
git add lib/i18n/config.ts lib/i18n/collect.ts test/i18n/collect.test.mjs package.json
git commit -m "feat(i18n): pure constants + translatable-string helpers"
```

---

## Task 2: Response-assembly helpers

**Files:**
- Create/replace: `lib/i18n/assemble.ts`
- Test: `test/i18n/assemble.test.mjs`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `splitCacheMisses(texts: string[], cached: Map<string,string>): string[]`
  - `assembleTranslations(texts: string[], cached: Map<string,string>, fresh: Map<string,string>): Record<string,string>` — for each text, prefer `cached`, else `fresh`, else the source text itself (English fallback).

- [ ] **Step 1: Write the failing test**

Create `test/i18n/assemble.test.mjs`:

```js
import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/i18n/assemble.js")
const { splitCacheMisses, assembleTranslations } = mod

test("splitCacheMisses returns only uncached, deduped, in order", () => {
  const cached = new Map([["Book now", "Réservez"]])
  assert.deepEqual(
    splitCacheMisses(["Book now", "Search", "Search", "Help"], cached),
    ["Search", "Help"],
  )
})

test("assembleTranslations prefers cache, then fresh, else source fallback", () => {
  const cached = new Map([["Book now", "Réservez"]])
  const fresh = new Map([["Help", "Aide"]])
  assert.deepEqual(
    assembleTranslations(["Book now", "Help", "Missing"], cached, fresh),
    { "Book now": "Réservez", Help: "Aide", Missing: "Missing" },
  )
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test "test/i18n/assemble.test.mjs"`
Expected: FAIL — module missing exports (or file is the empty placeholder).

- [ ] **Step 3: Write `lib/i18n/assemble.ts`**

```ts
// Pure helpers for merging cached + freshly-translated strings into the
// response map. English fallback (source text) guarantees the client always
// receives a value for every requested string.
import { dedupe } from "./collect"

export function splitCacheMisses(texts: string[], cached: Map<string, string>): string[] {
  return dedupe(texts).filter((t) => !cached.has(t))
}

export function assembleTranslations(
  texts: string[],
  cached: Map<string, string>,
  fresh: Map<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of dedupe(texts)) {
    out[t] = cached.get(t) ?? fresh.get(t) ?? t
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run pretest && node --test "test/i18n/assemble.test.mjs"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/assemble.ts test/i18n/assemble.test.mjs
git commit -m "feat(i18n): cache-merge + English-fallback assembly helpers"
```

---

## Task 3: Server hash + Postgres translation cache

**Files:**
- Create: `lib/i18n/hash.ts`
- Create: `lib/i18n/cache.ts`

**Interfaces:**
- Consumes: `query` from `@/lib/db`.
- Produces:
  - `sha256Hex(s: string): string` (from `hash.ts`)
  - `getCachedTranslations(lang: string, texts: string[]): Promise<Map<string,string>>`
  - `putTranslations(lang: string, entries: Array<{ source: string; translated: string }>): Promise<void>`

- [ ] **Step 1: Write `lib/i18n/hash.ts`**

```ts
import { createHash } from "node:crypto"

// Stable content key for the (lang, source_text) primary key. Server-only.
export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex")
}
```

- [ ] **Step 2: Write `lib/i18n/cache.ts`**

```ts
import { query } from "@/lib/db"
import { sha256Hex } from "./hash"

// Lazy schema creation (same pattern as ensureRevisionsTable in queries.ts):
// created on first use so no separate migration step is needed.
let cacheTableReady: Promise<void> | null = null
function ensureCacheTable(): Promise<void> {
  if (!cacheTableReady) {
    cacheTableReady = query(`
      CREATE TABLE IF NOT EXISTS translation_cache (
        lang TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        source_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (lang, source_hash)
      );
    `)
      .then(() => undefined)
      .catch((err) => {
        cacheTableReady = null
        throw err
      })
  }
  return cacheTableReady
}

export async function getCachedTranslations(
  lang: string,
  texts: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (texts.length === 0) return out
  await ensureCacheTable()
  const hashes = texts.map((t) => sha256Hex(t))
  const rows = await query<{ source_text: string; translated_text: string }>(
    `SELECT source_text, translated_text FROM translation_cache
       WHERE lang = $1 AND source_hash = ANY($2::text[])`,
    [lang, hashes],
  )
  for (const r of rows) out.set(r.source_text, r.translated_text)
  return out
}

export async function putTranslations(
  lang: string,
  entries: Array<{ source: string; translated: string }>,
): Promise<void> {
  if (entries.length === 0) return
  await ensureCacheTable()
  // One multi-row upsert; ON CONFLICT DO NOTHING keeps the first translation.
  const values: string[] = []
  const params: unknown[] = []
  let i = 1
  for (const e of entries) {
    values.push(`($${i++}, $${i++}, $${i++}, $${i++})`)
    params.push(lang, sha256Hex(e.source), e.source, e.translated)
  }
  await query(
    `INSERT INTO translation_cache (lang, source_hash, source_text, translated_text)
       VALUES ${values.join(", ")}
       ON CONFLICT (lang, source_hash) DO NOTHING`,
    params,
  )
}
```

> Verified: `query<T>(sql, params): Promise<T[]>` in `lib/db.ts:64` returns the rows array directly, so the `rows` iteration above is correct.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "lib/i18n/(hash|cache)" || echo "i18n cache OK"`
Expected: `i18n cache OK`.

- [ ] **Step 4: Commit**

```bash
git add lib/i18n/hash.ts lib/i18n/cache.ts
git commit -m "feat(i18n): postgres translation cache with lazy schema"
```

---

## Task 4: Weglot translate wrapper

**Files:**
- Create: `lib/i18n/weglot-translate.ts`

**Interfaces:**
- Consumes: `dbGetWeglotApiKey` from `@/lib/db/queries`.
- Produces: `translateWithWeglot(lang: string, texts: string[]): Promise<Map<string,string>>` — maps each source text to its translation; returns an empty/partial map on any error (caller falls back to source).

- [ ] **Step 1: Write `lib/i18n/weglot-translate.ts`**

```ts
import { dbGetWeglotApiKey } from "@/lib/db/queries"
import { SOURCE_LANG } from "./config"

const WEGLOT_URL = "https://api.weglot.com/translate"
const TIMEOUT_MS = 8000
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

// Calls Weglot's translate API for the given source texts. Never throws:
// on a missing key, network error, non-200, or shape mismatch it returns
// whatever it could map (possibly empty), so the route degrades to English.
export async function translateWithWeglot(
  lang: string,
  texts: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (texts.length === 0) return out
  const key = (await dbGetWeglotApiKey().catch(() => "")).trim()
  if (!/^wg_[a-zA-Z0-9]+$/.test(key)) return out
  try {
    const res = await fetch(`${WEGLOT_URL}?api_key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        l_from: SOURCE_LANG,
        l_to: lang,
        request_url: SITE_URL,
        words: texts.map((w) => ({ t: 1, w })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return out
    const data = (await res.json().catch(() => ({}))) as {
      from_words?: unknown
      to_words?: unknown
    }
    const from = Array.isArray(data.from_words) ? (data.from_words as string[]) : []
    const to = Array.isArray(data.to_words) ? (data.to_words as string[]) : []
    // Prefer aligning by returned from_words; fall back to input order.
    const src = from.length === to.length && from.length > 0 ? from : texts
    for (let i = 0; i < to.length && i < src.length; i++) {
      if (typeof to[i] === "string" && to[i]) out.set(src[i], to[i])
    }
    return out
  } catch {
    return out
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "lib/i18n/weglot-translate" || echo "weglot wrapper OK"`
Expected: `weglot wrapper OK`.

- [ ] **Step 3: Commit**

```bash
git add lib/i18n/weglot-translate.ts
git commit -m "feat(i18n): weglot translate wrapper (fail-open to source)"
```

---

## Task 5: Cached translate API route

**Files:**
- Create: `app/api/i18n/translate/route.ts`

**Interfaces:**
- Consumes: `isSupportedLang`, `MAX_BATCH` (`config.ts`); `isTranslatableText`, `dedupe`, `chunk` (`collect.ts`); `splitCacheMisses`, `assembleTranslations` (`assemble.ts`); `getCachedTranslations`, `putTranslations` (`cache.ts`); `translateWithWeglot` (`weglot-translate.ts`).
- Produces: `POST /api/i18n/translate` → `{ translations: Record<string,string> }`.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server"
import { isSupportedLang, MAX_BATCH } from "@/lib/i18n/config"
import { isTranslatableText, dedupe, chunk } from "@/lib/i18n/collect"
import { splitCacheMisses, assembleTranslations } from "@/lib/i18n/assemble"
import { getCachedTranslations, putTranslations } from "@/lib/i18n/cache"
import { translateWithWeglot } from "@/lib/i18n/weglot-translate"

export const runtime = "nodejs"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const { lang, texts } = (body ?? {}) as { lang?: string; texts?: unknown }
  if (!lang || !isSupportedLang(lang)) {
    return NextResponse.json({ error: "Unsupported lang" }, { status: 400 })
  }
  if (!Array.isArray(texts)) {
    return NextResponse.json({ error: "texts must be an array" }, { status: 400 })
  }

  // Only real strings, deduped and filtered; hard-cap the working set so one
  // request can never blow past the batch ceiling by too much.
  const wanted = dedupe(
    texts.filter((t): t is string => typeof t === "string").filter(isTranslatableText),
  ).slice(0, MAX_BATCH * 10)

  if (wanted.length === 0) return NextResponse.json({ translations: {} })

  const cached = await getCachedTranslations(lang, wanted)
  const misses = splitCacheMisses(wanted, cached)

  const fresh = new Map<string, string>()
  for (const batch of chunk(misses, MAX_BATCH)) {
    const translated = await translateWithWeglot(lang, batch)
    for (const [k, v] of translated) fresh.set(k, v)
  }

  // Persist only genuinely new translations (skip source-equal fallbacks).
  const toStore = [...fresh.entries()]
    .filter(([source, translated]) => translated && translated !== source)
    .map(([source, translated]) => ({ source, translated }))
  await putTranslations(lang, toStore).catch(() => {})

  return NextResponse.json({ translations: assembleTranslations(wanted, cached, fresh) })
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/api/i18n/translate" || echo "route OK"`
Expected: `route OK`.

- [ ] **Step 3: Manual verification against the dev server**

Ensure a dev server is running (`npm run dev`), then:

```bash
curl -s -X POST "http://localhost:3001/api/i18n/translate" \
  -H "Content-Type: application/json" \
  -d '{"lang":"fr","texts":["Book now","Search activities","€11","Book now"]}'
```
Expected: JSON like `{"translations":{"Book now":"Réservez dès maintenant","Search activities":"Activités de recherche"}}` — note `€11` is filtered out, duplicate collapsed. Run it a second time and confirm it still returns (now served from cache).

Verify the cache row exists:
```bash
DBURL=$(grep -E "^DATABASE_URL=" .env | head -1 | cut -d= -f2- | tr -d '"')
psql "$DBURL" -tAc "SELECT lang, count(*) FROM translation_cache GROUP BY lang;"
```
Expected: a `fr` row count ≥ 1.

- [ ] **Step 4: Commit**

```bash
git add app/api/i18n/translate/route.ts
git commit -m "feat(i18n): cached translate proxy route"
```

---

## Task 6: Client translator engine

**Files:**
- Create: `components/i18n/translator.tsx`

**Interfaces:**
- Consumes: `SOURCE_LANG`, `LANG_COOKIE`, `MAX_BATCH`, `isSupportedLang` (`config.ts`); `isTranslatableText`, `dedupe`, `chunk` (`collect.ts`).
- Produces:
  - React component `Translator` (mounts the engine; renders nothing).
  - `setSiteLang(lang: string): void` — sets the cookie and applies (fr/de) or reloads to restore English.
  - `getSiteLang(): string` — reads the cookie (defaults `SOURCE_LANG`).
  - `useSiteLang(): { lang: string; ready: boolean; setLang: (l: string) => void }` — hook for the navbar.

- [ ] **Step 1: Write the engine**

```tsx
"use client"

import { useEffect, useState } from "react"
import { SOURCE_LANG, LANG_COOKIE, MAX_BATCH, isSupportedLang } from "@/lib/i18n/config"
import { isTranslatableText, dedupe, chunk } from "@/lib/i18n/collect"

const ATTRS = ["placeholder", "alt", "title", "aria-label"]
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE"])

function readCookie(name: string): string {
  if (typeof document === "undefined") return ""
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"))
  return m ? decodeURIComponent(m[1]) : ""
}

export function getSiteLang(): string {
  const c = readCookie(LANG_COOKIE)
  return isSupportedLang(c) ? c : SOURCE_LANG
}

// Per-language source->translation map, kept in memory and mirrored to
// localStorage so repeat visits skip the network entirely.
const memCache: Record<string, Map<string, string>> = {}
function cacheFor(lang: string): Map<string, string> {
  if (!memCache[lang]) {
    memCache[lang] = new Map()
    try {
      const raw = localStorage.getItem("i18n_cache_" + lang)
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) memCache[lang].set(k, v)
    } catch {}
  }
  return memCache[lang]
}
function persistCache(lang: string): void {
  try {
    localStorage.setItem("i18n_cache_" + lang, JSON.stringify(Object.fromEntries(cacheFor(lang))))
  } catch {}
}

function skip(node: Node): boolean {
  let el: HTMLElement | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true
    if (el.getAttribute("translate") === "no") return true
    if (el.hasAttribute("data-no-i18n")) return true
    if (el.isContentEditable) return true
    el = el.parentElement
  }
  return false
}

function collectTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const out: Text[] = []
  let n = walker.nextNode()
  while (n) {
    const tn = n as Text
    if (isTranslatableText(tn.nodeValue ?? "") && !skip(tn)) out.push(tn)
    n = walker.nextNode()
  }
  return out
}

function collectAttrTargets(root: ParentNode): Array<{ el: Element; attr: string }> {
  const out: Array<{ el: Element; attr: string }> = []
  for (const attr of ATTRS) {
    root.querySelectorAll("[" + attr + "]").forEach((el) => {
      const v = el.getAttribute(attr) ?? ""
      if (isTranslatableText(v) && !skip(el)) out.push({ el, attr })
    })
  }
  return out
}

let currentLang = SOURCE_LANG
let observer: MutationObserver | null = null
let pending = false

async function fetchMissing(lang: string, texts: string[]): Promise<void> {
  const cache = cacheFor(lang)
  const missing = dedupe(texts).filter((t) => !cache.has(t))
  if (missing.length === 0) return
  for (const batch of chunk(missing, MAX_BATCH)) {
    try {
      const res = await fetch("/api/i18n/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, texts: batch }),
      })
      if (!res.ok) continue
      const data = (await res.json()) as { translations?: Record<string, string> }
      for (const [k, v] of Object.entries(data.translations ?? {})) cache.set(k, v)
    } catch {}
  }
  persistCache(lang)
}

function apply(lang: string, textNodes: Text[], attrTargets: Array<{ el: Element; attr: string }>): void {
  const cache = cacheFor(lang)
  for (const tn of textNodes) {
    const raw = tn.nodeValue ?? ""
    const key = raw.trim()
    const t = cache.get(key)
    if (t && t !== key) tn.nodeValue = raw.replace(key, t)
  }
  for (const { el, attr } of attrTargets) {
    const key = (el.getAttribute(attr) ?? "").trim()
    const t = cache.get(key)
    if (t && t !== key) el.setAttribute(attr, t)
  }
}

async function translatePass(root: ParentNode = document.body): Promise<void> {
  if (currentLang === SOURCE_LANG) return
  const textNodes = collectTextNodes(root)
  const attrTargets = collectAttrTargets(root)
  const strings = dedupe([
    ...textNodes.map((n) => (n.nodeValue ?? "").trim()),
    ...attrTargets.map(({ el, attr }) => (el.getAttribute(attr) ?? "").trim()),
  ]).filter(isTranslatableText)
  // Apply what we already know immediately (handles React reverts with zero
  // network), then fetch the rest and apply again.
  apply(currentLang, textNodes, attrTargets)
  await fetchMissing(currentLang, strings)
  apply(currentLang, textNodes, attrTargets)
}

function startObserver(): void {
  if (observer) return
  observer = new MutationObserver(() => {
    if (pending) return
    pending = true
    // Debounce bursts of React mutations into a single pass.
    setTimeout(() => {
      pending = false
      void translatePass(document.body)
    }, 150)
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
}

export function setSiteLang(lang: string): void {
  document.cookie = LANG_COOKIE + "=" + encodeURIComponent(lang) + "; path=/; max-age=31536000; samesite=lax"
  if (!isSupportedLang(lang)) {
    // Back to English: reload to restore original source text cleanly.
    currentLang = SOURCE_LANG
    document.documentElement.lang = SOURCE_LANG
    location.reload()
    return
  }
  currentLang = lang
  document.documentElement.lang = lang
  void translatePass(document.body)
  startObserver()
}

export function Translator() {
  useEffect(() => {
    const lang = getSiteLang()
    currentLang = lang
    if (isSupportedLang(lang)) {
      document.documentElement.lang = lang
      void translatePass(document.body)
      startObserver()
    }
    return () => {
      observer?.disconnect()
      observer = null
    }
  }, [])
  return null
}

// Hook for the navbar switcher.
export function useSiteLang(): { lang: string; ready: boolean; setLang: (l: string) => void } {
  const [lang, setLang] = useState(SOURCE_LANG)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setLang(getSiteLang())
    setReady(true)
  }, [])
  return {
    lang,
    ready,
    setLang: (l: string) => {
      setLang(isSupportedLang(l) ? l : SOURCE_LANG)
      setSiteLang(l)
    },
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/i18n/translator" || echo "engine OK"`
Expected: `engine OK`.

- [ ] **Step 3: Commit**

```bash
git add components/i18n/translator.tsx
git commit -m "feat(i18n): client DOM translation engine"
```

---

## Task 7: Mount the engine + drive `<html lang>` from the cookie

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `Translator` (`components/i18n/translator.tsx`); `LANG_COOKIE`, `isSupportedLang`, `SOURCE_LANG` (`config.ts`); `cookies()` from `next/headers` (already used in layout).

- [ ] **Step 1: Read current layout structure**

Run: `grep -n "WeglotScript\|<html\|isAdminRoute\|cookies()\|CookieBanner\|loadWeglot" app/layout.tsx`
Confirm: `<html lang="en" ...>` on the render path (~line 190), `isAdminRoute` boolean exists (~line 165), `cookies()` is imported.

- [ ] **Step 2: Compute the server-side language for `<html lang>`**

Near where `isAdminRoute` is computed, add:

```ts
import { LANG_COOKIE, isSupportedLang } from "@/lib/i18n/config"
// ...
const langCookie = (await cookies()).get(LANG_COOKIE)?.value ?? "en"
const htmlLang = !isAdminRoute && isSupportedLang(langCookie) ? langCookie : "en"
```

- [ ] **Step 3: Use `htmlLang` on the rendered `<html>`**

Change the main `return`'s `<html lang="en" className={instrumentSans.variable}>` to:

```tsx
<html lang={htmlLang} className={instrumentSans.variable}>
```

(Leave the locked/`SiteAccessGate` `<html lang="en">` branch as-is.)

- [ ] **Step 4: Mount `<Translator />` for non-admin routes**

Add the import at the top:

```tsx
import { Translator } from "@/components/i18n/translator"
```

In the body, next to `<CookieBanner .../>`, render the engine only off-admin:

```tsx
{!isAdminRoute && <Translator />}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/layout" || echo "layout OK"`
Expected: `layout OK`.

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(i18n): mount translator + html lang from cookie"
```

---

## Task 8: Point the navbar switcher at the engine

**Files:**
- Modify: `components/site-navbar.tsx`

**Interfaces:**
- Consumes: `useSiteLang` (`components/i18n/translator.tsx`).

- [ ] **Step 1: Replace Weglot state with the engine hook**

Remove the `weglotReady` / `currentLang` `useState` + the `setInterval` Weglot-polling `useEffect` + the `switchLanguage` function (lines around 57–96), and replace the language wiring with:

```tsx
import { useSiteLang } from "@/components/i18n/translator"
// inside Navbar():
const { lang: currentLang, ready: weglotReady, setLang: switchLanguage } = useSiteLang()
```

(Keeping the local names `currentLang`, `weglotReady`, `switchLanguage` means the existing desktop switcher JSX at ~127–148 and mobile switcher at ~196–210 need no further edits.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/site-navbar" || echo "navbar OK"`
Expected: `navbar OK`.

- [ ] **Step 3: Manual end-to-end check**

With `npm run dev` running, open `http://localhost:3001/`:
- Click **FR** → page text (including client-fetched trip cards) translates to French **in place**; URL stays `http://localhost:3001/` (no `/fr`, no redirect).
- Click **DE** → German. Click **EN** → page reloads back to English.
- Reload while on FR → page loads and re-translates to French.

- [ ] **Step 4: Commit**

```bash
git add components/site-navbar.tsx
git commit -m "feat(i18n): navbar switcher uses in-place translator"
```

---

## Task 9: Remove the Weglot snippet and revert the `/fr` scaffolding

**Files:**
- Modify: `components/cookie-banner.tsx` (remove `WeglotScript`)
- Modify: `app/layout.tsx` (drop `WeglotScript` usage + `loadWeglot`/health gating if now unused)
- Modify: `proxy.ts` (revert locale rewrite)

**Interfaces:**
- None produced; this is cleanup.

- [ ] **Step 1: Remove `WeglotScript` from `components/cookie-banner.tsx`**

Delete the entire `export function WeglotScript(...) { ... }` definition (the inline-script component). Leave the rest of the file (cookie banner, `ConsentedScripts`, etc.) intact.

- [ ] **Step 2: Remove `WeglotScript` usage from `app/layout.tsx`**

Remove the `{loadWeglot && <WeglotScript apiKey={weglotApiKey} />}` line and the `WeglotScript` import. If `loadWeglot`, `weglotHealth`, `getWeglotHealth`, and `weglotApiKey` are now unused in the layout, remove them too (run `grep -n "weglotApiKey\|loadWeglot\|weglotHealth\|getWeglotHealth\|WeglotScript" app/layout.tsx` and delete only the now-dead references — keep `dbGetWeglotApiKey` in `lib/db/queries` since the API route uses it).

- [ ] **Step 3: Revert the locale rewrite in `proxy.ts`**

Remove the `LOCALE_PREFIX` constant, the locale detection block at the top of `proxy()`, and the `locale ? NextResponse.rewrite(...) : NextResponse.next(...)` split — restoring `const { pathname } = request.nextUrl` and the single `const response = NextResponse.next({ request: { headers: requestHeaders } })`. (This reverts commit `118992f`; `git show 118992f -- proxy.ts` shows exactly what to undo.)

- [ ] **Step 4: Verify nothing else references the removed pieces**

Run: `grep -rn "WeglotScript\|LOCALE_PREFIX" app components proxy.ts` → expect no matches.
Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/layout|proxy.ts|cookie-banner" || echo "cleanup OK"`
Expected: `cleanup OK`.

- [ ] **Step 5: Confirm the switcher still works**

Reload `http://localhost:3001/`, switch FR/DE/EN again (same checks as Task 8, Step 3) to confirm removing the snippet didn't regress anything.

- [ ] **Step 6: Commit**

```bash
git add components/cookie-banner.tsx app/layout.tsx proxy.ts
git commit -m "refactor(i18n): remove Weglot snippet + /fr rewrite (superseded by in-place translator)"
```

---

## Final verification

- [ ] Run the unit suite: `npm test` → all i18n tests pass (Tasks 1–2) alongside existing tests.
- [ ] Full typecheck: `npx tsc --noEmit -p tsconfig.json` → no NEW errors in `lib/i18n`, `app/api/i18n`, `components/i18n`, `app/layout.tsx`, `components/site-navbar.tsx`, `proxy.ts` (pre-existing `.next/types` + GeoJSON errors may remain).
- [ ] Manual e2e (dev server): FR/DE translate static shell + client-fetched trip cards in place; EN restores; reload keeps language; `/api/i18n/translate` second call served from cache; `translation_cache` table populated.
- [ ] Spot-check no `/fr` URL is ever produced by the switcher and there is no redirect.

## Notes / open items carried from the spec

- **SEO is NOT solved** — crawlers see English only (client-side translation). Tracked in the design doc as the key remaining item.
- No cache TTL/invalidation yet; stale strings linger under old hashes.
- Brief FOUC (English → translated) is expected, especially for client-fetched content.
