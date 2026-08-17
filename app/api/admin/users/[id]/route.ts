import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import { FULL_ACCESS_ROLE, FULL_ACCESS_PERMISSION, isFullAdmin, hasFullAccess } from "@/lib/admin-permissions"
import { dbGetAdminUser, dbUpdateAdminUser, dbDeleteAdminUser } from "@/lib/db/queries"
import { logActivity } from "@/lib/activity-log"

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
    if (!isFullAdmin(session.role, session.permissions)) {
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
    if (!isFullAdmin(session.role, session.permissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const { id } = await params

    // Only a REAL superadmin may modify a privileged account (a superadmin or a
    // full-access "*" employee). This blocks privileged-account takeover by a
    // full-access employee (password/is_active hijack of a peer) and the
    // self-demotion footgun where their own save would strip "*". Superadmins
    // are already uneditable at the DB layer; this makes the rule explicit and
    // extends it to full-access peers.
    if (session.role !== FULL_ACCESS_ROLE) {
      const target = await dbGetAdminUser(id)
      if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })
      if (target.role === FULL_ACCESS_ROLE || hasFullAccess(target.permissions)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const body = await req.json()

    if (typeof body.password === "string" && body.password.length > 0 && body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    // Only a superadmin may grant the full-access wildcard — a full-access
    // employee editing users cannot escalate others to full access.
    const permissions = body.permissions === undefined
      ? undefined
      : hasFullAccess(body.permissions) && session.role !== FULL_ACCESS_ROLE
        ? (body.permissions as unknown[]).filter((p) => p !== FULL_ACCESS_PERMISSION)
        : body.permissions

    const updated = await dbUpdateAdminUser(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      username: typeof body.username === "string" ? body.username : undefined,
      email: body.email === undefined ? undefined : body.email,
      permissions,
      is_active: typeof body.is_active === "boolean" ? body.is_active : undefined,
      password: typeof body.password === "string" ? body.password : undefined,
    })
    if (!updated) {
      return NextResponse.json({ error: "Account not found or not editable" }, { status: 404 })
    }

    void logActivity({
      actor: session,
      action: "user.update",
      entityType: "user",
      entityId: id,
      summary: `Updated user "${updated.name ?? updated.username ?? id}"`,
      context: { targetUserId: id },
    })

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
    if (!isFullAdmin(session.role, session.permissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const { id } = await params

    // Only a REAL superadmin may delete a privileged account (a superadmin or a
    // full-access "*" employee). Superadmins are already undeletable at the DB
    // layer; this extends the same protection to full-access peers.
    if (session.role !== FULL_ACCESS_ROLE) {
      const target = await dbGetAdminUser(id)
      if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })
      if (target.role === FULL_ACCESS_ROLE || hasFullAccess(target.permissions)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const ok = await dbDeleteAdminUser(id)
    if (!ok) {
      return NextResponse.json({ error: "Account not found or not deletable" }, { status: 404 })
    }

    void logActivity({
      actor: session,
      action: "user.delete",
      entityType: "user",
      entityId: id,
      summary: `Deleted user ${id}`,
      context: { targetUserId: id },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/users/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
