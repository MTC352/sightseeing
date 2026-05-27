import { NextResponse } from "next/server"
import { dbGetPageContent, dbSavePageContent } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET(req: Request) {
  try {
    await requireAdminSession()
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "slug query param required" }, { status: 400 })
    const content = await dbGetPageContent(slug)
    return NextResponse.json(content)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/page-content] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession()
    const data = await req.json()
    const { slug, changes } = data
    if (!slug || typeof changes !== "object") {
      return NextResponse.json({ error: "slug and changes are required" }, { status: 400 })
    }
    const saved = await dbSavePageContent(slug, changes)
    return NextResponse.json({ saved })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/page-content] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
