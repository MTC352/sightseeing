import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbListJobs, dbCreateJob } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET() {
  try {
    await requireAdminSession()
    return NextResponse.json(await dbListJobs())
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/jobs] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession()
    const data = await req.json()
    if (!data.title?.trim()) return NextResponse.json({ error: "Job title is required" }, { status: 400 })
    const job = await dbCreateJob(data)
    revalidatePath("/admin/jobs")
    return NextResponse.json(job, { status: 201 })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/jobs] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
