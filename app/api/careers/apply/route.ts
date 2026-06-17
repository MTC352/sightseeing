import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { dbCreateApplication } from "@/lib/db/queries"
import { queryOne } from "@/lib/db"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"
import { sanitizeExternalUrl } from "@/lib/sanitize-html"
import { randomBytes } from "crypto"

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/jpeg",
  "image/png",
])

const ALLOWED_EXTENSIONS = /\.(pdf|doc|docx|txt|jpg|jpeg|png)$/i

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_ATTACHMENTS = 5

// Hard total body cap enforced via stream reading before multipart parsing.
// Covers chunked/streamed requests that omit Content-Length entirely.
const MAX_TOTAL_BODY = MAX_FILE_SIZE * MAX_ATTACHMENTS + 1024 * 1024 // 51 MB

function isAllowedFile(file: File): boolean {
  return ALLOWED_MIME_TYPES.has(file.type) && ALLOWED_EXTENSIONS.test(file.name)
}

function randomToken(): string {
  return randomBytes(16).toString("hex")
}

/**
 * Read the entire request body into a Buffer while enforcing MAX_TOTAL_BODY.
 * Returns null and a 413 NextResponse if the body exceeds the limit —
 * critically, this works for all transfer encodings including chunked,
 * where Content-Length is absent or unreliable.
 */
async function readBodyWithLimit(
  request: Request,
): Promise<{ body: Buffer; contentType: string } | { limitExceeded: true }> {
  // Fast path: reject on Content-Length alone when the header is present and
  // clearly over the limit — avoids streaming overhead for obvious abuse.
  const clHeader = request.headers.get("content-length")
  if (clHeader !== null) {
    const declared = parseInt(clHeader, 10)
    if (Number.isFinite(declared) && declared > MAX_TOTAL_BODY) {
      return { limitExceeded: true }
    }
  }

  const contentType = request.headers.get("content-type") ?? "application/octet-stream"

  if (!request.body) {
    return { body: Buffer.alloc(0), contentType }
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_TOTAL_BODY) {
        reader.cancel().catch(() => undefined)
        return { limitExceeded: true }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const merged = Buffer.concat(chunks)
  return { body: merged, contentType }
}

export async function POST(request: Request) {
  schedulePrune()
  const limit = rateLimit(request, { limit: 5, windowMs: 60 * 60 * 1000 })
  if (!limit.allowed) return limit.response

  // Read and hard-limit the body BEFORE multipart parsing so oversized requests
  // — including chunked transfers that omit Content-Length — are rejected before
  // the server allocates parser memory.
  const bodyResult = await readBodyWithLimit(request)
  if ("limitExceeded" in bodyResult) {
    return NextResponse.json(
      { error: `Request body too large. Maximum total upload size is ${MAX_ATTACHMENTS * 10} MB.` },
      { status: 413 },
    )
  }

  try {
    // Reconstruct a synthetic request from the already-read, size-checked bytes
    // so that the built-in formData() parser can process the multipart body.
    const syntheticReq = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": bodyResult.contentType },
      body: bodyResult.body,
    })
    const formData = await syntheticReq.formData()

    const jobId = formData.get("jobId") as string
    const fullName = formData.get("fullName") as string
    const email = formData.get("email") as string
    const phone = formData.get("phone") as string | null
    const coverLetter = formData.get("coverLetter") as string
    const linkedinUrl = formData.get("linkedinUrl") as string | null
    const portfolioUrl = formData.get("portfolioUrl") as string | null

    if (!jobId || !fullName || !email || !coverLetter) {
      return NextResponse.json(
        { error: "Missing required fields: jobId, fullName, email, coverLetter" },
        { status: 400 }
      )
    }

    const job = await queryOne<{ id: string; title: string; status: string }>(
      `SELECT id, title, status FROM jobs WHERE id = $1`, [jobId]
    )
    if (!job || job.status !== "open") {
      return NextResponse.json({ error: "Job not found or no longer accepting applications" }, { status: 404 })
    }

    // Collect all uploaded files for validation before any blob writes
    const resume = formData.get("resume") as File | null
    const extraFiles = formData.getAll("files") as File[]
    const allFiles = [
      ...(resume && resume.size > 0 ? [resume] : []),
      ...extraFiles.filter((f) => f && f.size > 0),
    ]

    if (allFiles.length > MAX_ATTACHMENTS) {
      return NextResponse.json(
        { error: `Too many attachments. Maximum ${MAX_ATTACHMENTS} files allowed.` },
        { status: 400 }
      )
    }

    for (const file of allFiles) {
      if (!isAllowedFile(file)) {
        return NextResponse.json(
          { error: `File type not allowed: ${file.name}. Accepted formats: PDF, DOC, DOCX, TXT, JPG, PNG.` },
          { status: 400 }
        )
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large: ${file.name}. Maximum size per file is 10 MB.` },
          { status: 400 }
        )
      }
    }

    // Upload validated files as private blobs. Private blobs are not accessible
    // via direct URL — they require server-side authentication (BLOB_READ_WRITE_TOKEN).
    // The admin UI always downloads through the /api/admin/applications/download
    // proxy which enforces an active admin session before calling blob get().
    const attachments: { name: string; url: string }[] = []
    let resumeUrl: string | undefined

    if (resume && resume.size > 0) {
      const ext = resume.name.split(".").pop() ?? "bin"
      const blob = await put(
        `applications/${jobId}/${randomToken()}.${ext}`,
        resume,
        { access: "private" }
      )
      resumeUrl = blob.url
      attachments.push({ name: resume.name, url: blob.url })
    }

    for (const file of extraFiles) {
      if (file && file.size > 0) {
        const ext = file.name.split(".").pop() ?? "bin"
        const blob = await put(
          `applications/${jobId}/${randomToken()}.${ext}`,
          file,
          { access: "private" }
        )
        attachments.push({ name: file.name, url: blob.url })
      }
    }

    const application = await dbCreateApplication({
      jobId,
      fullName,
      email,
      phone: phone ?? null,
      coverLetter,
      resumeUrl: resumeUrl ?? null,
      // Validate applicant-supplied links at the trust boundary: only absolute
      // http(s) URLs are stored. Dangerous schemes (javascript:, data:, …) are
      // dropped to null so they can never reach an admin-page href.
      linkedinUrl: sanitizeExternalUrl(linkedinUrl),
      portfolioUrl: sanitizeExternalUrl(portfolioUrl),
      attachments,
    })

    return NextResponse.json({ success: true, id: (application as Record<string, unknown>).id })
  } catch (error) {
    console.error("[careers/apply] POST error:", error)
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 })
  }
}
