import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { dbCreateApplication } from "@/lib/db/queries"
import { queryOne } from "@/lib/db"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"
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

function isAllowedFile(file: File): boolean {
  return ALLOWED_MIME_TYPES.has(file.type) && ALLOWED_EXTENSIONS.test(file.name)
}

function randomToken(): string {
  return randomBytes(16).toString("hex")
}

export async function POST(request: Request) {
  schedulePrune()
  const limit = rateLimit(request, { limit: 5, windowMs: 60 * 60 * 1000 })
  if (!limit.allowed) return limit.response

  try {
    const formData = await request.formData()

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

    // Upload validated files using randomised paths so stored URLs are not
    // guessable — even though blobs are technically public, the long random
    // token acts as an access capability that applicants cannot enumerate.
    const attachments: { name: string; url: string }[] = []
    let resumeUrl: string | undefined

    if (resume && resume.size > 0) {
      const ext = resume.name.split(".").pop() ?? "bin"
      const blob = await put(
        `applications/${jobId}/${randomToken()}.${ext}`,
        resume,
        { access: "public" }
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
          { access: "public" }
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
      linkedinUrl: linkedinUrl ?? null,
      portfolioUrl: portfolioUrl ?? null,
      attachments,
    })

    return NextResponse.json({ success: true, id: (application as Record<string, unknown>).id })
  } catch (error) {
    console.error("[careers/apply] POST error:", error)
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 })
  }
}
