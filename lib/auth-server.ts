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
 */
import { getSession, type AdminSessionPayload } from "@/lib/auth"
import { queryOne } from "@/lib/db"
import { sanitizePermissions } from "@/lib/admin-permissions"

class UnauthorizedError extends Error {
  status = 401
  constructor() {
    super("Unauthorized")
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
