import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"
import { dbListAdminUsers, dbCreateEmployee } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

/** A Postgres unique-violation surfaces as code 23505. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505"
}

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (session.role !== FULL_ACCESS_ROLE) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const users = await dbListAdminUsers()
    return NextResponse.json(users)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/users] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAdminSession()
    if (session.role !== FULL_ACCESS_ROLE) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const username = typeof body.username === "string" ? body.username.trim() : ""
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!username) return NextResponse.json({ error: "Username is required" }, { status: 400 })
    if (!name) return NextResponse.json({ error: "Display name is required" }, { status: 400 })
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    const user = await dbCreateEmployee({
      username,
      name,
      password,
      permissions: body.permissions,
      email: typeof body.email === "string" ? body.email : null,
    })
    return NextResponse.json(user, { status: 201 })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That username or email is already taken" }, { status: 409 })
    }
    console.error("[admin/users] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
