import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifySession } from "@/lib/auth"
import { canAccessPath } from "@/lib/admin-permissions"
import { PATHNAME_HEADER, PATHNAME_SIG_HEADER, signPathname } from "@/lib/site-protection"

const PUBLIC_AUTH_PATHS = [
  "/admin/login",
  "/api/admin/auth/login",
  "/api/admin/auth/logout",
]

// Legacy trip-URL segment: internal id (`tcms_21`) or raw palisis_id (`21`).
// WordPress-style slugs are kebab text and never match these, so this only ever
// fires for old/canonical id links — never for real slug URLs.
const LEGACY_TRIP_ID = /^(?:tcms_\d+|\d+)$/

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Canonical trip-slug redirect (SEO 301) ──────────────────────────────
  // Old id / palisis_id trip URLs permanently redirect to `/trip/{slug}`.
  // Done here (before rendering) so Next emits a true HTTP 308 — a page-level
  // redirect() degrades to a soft client redirect under streaming SSR.
  if (pathname.startsWith("/trip/")) {
    const seg = pathname.slice("/trip/".length)
    if (seg && !seg.includes("/") && LEGACY_TRIP_ID.test(seg)) {
      try {
        // Resolve the slug over the internal loopback rather than the public
        // host — the container can't reliably self-fetch its own external URL
        // (it round-trips the edge proxy and fails), but localhost always works.
        const port = process.env.PORT || "5000"
        const lookup = `http://127.0.0.1:${port}/api/trip-slug/${encodeURIComponent(seg)}`
        const res = await fetch(lookup, { headers: { accept: "application/json" } })
        if (res.ok) {
          const { slug } = (await res.json()) as { slug: string | null }
          if (slug && slug !== seg) {
            const target = request.nextUrl.clone()
            target.pathname = `/trip/${slug}`
            return NextResponse.redirect(target, 308)
          }
        }
      } catch {
        // Lookup failed — fall through and let the page render normally.
      }
    }
  }

  // ── Admin auth guard ────────────────────────────────────────────────────
  const isAdminPage = pathname.startsWith("/admin")
  const isAdminApi = pathname.startsWith("/api/admin")

  if (isAdminPage || isAdminApi) {
    const isPublic = PUBLIC_AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))

    if (!isPublic) {
      const token = request.cookies.get("admin_session")?.value
      const session = token ? await verifySession(token) : null

      if (!session) {
        if (isAdminApi) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        const loginUrl = new URL("/admin/login", request.url)
        loginUrl.searchParams.set("redirect", pathname)
        return NextResponse.redirect(loginUrl)
      }

      // ── Role/permission gate ──────────────────────────────────────────────
      // Employees (non-superadmin) are limited to the sections granted on their
      // account. The superadmin role bypasses all of these checks.
      if (!canAccessPath(pathname, session.role, session.permissions)) {
        if (isAdminApi) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        const home = new URL("/admin", request.url)
        home.searchParams.set("denied", "1")
        return NextResponse.redirect(home)
      }
    }
  }

  // ── AEO & AI crawler headers ────────────────────────────────────────────
  // Expose the request pathname to server components (the root layout reads it
  // to bypass the frontend password gate on /admin routes). The companion
  // signature header is what makes this trustworthy: `/` is excluded from the
  // matcher, so the layout only honours `x-pathname` when the signature (derived
  // from ADMIN_JWT_SECRET) verifies. Setting both here overwrites any client-
  // supplied values, and a bare `/` request (proxy never runs) carries no valid
  // signature, so the layout treats it as the gated public homepage.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(PATHNAME_HEADER, pathname)
  requestHeaders.set(PATHNAME_SIG_HEADER, await signPathname(pathname))
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(
    "X-Robots-Tag",
    "all, max-snippet:-1, max-image-preview:large, max-video-preview:-1"
  )
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"
  response.headers.set(
    "Link",
    `<${base}/llms.txt>; rel="ai-agent"; type="text/plain", <${base}/api/trips>; rel="api"; type="application/json"`
  )

  return response
}

// Next.js 16 requires the named "proxy" export — default is kept for compatibility
export { proxy as default }

export const config = {
  // The trailing `.+` (NOT `.*`) deliberately EXCLUDES the bare root path `/`
  // from middleware. The autoscale deploy startup probe hits `GET /`, and `/` is
  // a statically-prerendered (ISR) page — so with `/` excluded the probe is
  // served pure static HTML with ZERO per-request JS. Running middleware on `/`
  // forces the Edge runtime to cold-compile its bundle (jose + auth + perms) on
  // the first request, which on a contended 2-vCPU cold instance overruns the
  // probe deadline ("context deadline exceeded") and fails every publish. Every
  // other route (≥1 char after the leading slash) still runs middleware, so the
  // admin auth/permission gate is unchanged. `/` only loses the AEO `X-Robots-Tag`
  // / `Link` headers, which are redundant with the layout's robots metadata.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|images/|.*\\.svg$|.*\\.png$|.*\\.jpg$).+)",
  ],
}
