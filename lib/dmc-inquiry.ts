/**
 * DMC enquiry form — shared field options + validation, used by the /dmc form
 * (client) and POST /api/dmc-inquiry (server) so both enforce the same rules.
 * Dependency-free so it can be unit-tested.
 */

export const DMC_PURPOSES = [
  { value: "Private tour", label: "Private tour" },
  { value: "Group tour", label: "Group tour" },
  { value: "Tailor-made programme", label: "Tailor-made" },
  { value: "Multi-day trip", label: "Multi-day trip" },
  { value: "Incentive / MICE", label: "Incentive / MICE" },
  { value: "FIT partnership", label: "FIT partnership" },
  { value: "Airport transfer", label: "Airport transfer" },
  { value: "Other", label: "Other" },
] as const

export const DMC_DESTINATIONS = [
  "Luxembourg City",
  "North: nature & castles",
  "WWII history",
  "Mullerthal & Moselle",
  "South: Minett",
  "Several regions / whole country",
  "Not sure yet",
] as const

export const DMC_MESSAGE_MAX = 2000

export interface DmcInquiry {
  purpose: string
  name: string
  email: string
  phone: string
  destination: string
  company: string
  website: string
  message: string
}

export type DmcField = keyof DmcInquiry

const EMAIL_RE = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/
const URL_RE = /^https?:\/\/[^\s.]+\.[^\s]+$/i
const PHONE_RE = /^[0-9+()\-./\s]{4,40}$/

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

/**
 * Normalise + validate raw input. Returns the cleaned enquiry, or per-field
 * error keys (the form maps them to its messages).
 */
export function validateDmcInquiry(
  raw: Record<string, unknown>,
): { ok: true; data: DmcInquiry } | { ok: false; errors: DmcField[] } {
  const data: DmcInquiry = {
    purpose: str(raw.purpose, 60),
    name: str(raw.name, 120),
    email: str(raw.email, 254),
    phone: str(raw.phone, 40),
    destination: str(raw.destination, 80),
    company: str(raw.company, 150),
    website: str(raw.website, 300),
    message: str(raw.message, DMC_MESSAGE_MAX),
  }
  const errors: DmcField[] = []
  if (!DMC_PURPOSES.some((p) => p.value === data.purpose)) errors.push("purpose")
  if (!data.name) errors.push("name")
  if (!EMAIL_RE.test(data.email)) errors.push("email")
  if (data.phone && !PHONE_RE.test(data.phone)) errors.push("phone")
  if (data.destination && !(DMC_DESTINATIONS as readonly string[]).includes(data.destination)) errors.push("destination")
  if (data.website && !URL_RE.test(data.website)) errors.push("website")
  if (!data.message) errors.push("message")
  return errors.length ? { ok: false, errors } : { ok: true, data }
}

/** Plain-text summary used for the notification email. */
export function dmcInquirySummary(d: DmcInquiry): string {
  const row = (label: string, v: string) => `${label.padEnd(12)} ${v || "—"}`
  return [
    "New DMC request from sightseeing.lu/dmc",
    "",
    row("Purpose:", d.purpose),
    row("Name:", d.name),
    row("E-mail:", d.email),
    row("Phone:", d.phone),
    row("Destination:", d.destination),
    row("Company:", d.company),
    row("Website:", d.website),
    "",
    "Message:",
    d.message,
  ].join("\n")
}
