import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbGetHelpArticle, dbUpdateHelpArticle, dbDeleteHelpArticle } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    const article = await dbGetHelpArticle(id)
    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(article)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/help/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    const data = await req.json()
    const updated = await dbUpdateHelpArticle(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    revalidatePath("/admin/help")
    return NextResponse.json(updated)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/help/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    await dbDeleteHelpArticle(id)
    revalidatePath("/admin/help")
    return NextResponse.json({ success: true })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/help/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
