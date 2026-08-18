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
