import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { dbGetSiteProtection } from "@/lib/db/queries"
import { signSiteAccess, siteAccessCookieOptions } from "@/lib/site-protection"

export const dynamic = "force-dynamic"

/**
 * Public endpoint backing the frontend password gate. Verifies the submitted
 * password against the admin-configured value and, on success, sets the signed
 * HttpOnly `site_access` cookie that unlocks the server-side gate in the root
 * layout.
 */
export async function POST(req: Request) {
  let password = ""
  try {
    const body = await req.json()
    password = typeof body?.password === "string" ? body.password : ""
  } catch {
    // empty / malformed body — treated as an incorrect password below
  }

  const protection = await dbGetSiteProtection().catch(() => null)
  if (!protection) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 })
  }

  // Protection disabled — nothing to unlock.
  if (!protection.enabled) {
    return NextResponse.json({ ok: true })
  }

  if (!password || password !== protection.password) {
    return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 })
  }

  const token = await signSiteAccess(protection.password)
  const store = await cookies()
  store.set(siteAccessCookieOptions(token))
  return NextResponse.json({ ok: true })
}
