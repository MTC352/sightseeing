import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbListHelpArticles, dbCreateHelpArticle } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await dbListHelpArticles())
  } catch (err) {
    console.error("[admin/help] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
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
    })
    revalidatePath("/admin/help")
    return NextResponse.json(article, { status: 201 })
  } catch (err) {
    console.error("[admin/help] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
