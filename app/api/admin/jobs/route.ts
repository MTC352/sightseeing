import { NextResponse } from "next/server"
import { dbListJobs, dbCreateJob } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await dbListJobs())
  } catch (err) {
    console.error("[admin/jobs] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const job = await dbCreateJob(data)
    return NextResponse.json(job, { status: 201 })
  } catch (err) {
    console.error("[admin/jobs] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
