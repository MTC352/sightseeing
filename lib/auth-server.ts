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

class UnauthorizedError extends Error {
  status = 401
  constructor() {
    super("Unauthorized")
  }
}

export async function requireAdminSession(): Promise<AdminSessionPayload> {
  const session = await getSession()
  if (!session) throw new UnauthorizedError()

  const user = await queryOne<{ id: string }>(
    "SELECT id FROM admin_users WHERE id = $1 AND is_active = true",
    [session.id],
  )
  if (!user) throw new UnauthorizedError()

  return session
}
