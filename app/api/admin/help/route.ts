import { NextResponse } from "next/server"
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
    const article = await dbCreateHelpArticle({
      question: data.question ?? "",
      answer: data.answer ?? "",
      category: data.category ?? "General",
      status: data.status ?? "draft",
      order: data.order ?? 99,
    })
    return NextResponse.json(article, { status: 201 })
  } catch (err) {
    console.error("[admin/help] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
