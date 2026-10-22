import type { ReactNode } from "react"
import { Link } from "@/components/i18n/link"

/** Link to an admin-configured legal URL (Header & Footer → Legal Links).
 *  External http(s) URLs open in a new tab; site paths use the locale-aware Link. */
export function LegalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (/^https?:\/\//i.test(href)) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
  }
  return <Link href={href} className={className}>{children}</Link>
}
