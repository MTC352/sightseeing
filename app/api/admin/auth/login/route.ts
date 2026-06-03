import { NextResponse } from "next/server"
import { compare } from "bcryptjs"
import { queryOne } from "@/lib/db"
import { signSession, sessionCookieOptions } from "@/lib/auth"
import { sanitizePermissions } from "@/lib/admin-permissions"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"
import { logActivity } from "@/lib/activity-log"

export async function POST(req: Request) {
  const limit = rateLimit(req, { limit: 10, windowMs: 15 * 60 * 1000 })
  schedulePrune()
  if (!limit.allowed) return limit.response

  try {
    const body = await req.json()
    // Accept email, username, or a generic identifier (employees use a username).
    const identifier: string = (body.identifier ?? body.email ?? body.username ?? "").trim()
    const password: string = body.password ?? ""
    if (!identifier || !password) {
      return NextResponse.json({ error: "Username/email and password are required" }, { status: 400 })
    }

    const user = await queryOne<{
      id: string; email: string | null; name: string; role: string
      password_hash: string; is_active: boolean; permissions: string[]
    }>(
      `SELECT id, email, name, role, password_hash, is_active, permissions
         FROM admin_users
        WHERE lower(email) = lower($1) OR lower(username) = lower($1)
        LIMIT 1`,
      [identifier],
    )

    // Fixed-time response to prevent timing attacks
    const hash = user?.password_hash ?? "$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    const valid = await compare(password, hash)

    if (!user || !valid || !user.is_active) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    // Update last_login
    await queryOne(`UPDATE admin_users SET last_login = NOW() WHERE id = $1`, [user.id])

    const permissions = sanitizePermissions(user.permissions)
    const token = await signSession({
      id: user.id,
      email: user.email ?? "",
      name: user.name,
      role: user.role,
      permissions,
    })
    const opts = sessionCookieOptions(token)

    void logActivity({
      actor: { id: user.id, name: user.name, email: user.email, role: user.role },
      action: "auth.login",
      entityType: "session",
      entityId: user.id,
      summary: `${user.name} signed in`,
    })

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions },
    })
    res.cookies.set(opts)
    return res
  } catch (err) {
    console.error("[auth/login] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
