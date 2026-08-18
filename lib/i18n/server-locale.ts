import { headers } from "next/headers"
import { ALL_LOCALES, type Locale } from "./routing"

/** Current request locale, from the x-locale header set by proxy.ts. */
export async function getRequestLocale(): Promise<Locale> {
  const l = (await headers()).get("x-locale") ?? "en"
  return (ALL_LOCALES as readonly string[]).includes(l) ? (l as Locale) : "en"
}
