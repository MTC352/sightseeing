import { NextRequest, NextResponse } from "next/server"
import { getContent, setContent, getAllContent } from "@/lib/page-content-store"

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key")
  if (key) {
    const value = getContent(key)
    return NextResponse.json({ key, value: value ?? null })
  }
  return NextResponse.json(getAllContent())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { key, value } = body as { key: string; value: string }
  if (!key || typeof value !== "string") {
    return NextResponse.json({ error: "key and value are required" }, { status: 400 })
  }
  setContent(key, value)
  return NextResponse.json({ ok: true, key, value })
}
