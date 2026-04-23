import { NextResponse } from "next/server"
import { createJob, listJobs } from "@/lib/admin-store"
import type { AdminJob } from "@/lib/admin-store"

export async function GET() {
  return NextResponse.json(listJobs())
}

export async function POST(req: Request) {
  const data: Omit<AdminJob, "id" | "createdAt"> = await req.json()
  const job = createJob(data)
  return NextResponse.json(job, { status: 201 })
}
