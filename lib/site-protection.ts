/**
 * lib/site-protection.ts
 * Helpers for the admin-configurable public-frontend password gate.
 *
 * Unlike the old client-side localStorage PIN, access is granted via a signed,
 * HttpOnly cookie (`site_access`) so the gate is enforced server-side in the
 * root layout — the page HTML is never sent until the visitor is authenticated.
 *
 * The token embeds a short fingerprint of the CURRENT site password, so when an
 * admin changes the password every existing session is invalidated instantly
 * (old tokens carry the old fingerprint).
 */
import { SignJWT, jwtVerify } from "jose"

export const SITE_ACCESS_COOKIE = "site_access"
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET
  if (!secret) {
    throw new Error(
      "ADMIN_JWT_SECRET environment variable is not set. " +
        "Set a long, random secret before starting the application.",
    )
  }
  return new TextEncoder().encode(secret)
}

/** Short, stable fingerprint of the current site password (Web Crypto — works
 *  in both the Node and Edge runtimes). */
export async function passwordFingerprint(password: string): Promise<string> {
  const data = new TextEncoder().encode(`site:${password}`)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const bytes = new Uint8Array(digest)
  let hex = ""
  for (let i = 0; i < 8; i++) hex += bytes[i].toString(16).padStart(2, "0")
  return hex
}

export async function signSiteAccess(password: string): Promise<string> {
  const fp = await passwordFingerprint(password)
  return new SignJWT({ scope: "site", fp })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret())
}

/**
 * True when `token` is a valid, unexpired site-access token.
 *
 * When `password` is a string, the token's embedded fingerprint must match the
 * current password (so password changes revoke old sessions). Pass `null` to
 * skip the fingerprint check — used as graceful degradation when the DB password
 * cannot be read (so already-authenticated visitors aren't locked out during a
 * brief DB outage), while unauthenticated visitors are still gated.
 */
export async function verifySiteAccess(
  token: string | undefined,
  password: string | null,
): Promise<boolean> {
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (payload.scope !== "site") return false
    if (password === null) return true
    return payload.fp === (await passwordFingerprint(password))
  } catch {
    return false
  }
}

// ── Trusted pathname signalling (proxy → root layout) ──────────────────────
// The root layout must know the request path to bypass the gate on /admin
// routes, but server components can't read the path directly. The proxy sets
// `x-pathname`; however the bare root path `/` is excluded from the proxy
// matcher (cold-start perf), so a client could forge `x-pathname: /admin` on `/`
// to skip the gate. To prevent that, the proxy also sends a signature of the
// path derived from ADMIN_JWT_SECRET, and the layout only trusts `x-pathname`
// when the signature verifies. A bare `/` request carries no valid signature
// (proxy never ran) and is therefore treated as the gated public homepage.
export const PATHNAME_HEADER = "x-pathname"
export const PATHNAME_SIG_HEADER = "x-pathname-sig"

async function pathnameToken(pathname: string): Promise<string> {
  const secret = process.env.ADMIN_JWT_SECRET ?? ""
  const data = new TextEncoder().encode(`proxy-path:${secret}:${pathname}`)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const bytes = new Uint8Array(digest)
  let hex = ""
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0")
  return hex
}

export async function signPathname(pathname: string): Promise<string> {
  return pathnameToken(pathname)
}

export async function verifyPathname(
  pathname: string,
  sig: string | null | undefined,
): Promise<boolean> {
  if (!sig) return false
  return sig === (await pathnameToken(pathname))
}

export function siteAccessCookieOptions(token: string) {
  return {
    name: SITE_ACCESS_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: MAX_AGE,
    path: "/",
  }
}
