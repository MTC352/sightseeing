import { NextResponse } from "next/server"
import { dbListApplications, dbUpdateApplication, dbDeleteApplication } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get("jobId") ?? undefined
    const status = searchParams.get("status") ?? undefined
    return NextResponse.json(await dbListApplications({ jobId, status }))
  } catch (err) {
    console.error("[admin/applications] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: "Missing application id" }, { status: 400 })
    const updated = await dbUpdateApplication(id, data)
    if (!updated) return NextResponse.json({ error: "Application not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error("[admin/applications] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Missing application id" }, { status: 400 })
    await dbDeleteApplication(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[admin/applications] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
