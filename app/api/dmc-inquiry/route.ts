import { NextResponse } from "next/server"
import { rateLimit, RATE_LIMITS, schedulePrune } from "@/lib/rate-limit"
import { validateDmcInquiry, dmcInquirySummary, type DmcInquiry } from "@/lib/dmc-inquiry"
import { sendEmail, isEmailConfigured, escapeHtml } from "@/lib/email"
import { DEFAULT_JOB_EMAIL } from "@/lib/job-email"
import { logError, requestMeta } from "@/lib/error-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Where DMC requests are sent. Override with DMC_INQUIRY_TO in .env. */
function recipient(): string {
  return process.env.DMC_INQUIRY_TO?.trim() || DEFAULT_JOB_EMAIL
}

function htmlSummary(d: DmcInquiry): string {
  const rows: [string, string][] = [
    ["Purpose", d.purpose], ["Name", d.name], ["E-mail", d.email], ["Phone", d.phone],
    ["Destination", d.destination], ["Company", d.company], ["Website", d.website],
  ]
  const tr = rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7980;vertical-align:top">${k}</td><td style="padding:4px 0">${v ? escapeHtml(v) : "—"}</td></tr>`)
    .join("")
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#1d262b">
<p style="margin:0 0 12px"><strong>New DMC request</strong> from sightseeing.lu/dmc</p>
<table style="border-collapse:collapse">${tr}</table>
<p style="margin:16px 0 4px;color:#6b7980">Message</p>
<p style="margin:0;white-space:pre-wrap">${escapeHtml(d.message)}</p>
</div>`
}

/**
 * POST /api/dmc-inquiry — the /dmc "Planning a trip?" form. Validates, then
 * emails a summary to hello@sightseeing.lu (reply-to = the visitor). Nothing is
 * stored. Public: rate-limited per IP and guarded by a hidden honeypot field.
 */
export async function POST(req: Request) {
  schedulePrune()
  const rl = rateLimit(req, { key: "dmc-inquiry", ...RATE_LIMITS.formSubmit })
  if (!rl.allowed) return rl.response

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  // Honeypot: real visitors never see or fill "fax". Pretend success so bots
  // don't learn they were filtered.
  if (typeof body.fax === "string" && body.fax.trim()) {
    return NextResponse.json({ ok: true })
  }

  const result = validateDmcInquiry(body)
  if (!result.ok) {
    return NextResponse.json({ error: "Please check the highlighted fields.", fields: result.errors }, { status: 400 })
  }
  const d = result.data

  if (!isEmailConfigured()) {
    void logError({
      source: "dmc-inquiry",
      level: "error",
      message: "DMC request not sent: SMTP is not configured (SMTP_HOST / SMTP_FROM)",
      context: { purpose: d.purpose, ...requestMeta(req) },
    })
    return NextResponse.json(
      { error: `Sorry, the form can't send right now. Please email us at ${recipient()}.` },
      { status: 503 },
    )
  }

  try {
    await sendEmail({
      to: recipient(),
      subject: `DMC request: ${d.purpose} — ${d.name}${d.company ? ` (${d.company})` : ""}`,
      text: dmcInquirySummary(d),
      html: htmlSummary(d),
      replyTo: d.email,
    })
  } catch (err) {
    void logError({
      source: "dmc-inquiry",
      level: "error",
      message: `DMC request email failed: ${err instanceof Error ? err.message : String(err)}`,
      context: { purpose: d.purpose, ...requestMeta(req) },
    })
    return NextResponse.json(
      { error: `Sorry, your request couldn't be sent. Please try again or email us at ${recipient()}.` },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
