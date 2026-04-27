/**
 * lib/auth.ts
 * JWT session helpers using jose (Edge-compatible).
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose"
import { cookies } from "next/headers"

const COOKIE_NAME = "admin_session"
const MAX_AGE = 60 * 60 * 8 // 8 hours

function getSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET ?? "sightseeing-lu-dev-secret-change-in-production"
  return new TextEncoder().encode(secret)
}

export interface AdminSessionPayload extends JWTPayload {
  id: string
  email: string
  name: string
  role: string
}

export async function signSession(payload: Omit<AdminSessionPayload, keyof JWTPayload>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as AdminSessionPayload
  } catch {
    return null
  }
}

export async function getSession(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

export function sessionCookieOptions(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: MAX_AGE,
    path: "/",
  }
}

export function clearCookieOptions() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  }
}
