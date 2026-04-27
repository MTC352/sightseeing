import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifySession } from "@/lib/auth"

const PUBLIC_AUTH_PATHS = [
  "/admin/login",
  "/api/admin/auth/login",
  "/api/admin/auth/logout",
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

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
    }
  }

  // ── AEO & AI crawler headers ────────────────────────────────────────────
  const response = NextResponse.next()
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
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|images/|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)",
  ],
}
