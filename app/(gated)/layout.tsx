/**
 * app/(gated)/layout.tsx
 * Nested layout wrapping the "development pages" (see lib/development-pages.ts).
 *
 * It enforces the admin-toggleable visibility gate: a disabled page returns a
 * real 404 to the public, while a logged-in admin still sees it (preview).
 *
 * The gate lives here rather than in the root layout because Next.js 16 forbids
 * notFound() in the root layout (it defines <html>/<body> and must always
 * render). A nested layout IS allowed to call notFound(), which renders the
 * not-found boundary inside the root layout with a genuine 404 status.
 *
 * Route groups `(gated)` do not affect the URL, so `/emergency` etc. are
 * unchanged; this layout is transparent apart from the gate.
 */
import { cookies, headers } from "next/headers"
import { notFound } from "next/navigation"
import { verifySession } from "@/lib/auth"
import { dbGetDisabledPages } from "@/lib/db/queries"
import { isDevPageBlocked, topLevelSlug, DEVELOPMENT_PAGE_SLUGS } from "@/lib/development-pages"
import { PATHNAME_HEADER, PATHNAME_SIG_HEADER, verifyPathname } from "@/lib/site-protection"

export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  // Trust the pathname only when the proxy's companion signature verifies —
  // same guard the root layout uses. Every page under this group has a
  // non-empty top-level slug, so the proxy always ran and signed the path.
  const hdrs = await headers()
  const rawPathname = hdrs.get(PATHNAME_HEADER)
  const trusted = rawPathname
    ? await verifyPathname(rawPathname, hdrs.get(PATHNAME_SIG_HEADER))
    : false
  const pathname = trusted && rawPathname ? rawPathname : "/"

  const slug = topLevelSlug(pathname)
  if (DEVELOPMENT_PAGE_SLUGS.has(slug)) {
    const adminToken = (await cookies()).get("admin_session")?.value
    const isAdmin = adminToken ? Boolean(await verifySession(adminToken)) : false
    const disabled = await dbGetDisabledPages().catch(() => [] as string[])
    if (isDevPageBlocked(pathname, disabled, isAdmin)) {
      notFound()
    }
  }

  return <>{children}</>
}
