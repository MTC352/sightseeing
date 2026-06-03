import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import {
  dbListAdminUsers,
  dbGetGlobalFileRules,
  dbSetGlobalFileRules,
  dbSetUserFileRules,
} from "@/lib/db/queries"
import {
  sanitizeRules,
  resolveEffectiveRules,
  ALL_SAFE_EXTENSIONS,
  DEFAULT_RULES,
  HARD_MAX_MB,
} from "@/lib/file-rules"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (session.role !== FULL_ACCESS_ROLE) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const [global, users] = await Promise.all([
      dbGetGlobalFileRules(),
      dbListAdminUsers(),
    ])

    return NextResponse.json({
      global: sanitizeRules(global) ?? { ...DEFAULT_RULES },
      defaults: DEFAULT_RULES,
      hardMaxMb: HARD_MAX_MB,
      safeExtensions: ALL_SAFE_EXTENSIONS,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        role: u.role,
        fileRules: sanitizeRules(u.file_rules), // null = inherits global
        effective: resolveEffectiveRules(global, u.file_rules),
      })),
    })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/file-rules] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession()
    if (session.role !== FULL_ACCESS_ROLE) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const scope = body?.scope

    if (scope === "global") {
      const rules = sanitizeRules(body.rules)
      if (!rules) {
        return NextResponse.json(
          { error: "Invalid rules — pick at least one allowed format and a valid size." },
          { status: 400 },
        )
      }
      await dbSetGlobalFileRules(rules)
      void logActivity({
        actor: session,
        action: "file_rule.update",
        entityType: "file_rule",
        entityId: "global",
        summary: "Updated global file upload rules",
      })
      return NextResponse.json({ ok: true, global: rules })
    }

    if (scope === "user") {
      const userId = typeof body.userId === "string" ? body.userId : ""
      if (!userId) {
        return NextResponse.json({ error: "userId is required" }, { status: 400 })
      }
      // null rules → clear the override (inherit global). Otherwise sanitize.
      const rules = body.rules == null ? null : sanitizeRules(body.rules)
      if (body.rules != null && !rules) {
        return NextResponse.json(
          { error: "Invalid rules — pick at least one allowed format and a valid size." },
          { status: 400 },
        )
      }
      const updated = await dbSetUserFileRules(userId, rules)
      if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 })
      void logActivity({
        actor: session,
        action: "file_rule.update",
        entityType: "file_rule",
        entityId: userId,
        summary: rules == null
          ? `Cleared file upload rules override for user ${userId}`
          : `Updated file upload rules for user ${userId}`,
        context: { targetUserId: userId },
      })
      return NextResponse.json({ ok: true, userId, rules })
    }

    return NextResponse.json({ error: "Invalid scope" }, { status: 400 })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/file-rules] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
