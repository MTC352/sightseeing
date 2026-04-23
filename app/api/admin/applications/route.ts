import { NextResponse } from "next/server"
import { listApplications, updateApplication, deleteApplication } from "@/lib/admin-store"

export async function GET() {
  const applications = listApplications()
  return NextResponse.json(applications)
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, ...data } = body
  if (!id) {
    return NextResponse.json({ error: "Missing application id" }, { status: 400 })
  }
  const updated = updateApplication(id, data)
  if (!updated) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }
  return NextResponse.json(updated)
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "Missing application id" }, { status: 400 })
  }
  const deleted = deleteApplication(id)
  if (!deleted) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
