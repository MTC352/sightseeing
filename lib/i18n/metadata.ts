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
