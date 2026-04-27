import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbGetJob, dbUpdateJob, dbDeleteJob } from "@/lib/db/queries"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const job = await dbGetJob(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(job)
  } catch (err) {
    console.error("[admin/jobs/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await req.json()
    const updated = await dbUpdateJob(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    revalidatePath("/admin/jobs")
    return NextResponse.json(updated)
  } catch (err) {
    console.error("[admin/jobs/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await dbDeleteJob(id)
    revalidatePath("/admin/jobs")
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[admin/jobs/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
