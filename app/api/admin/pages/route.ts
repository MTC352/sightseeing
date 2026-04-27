import { NextResponse } from "next/server"
import { dbListPages, dbCreatePage } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await dbListPages())
  } catch (err) {
    console.error("[admin/pages] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    if (!data.slug || !data.title) {
      return NextResponse.json({ error: "slug and title are required" }, { status: 400 })
    }
    const page = await dbCreatePage(data)
    return NextResponse.json(page, { status: 201 })
  } catch (err) {
    console.error("[admin/pages] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
