import { NextResponse } from "next/server"
import { compare } from "bcryptjs"
import { queryOne } from "@/lib/db"
import { signSession, sessionCookieOptions } from "@/lib/auth"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"

export async function POST(req: Request) {
  const limit = rateLimit(req, { limit: 10, windowMs: 15 * 60 * 1000 })
  schedulePrune()
  if (!limit.allowed) return limit.response

  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    const user = await queryOne<{
      id: string; email: string; name: string; role: string; password_hash: string; is_active: boolean
    }>(`SELECT id, email, name, role, password_hash, is_active FROM admin_users WHERE email = $1`, [email])

    // Fixed-time response to prevent timing attacks
    const hash = user?.password_hash ?? "$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    const valid = await compare(password, hash)

    if (!user || !valid || !user.is_active) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    // Update last_login
    await queryOne(`UPDATE admin_users SET last_login = NOW() WHERE id = $1`, [user.id])

    const token = await signSession({ id: user.id, email: user.email, name: user.name, role: user.role })
    const opts = sessionCookieOptions(token)

    const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
    res.cookies.set(opts)
    return res
  } catch (err) {
    console.error("[auth/login] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
