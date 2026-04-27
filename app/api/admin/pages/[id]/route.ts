import { NextResponse } from "next/server"
import { dbGetPage, dbUpdatePage, dbDeletePage } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const page = await dbGetPage(id)
    if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(page)
  } catch (err) {
    console.error("[admin/pages/[id]] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await req.json()
    const updated = await dbUpdatePage(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error("[admin/pages/[id]] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const page = await dbGetPage(id)
    if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if ((page as { isSystemPage?: boolean }).isSystemPage) {
      return NextResponse.json({ error: "Cannot delete a system page" }, { status: 403 })
    }
    await dbDeletePage(id)
    return NextResponse.json({ deleted: id })
  } catch (err) {
    console.error("[admin/pages/[id]] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
