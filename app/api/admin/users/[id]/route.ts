import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"
import { dbGetAdminUser, dbUpdateAdminUser, dbDeleteAdminUser } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505"
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    if (session.role !== FULL_ACCESS_ROLE) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const { id } = await params
    const user = await dbGetAdminUser(id)
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(user)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/users/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    if (session.role !== FULL_ACCESS_ROLE) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const { id } = await params
    const body = await req.json()

    if (typeof body.password === "string" && body.password.length > 0 && body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    const updated = await dbUpdateAdminUser(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      username: typeof body.username === "string" ? body.username : undefined,
      email: body.email === undefined ? undefined : body.email,
      permissions: body.permissions === undefined ? undefined : body.permissions,
      is_active: typeof body.is_active === "boolean" ? body.is_active : undefined,
      password: typeof body.password === "string" ? body.password : undefined,
    })
    if (!updated) {
      return NextResponse.json({ error: "Account not found or not editable" }, { status: 404 })
    }
    return NextResponse.json(updated)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That username or email is already taken" }, { status: 409 })
    }
    console.error("[admin/users/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    if (session.role !== FULL_ACCESS_ROLE) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const { id } = await params
    const ok = await dbDeleteAdminUser(id)
    if (!ok) {
      return NextResponse.json({ error: "Account not found or not deletable" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/users/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
