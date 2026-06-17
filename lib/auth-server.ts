/**
 * lib/auth-server.ts
 * Server-only auth helpers (Node.js runtime — do NOT import from proxy.ts or
 * any Edge-runtime code).
 *
 * requireAdminSession() performs two checks:
 *   1. JWT signature + expiry via lib/auth.ts getSession()
 *   2. DB lookup — ensures the user id from the token maps to a real,
 *      existing admin_users row (prevents use of tokens for deleted accounts
 *      and adds a second layer of defense against forged tokens).
 *
 * requirePermission(key) builds on requireAdminSession() and additionally
 * verifies — using the DB-fresh role/permissions — that the caller holds the
 * named section permission. This makes permission revocations take effect
 * immediately without waiting for JWT expiry.
 *
 * requireSuperAdmin() builds on requireAdminSession() and verifies that the
 * DB-fresh role is "superadmin". Use this for routes that the proxy gates to
 * superadmin-only so that a demoted user's stale JWT cannot sneak through.
 */
import { getSession, type AdminSessionPayload } from "@/lib/auth"
import { queryOne } from "@/lib/db"
import { sanitizePermissions, FULL_ACCESS_ROLE, type PermissionKey } from "@/lib/admin-permissions"

class UnauthorizedError extends Error {
  status = 401
  constructor() {
    super("Unauthorized")
  }
}

class ForbiddenError extends Error {
  status = 403
  constructor() {
    super("Forbidden")
  }
}

/**
 * Validates the admin session and returns it with **DB-fresh** role + permissions.
 *
 * The JWT carries role/permissions for the edge proxy gate, but those claims go
 * stale for up to the token TTL (8h). Server route handlers must not trust stale
 * claims for authorization decisions, so we re-read role/permissions/is_active
 * from the database here. This makes role demotions, permission edits, and
 * account deactivation take effect immediately on every protected API route.
 */
export async function requireAdminSession(): Promise<AdminSessionPayload> {
  const session = await getSession()
  if (!session) throw new UnauthorizedError()

  const user = await queryOne<{ role: string; permissions: string[] }>(
    "SELECT role, permissions FROM admin_users WHERE id = $1 AND is_active = true",
    [session.id],
  )
  if (!user) throw new UnauthorizedError()

  return {
    ...session,
    role: user.role,
    permissions: sanitizePermissions(user.permissions),
  }
}

/**
 * Like requireAdminSession() but also enforces that the caller holds the given
 * section permission (or is a superadmin). Use this in API route handlers that
 * correspond to a gated section so that permission revocations take effect
 * immediately instead of at JWT expiry.
 */
export async function requirePermission(permission: PermissionKey): Promise<AdminSessionPayload> {
  const session = await requireAdminSession()
  if (
    session.role !== FULL_ACCESS_ROLE &&
    !(session.permissions as PermissionKey[]).includes(permission)
  ) {
    throw new ForbiddenError()
  }
  return session
}

/**
 * Like requireAdminSession() but also enforces that the DB-fresh role is
 * "superadmin". Use this for routes that the proxy gates superadmin-only so
 * that a demoted user with a stale JWT cannot retain access until expiry.
 */
export async function requireSuperAdmin(): Promise<AdminSessionPayload> {
  const session = await requireAdminSession()
  if (session.role !== FULL_ACCESS_ROLE) {
    throw new ForbiddenError()
  }
  return session
}

/**
 * Like requireAdminSession() but enforces that the caller holds AT LEAST ONE
 * of the given section permissions (or is a superadmin). Use this for routes
 * that sit at the intersection of multiple sections (e.g. a shared upload
 * endpoint accessible to trips, blog, and pages editors).
 */
export async function requireAnyPermission(permissions: PermissionKey[]): Promise<AdminSessionPayload> {
  const session = await requireAdminSession()
  if (session.role === FULL_ACCESS_ROLE) return session
  const held = session.permissions as PermissionKey[]
  if (!permissions.some((p) => held.includes(p))) {
    throw new ForbiddenError()
  }
  return session
}
