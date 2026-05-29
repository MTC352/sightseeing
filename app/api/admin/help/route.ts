import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbListHelpArticles, dbCreateHelpArticle } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

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
    await requireAdminSession()
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
    })
    revalidatePath("/admin/help")
    return NextResponse.json(article, { status: 201 })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/help] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
