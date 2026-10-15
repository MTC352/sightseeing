/**
 * lib/email.ts
 * Outbound email over SMTP (nodemailer). Shared by the DMC enquiry form and,
 * later, support-ticket notifications.
 *
 * Configured with environment variables (server .env, read at container start):
 *   SMTP_HOST      e.g. smtp.example.com            (required)
 *   SMTP_PORT      587 (STARTTLS) or 465 (TLS)      (default 587)
 *   SMTP_SECURE    "true" for port 465 TLS          (default: true when port is 465)
 *   SMTP_USER      SMTP username                    (optional if the server allows)
 *   SMTP_PASS      SMTP password
 *   SMTP_FROM      e.g. "Sightseeing.lu <no-reply@sightseeing.lu>"  (default: SMTP_USER)
 *
 * Server-only. Never import from client components.
 */
import nodemailer, { type Transporter } from "nodemailer"

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
  html?: string
  /** Where replies go — e.g. the visitor who filled in a form. */
  replyTo?: string
}

let _transport: Transporter | null = null

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim()
  if (!host) return null
  const port = Number(process.env.SMTP_PORT ?? 587) || 587
  const secureEnv = process.env.SMTP_SECURE?.trim().toLowerCase()
  const secure = secureEnv ? secureEnv === "true" || secureEnv === "1" : port === 465
  const user = process.env.SMTP_USER?.trim() || undefined
  const pass = process.env.SMTP_PASS ?? undefined
  const from = process.env.SMTP_FROM?.trim() || user
  if (!from) return null
  return { host, port, secure, user, pass, from }
}

/** True when SMTP_HOST and a sender (SMTP_FROM or SMTP_USER) are set. */
export function isEmailConfigured(): boolean {
  return smtpConfig() !== null
}

function transport(cfg: NonNullable<ReturnType<typeof smtpConfig>>): Transporter {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      // Fail fast instead of hanging a request on an unreachable server.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  }
  return _transport
}

/** Header values must never carry CR/LF (header injection). */
function oneLine(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim()
}

/**
 * Send an email. Throws when SMTP isn't configured or the server rejects the
 * message — callers decide how to report that to the user.
 */
export async function sendEmail(mail: OutgoingEmail): Promise<void> {
  const cfg = smtpConfig()
  if (!cfg) throw new Error("SMTP is not configured (set SMTP_HOST and SMTP_FROM in .env)")
  await transport(cfg).sendMail({
    from: cfg.from,
    to: oneLine(mail.to),
    subject: oneLine(mail.subject),
    text: mail.text,
    html: mail.html,
    replyTo: mail.replyTo ? oneLine(mail.replyTo) : undefined,
  })
}

/** Escape text for safe interpolation into an HTML email body. */
export function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
