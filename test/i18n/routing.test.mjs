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
