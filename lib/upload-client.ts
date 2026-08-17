/**
 * Shared client-side upload helper.
 *
 * Every uploader used to call the endpoint and blindly `await res.json()`.
 * Real-world upload responses are not always the JSON our route returns:
 *
 *  1. A large file rejected/truncated by the proxy/platform (413) can come back
 *     as an HTML error page or empty body → `res.json()` throws a raw
 *     `SyntaxError` that surfaced to users as a confusing "JSON parse error".
 *  2. A file whose bytes (e.g. embedded EXIF metadata) trip the CDN/WAF is
 *     blocked by the security layer (Cloudflare "Managed Challenge") BEFORE it
 *     ever reaches our server — an HTML challenge page (usually 403/503) with
 *     no useful error, and nothing in server logs.
 *
 * This helper parses defensively and always throws an Error whose `message` is
 * safe to show directly to the user, telling them WHY the upload failed and
 * what to do (upload a compressed / re-exported version), so callers only need
 * a single try/catch.
 */

interface UploadResponseBody {
  url?: string
  error?: string
  [key: string]: unknown
}

// Generic, user-facing failure. Used when the upload is rejected in a way we
// can't attribute to size or file type (e.g. blocked upstream before it reaches
// the server). Re-saving/compressing the file usually resolves it — but we keep
// the wording plain and non-technical.
const UPLOAD_FAILED_MESSAGE =
  "This file couldn't be uploaded. Please try again with a compressed or re-saved version of the file."

// Basic message for a file-type / format problem.
const TYPE_MISMATCH_MESSAGE =
  "This file type isn't supported here. Please upload a different format (e.g. JPG or PNG), or re-save the file and try again."

// Basic message for an oversized file.
const TOO_LARGE_MESSAGE =
  "This file is too large to upload. Please upload a smaller or compressed version."

/** Detect a CDN/WAF challenge or firewall block (an HTML page, not our JSON). */
function isSecurityBlock(res: Response, text: string): boolean {
  // Cloudflare tags challenge/block responses with this header.
  if (res.headers.get("cf-mitigated")) return true
  const contentType = res.headers.get("content-type") ?? ""
  const looksLikeHtml = contentType.includes("text/html") || /^\s*<(?:!doctype|html)/i.test(text)
  // Fingerprints of Cloudflare challenge / block pages.
  const challengeMarkers =
    /(challenges\.cloudflare\.com|__cf_chl|cf[_-]chl|cf_chl_opt|Just a moment|Enable JavaScript and cookies|Attention Required)/i
  if (challengeMarkers.test(text)) return true
  // A generic firewall/proxy block returns an HTML page on these statuses.
  return looksLikeHtml && (res.status === 403 || res.status === 429 || res.status === 503)
}

/** Map a server-provided rejection into a basic, user-facing message. */
function basicMessageFor(serverError: string): string {
  if (/content type|not permitted|unsupported|extension|does not match/i.test(serverError)) {
    return TYPE_MISMATCH_MESSAGE
  }
  if (/too large|maximum size|file size/i.test(serverError)) {
    return TOO_LARGE_MESSAGE
  }
  return UPLOAD_FAILED_MESSAGE
}

/**
 * POST a single file to `endpoint` (multipart, field `file`). Resolves to the
 * parsed JSON body on success, or throws an Error whose `message` is safe to
 * show to the user (with guidance on how to fix it).
 */
export async function uploadFile(file: File, endpoint: string): Promise<UploadResponseBody> {
  const fd = new FormData()
  fd.append("file", file)

  let res: Response
  try {
    res = await fetch(endpoint, { method: "POST", body: fd })
  } catch {
    throw new Error("Upload failed — network error. Please check your connection and try again.")
  }

  // Read the body ONCE as text, then attempt JSON — responses may be non-JSON
  // HTML (firewall block, proxy error page) which would make res.json() throw.
  let text = ""
  try {
    text = await res.text()
  } catch {
    text = ""
  }

  // Blocked upstream before reaching the server (HTML/challenge page, not our
  // JSON) — surface a plain message, not the technical details.
  if (isSecurityBlock(res, text)) {
    throw new Error(UPLOAD_FAILED_MESSAGE)
  }

  let body: UploadResponseBody | null = null
  try {
    body = text ? (JSON.parse(text) as UploadResponseBody) : null
  } catch {
    body = null
  }

  if (!res.ok) {
    if (res.status === 413) throw new Error(TOO_LARGE_MESSAGE)
    if (body?.error) throw new Error(basicMessageFor(body.error))
    throw new Error(UPLOAD_FAILED_MESSAGE)
  }

  return body ?? {}
}

/**
 * Upload a single IMAGE and return its stored URL. Thin wrapper over
 * {@link uploadFile} for the image-only uploaders (blog cover, trip images).
 */
export async function uploadImageFile(file: File, endpoint: string): Promise<string> {
  const body = await uploadFile(file, endpoint)
  if (!body.url) {
    throw new Error("Upload failed — the server did not return an image URL. Please try again.")
  }
  return body.url as string
}
