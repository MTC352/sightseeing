/**
 * Support-ticket notifications: the admin-configured recipient addresses
 * (integrations row "ticket_notifications", meta.emails) and fire-and-forget
 * sending via lib/email.ts. Server-only.
 *
 * Sending never throws and never blocks the admin request; failures (or SMTP
 * not configured) are recorded in Admin → Error Logs, source "tickets".
 */
import { query, queryOne } from "@/lib/db"
import { sendEmail, isEmailConfigured } from "@/lib/email"
import { logError } from "@/lib/error-log"
import { DEFAULT_JOB_EMAIL } from "@/lib/job-email"
import { buildTicketEmails, parseEmailList, type Actor, type TicketEvent, type TicketInfo } from "@/lib/ticket-email"

const SETTINGS_KEY = "ticket_notifications"
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

/** Default when the setting has never been saved. */
export const DEFAULT_TICKET_NOTIFY_EMAILS = [DEFAULT_JOB_EMAIL]

export async function getTicketNotificationEmails(): Promise<string[]> {
  try {
    const row = await queryOne<{ meta: { emails?: unknown } | null }>(
      `SELECT meta FROM integrations WHERE key = $1`,
      [SETTINGS_KEY],
    )
    if (!row) return DEFAULT_TICKET_NOTIFY_EMAILS
    return parseEmailList(row.meta?.emails).emails
  } catch {
    return DEFAULT_TICKET_NOTIFY_EMAILS
  }
}

export async function saveTicketNotificationEmails(emails: string[]): Promise<void> {
  await query(
    `INSERT INTO integrations (key, label, value, meta, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, meta = EXCLUDED.meta, updated_at = NOW()`,
    [SETTINGS_KEY, "Support ticket notification emails", emails.join(", "), JSON.stringify({ emails })],
  )
}

/**
 * Email everyone who should hear about `event` (see lib/ticket-email.ts).
 * Call with `void` — it resolves after sending but callers shouldn't wait.
 */
export async function notifyTicketEvent(event: TicketEvent, ticket: TicketInfo, actor: Actor): Promise<void> {
  try {
    const team = await getTicketNotificationEmails()
    const mails = buildTicketEmails(event, ticket, actor, team, SITE_URL)
    if (mails.length === 0) return
    if (!isEmailConfigured()) {
      void logError({
        source: "tickets",
        level: "warn",
        message: `Ticket ${event.kind} notification not sent: SMTP is not configured (SMTP_HOST / SMTP_FROM).`,
        context: { ticketId: ticket.id, event: event.kind, recipients: mails.reduce((n, m) => n + m.to.length, 0) },
      })
      return
    }
    // Author and staff get separately worded emails (clients get no admin link).
    for (const mail of mails) {
      await sendEmail({ to: mail.to.join(", "), subject: mail.subject, text: mail.text, html: mail.html, replyTo: mail.replyTo })
    }
  } catch (err) {
    void logError({
      source: "tickets",
      level: "error",
      message: `Ticket ${event.kind} notification failed: ${err instanceof Error ? err.message : String(err)}`,
      context: { ticketId: ticket.id, event: event.kind },
    })
  }
}
