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
