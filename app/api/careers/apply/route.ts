import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { createApplication, getJob } from "@/lib/admin-store"

export async function POST(request: Request) {
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
    
    const job = getJob(jobId)
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }
    
    // Handle file uploads
    const attachments: { name: string; url: string }[] = []
    let resumeUrl: string | undefined
    
    // Upload resume if provided
    const resume = formData.get("resume") as File | null
    if (resume && resume.size > 0) {
      const blob = await put(`applications/${jobId}/${Date.now()}-${resume.name}`, resume, {
        access: "public",
      })
      resumeUrl = blob.url
      attachments.push({ name: resume.name, url: blob.url })
    }
    
    // Upload additional files
    const files = formData.getAll("files") as File[]
    for (const file of files) {
      if (file && file.size > 0) {
        const blob = await put(`applications/${jobId}/${Date.now()}-${file.name}`, file, {
          access: "public",
        })
        attachments.push({ name: file.name, url: blob.url })
      }
    }
    
    const application = createApplication({
      jobId,
      jobTitle: job.title,
      fullName,
      email,
      phone: phone || undefined,
      coverLetter,
      resumeUrl,
      linkedinUrl: linkedinUrl || undefined,
      portfolioUrl: portfolioUrl || undefined,
      attachments,
    })
    
    return NextResponse.json({ success: true, id: application.id })
  } catch (error) {
    console.error("Apply error:", error)
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 })
  }
}
