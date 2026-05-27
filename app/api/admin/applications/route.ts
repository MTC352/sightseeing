import { NextResponse } from "next/server"
import { dbListApplications, dbUpdateApplication, dbDeleteApplication } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET(req: Request) {
  try {
    await requireAdminSession()
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get("jobId") ?? undefined
    const status = searchParams.get("status") ?? undefined
    return NextResponse.json(await dbListApplications({ jobId, status }))
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/applications] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdminSession()
    const body = await req.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: "Missing application id" }, { status: 400 })
    const updated = await dbUpdateApplication(id, data)
    if (!updated) return NextResponse.json({ error: "Application not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/applications] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdminSession()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Missing application id" }, { status: 400 })
    await dbDeleteApplication(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/applications] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
