import { NextResponse } from "next/server"
import { listHelpArticles, createHelpArticle } from "@/lib/admin-store"

export async function GET() {
  return NextResponse.json(listHelpArticles())
}

export async function POST(req: Request) {
  const data = await req.json()
  const article = createHelpArticle({
    question: data.question ?? "",
    answer: data.answer ?? "",
    category: data.category ?? "General",
    status: data.status ?? "draft",
    order: data.order ?? 99,
  })
  return NextResponse.json(article, { status: 201 })
}
