import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbListHelpArticles, dbCreateHelpArticle } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { sanitizeAttachments } from "@/lib/file-rules"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET() {
  try {
    await requireAdminSession()
    return NextResponse.json(await dbListHelpArticles("all"))
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/help] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAdminSession()
    const data = await req.json()
    if (!data.question?.trim() || !data.answer?.trim()) {
      return NextResponse.json({ error: "Question and answer are required" }, { status: 400 })
    }
    const article = await dbCreateHelpArticle({
      question: data.question,
      answer: data.answer,
      category: data.category ?? "General",
      status: data.status ?? "draft",
      order: data.order ?? 99,
      audience: data.audience ?? "public",
      attachments: sanitizeAttachments(data.attachments),
    })
    revalidatePath("/admin/help")
    void logActivity({
      actor: session,
      action: "help.create",
      entityType: "help",
      entityId: (article as { id?: string }).id,
      summary: `Created help article "${(article as { question?: string }).question ?? data.question}"`,
    })
    return NextResponse.json(article, { status: 201 })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/help] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
