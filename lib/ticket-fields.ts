/** Allowed support-ticket field values (shared by the admin API + UI). */
export const TICKET_STATUSES = ["open", "in-progress", "waiting", "resolved", "closed"] as const
export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const
export const TICKET_CATEGORIES = ["bug", "feature", "question", "billing", "other"] as const
export const TICKET_MESSAGE_MAX = 10_000

export const isTicketStatus = (v: unknown): v is (typeof TICKET_STATUSES)[number] =>
  typeof v === "string" && (TICKET_STATUSES as readonly string[]).includes(v)
export const isTicketPriority = (v: unknown): v is (typeof TICKET_PRIORITIES)[number] =>
  typeof v === "string" && (TICKET_PRIORITIES as readonly string[]).includes(v)
export const isTicketCategory = (v: unknown): v is (typeof TICKET_CATEGORIES)[number] =>
  typeof v === "string" && (TICKET_CATEGORIES as readonly string[]).includes(v)

/**
 * Resolve the ticket author from an admin request: an explicitly entered
 * name/email (e.g. the client the ticket is for) or, by default, the logged-in
 * admin. An author email that isn't the admin's own is an external "user".
 */
export function resolveTicketAuthor(
  input: { authorName?: unknown; authorEmail?: unknown },
  session: { name?: string; email: string; role?: string },
  isValidEmail: (v: string) => boolean,
): { ok: true; name: string; email: string; role: string } | { ok: false; error: string } {
  const rawEmail = typeof input.authorEmail === "string" ? input.authorEmail.trim() : ""
  if (rawEmail && !isValidEmail(rawEmail)) return { ok: false, error: `"${rawEmail}" is not a valid author email` }
  const email = rawEmail || session.email
  const rawName = typeof input.authorName === "string" ? input.authorName.trim().slice(0, 120) : ""
  const own = email.toLowerCase() === session.email.toLowerCase()
  const name = rawName || (own ? session.name || session.email : email)
  return { ok: true, name, email, role: own ? ticketRole(session.role) : "user" }
}

/** Display role for ticket authors: superadmins stay "superadmin", everyone else "admin". */
export const ticketRole = (role: string | undefined) => (role === "superadmin" ? "superadmin" : "admin")
