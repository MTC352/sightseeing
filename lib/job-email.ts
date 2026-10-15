/**
 * Where job applications are sent. Each posting can set its own address in the
 * admin (`jobs.application_email`); empty/invalid falls back to the default.
 * Shared by the admin form, the jobs API (validation) and /careers (mailto).
 */
export const DEFAULT_JOB_EMAIL = "hello@sightseeing.lu"

const EMAIL_RE = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value)
}

/** Address to use for a posting: its own (when valid) or the default. */
export function jobApplicationEmail(email: unknown): string {
  const v = typeof email === "string" ? email.trim() : ""
  return v && isValidEmail(v) ? v : DEFAULT_JOB_EMAIL
}

/**
 * Validate an admin-submitted value. Empty → null (use the default);
 * otherwise the trimmed address, or an error message when invalid.
 */
export function parseJobEmailInput(raw: unknown): { value: string | null } | { error: string } {
  if (raw == null) return { value: null }
  if (typeof raw !== "string") return { error: "Application email must be text" }
  const v = raw.trim()
  if (!v) return { value: null }
  if (!isValidEmail(v)) return { error: `"${v}" is not a valid email address` }
  return { value: v }
}
