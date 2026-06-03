import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbGetHelpArticle, dbUpdateHelpArticle, dbDeleteHelpArticle } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { sanitizeAttachments } from "@/lib/file-rules"

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
    const session = await requireAdminSession()
    const { id } = await params
    const data = await req.json()
    // Sanitize attachment metadata at the trust boundary (block javascript:/data:
    // URLs that would become stored XSS when rendered as links on /help).
    if ("attachments" in data) {
      data.attachments = sanitizeAttachments(data.attachments)
    }
    const updated = await dbUpdateHelpArticle(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    revalidatePath("/admin/help")
    void logActivity({
      actor: session,
      action: "help.update",
      entityType: "help",
      entityId: id,
      summary: `Updated help article "${(updated as { question?: string }).question ?? id}"`,
    })
    return NextResponse.json(updated)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/help/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    const { id } = await params
    await dbDeleteHelpArticle(id)
    revalidatePath("/admin/help")
    void logActivity({
      actor: session,
      action: "help.delete",
      entityType: "help",
      entityId: id,
      summary: `Deleted help article ${id}`,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/help/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
