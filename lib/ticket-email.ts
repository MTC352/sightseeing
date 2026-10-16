/**
 * Support-ticket notification emails — pure helpers (recipients, content,
 * address-list parsing). No I/O, so they're unit-tested; sending lives in
 * lib/ticket-notifications.ts.
 *
 * Who gets what (never the person who made the change):
 *   created → the ticket notification addresses ("new ticket") + the author
 *             ("we received your request") when someone opened it for them
 *   status  → the ticket author
 *   reply   → the ticket author + the notification addresses
 * Staff get a link to the ticket in the admin; external authors (clients,
 * authorRole "user") can't open the admin, so their emails say "reply to this
 * email" instead.
 */
import { isValidEmail } from "./job-email"

export type TicketEvent =
  | { kind: "created" }
  | { kind: "status"; from: string; to: string }
  | { kind: "reply"; message: string }

export interface TicketInfo {
  id: string
  subject: string
  description?: string | null
  category?: string | null
  priority?: string | null
  status?: string | null
  authorName: string
  authorEmail: string
  /** "user" = external (e.g. a client) — no admin link in their emails. */
  authorRole?: string | null
}

export interface Actor {
  name: string
  email: string
}

export interface TicketEmail {
  to: string[]
  subject: string
  text: string
  html: string
  replyTo?: string
}

export const MAX_NOTIFY_EMAILS = 10

/** Parse "a@x.com, b@y.com" / one-per-line into unique valid addresses. */
export function parseEmailList(raw: unknown): { emails: string[]; invalid: string[] } {
  const parts = (Array.isArray(raw) ? raw.join(",") : typeof raw === "string" ? raw : "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const emails: string[] = []
  const invalid: string[] = []
  for (const p of parts) {
    if (!isValidEmail(p)) invalid.push(p)
    else if (!emails.some((e) => e.toLowerCase() === p.toLowerCase())) emails.push(p)
  }
  return { emails: emails.slice(0, MAX_NOTIFY_EMAILS), invalid }
}

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Split recipients into the author and the staff team, excluding the actor. */
function recipientGroups(
  event: TicketEvent,
  ticket: Pick<TicketInfo, "authorEmail">,
  teamEmails: string[],
  actor: Actor,
): { author: string | null; team: string[] } {
  const authorEmail = (ticket.authorEmail ?? "").trim()
  const author =
    authorEmail && isValidEmail(authorEmail) && !sameEmail(authorEmail, actor.email) ? authorEmail : null
  const team: string[] = []
  if (event.kind !== "status") {
    for (const c of teamEmails) {
      const e = (c ?? "").trim()
      if (!e || !isValidEmail(e) || sameEmail(e, actor.email) || sameEmail(e, authorEmail)) continue
      if (!team.some((t) => sameEmail(t, e))) team.push(e)
    }
  }
  return { author, team }
}

/** Everyone emailed about an event (author first), excluding the actor. */
export function ticketRecipients(
  event: TicketEvent,
  ticket: Pick<TicketInfo, "authorEmail">,
  teamEmails: string[],
  actor: Actor,
): string[] {
  const { author, team } = recipientGroups(event, ticket, teamEmails, actor)
  return [...(author ? [author] : []), ...team]
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

const label = (s?: string | null) => (s ?? "").replace(/-/g, " ")

function render(opts: {
  to: string[]
  subject: string
  headline: string
  ticket: TicketInfo
  body: string
  url: string | null
  replyTo: string
}): TicketEmail {
  const { ticket, body, url, headline } = opts
  const footer = url ? `Open the ticket: ${url}` : "You can reply to this email if you have anything to add."
  const text = [
    headline,
    "",
    `Ticket: ${ticket.subject}`,
    `Opened by: ${ticket.authorName} <${ticket.authorEmail}>`,
    ...(body ? ["", body] : []),
    "",
    footer,
  ].join("\n")
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#1d262b">
<p style="margin:0 0 12px">${esc(headline)}</p>
<p style="margin:0 0 4px"><strong>${esc(ticket.subject)}</strong></p>
<p style="margin:0 0 12px;color:#6b7980">Opened by ${esc(ticket.authorName)} &lt;${esc(ticket.authorEmail)}&gt;</p>
${body ? `<div style="margin:0 0 16px;padding:12px 14px;background:#f6f8f7;border-radius:8px;white-space:pre-wrap">${esc(body)}</div>` : ""}
<p style="margin:0">${url ? `<a href="${esc(url)}" style="color:#3f9c83;font-weight:600">Open the ticket</a>` : esc(footer)}</p>
</div>`
  return { to: opts.to, subject: opts.subject, text, html, replyTo: opts.replyTo || undefined }
}

/**
 * Build the emails for an event: one for the author and one for the staff
 * team (each only when it has recipients). Empty array → nobody to notify.
 */
export function buildTicketEmails(
  event: TicketEvent,
  ticket: TicketInfo,
  actor: Actor,
  teamEmails: string[],
  siteUrl: string,
): TicketEmail[] {
  const { author, team } = recipientGroups(event, ticket, teamEmails, actor)
  const ref = ticket.id.slice(0, 8)
  const adminUrl = `${siteUrl.replace(/\/+$/, "")}/admin/tickets/${ticket.id}`
  const authorIsStaff = (ticket.authorRole ?? "user") !== "user"
  const authorUrl = authorIsStaff ? adminUrl : null
  const replyTo = actor.email
  const out: TicketEmail[] = []

  switch (event.kind) {
    case "created": {
      const body = [
        `Category: ${label(ticket.category) || "—"}   Priority: ${label(ticket.priority) || "—"}`,
        "",
        ticket.description ?? "",
      ].join("\n")
      if (author) {
        out.push(render({
          to: [author],
          subject: `[Ticket ${ref}] We received your request: ${ticket.subject}`,
          headline: `${actor.name} opened a support ticket for you. We'll keep you updated by email.`,
          ticket, body, url: authorUrl, replyTo,
        }))
      }
      if (team.length) {
        out.push(render({
          to: team,
          subject: `[Ticket ${ref}] New: ${ticket.subject}`,
          headline: `${actor.name} opened a new support ticket.`,
          ticket, body, url: adminUrl, replyTo,
        }))
      }
      break
    }
    case "status":
      if (author) {
        out.push(render({
          to: [author],
          subject: `[Ticket ${ref}] Status: ${label(event.to)} — ${ticket.subject}`,
          headline: `${actor.name} changed the status of your ticket from "${label(event.from)}" to "${label(event.to)}".`,
          ticket, body: "", url: authorUrl, replyTo,
        }))
      }
      break
    case "reply": {
      const subject = `[Ticket ${ref}] New reply — ${ticket.subject}`
      const headline = `${actor.name} replied to the ticket.`
      if (author) out.push(render({ to: [author], subject, headline, ticket, body: event.message, url: authorUrl, replyTo }))
      if (team.length) out.push(render({ to: team, subject, headline, ticket, body: event.message, url: adminUrl, replyTo }))
      break
    }
  }
  return out
}
