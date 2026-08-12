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
