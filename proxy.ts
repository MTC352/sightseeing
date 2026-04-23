import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  const response = NextResponse.next()

  /* AEO: Allow AI crawlers to use maximum content from all pages */
  response.headers.set(
    "X-Robots-Tag",
    "all, max-snippet:-1, max-image-preview:large, max-video-preview:-1"
  )

  /* Point AI agents to our llms.txt for site context */
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
