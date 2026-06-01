import { NextRequest, NextResponse } from "next/server"
import { dbGetPageContent } from "@/lib/db/queries"
import { INLINE_CONTENT_SLUG } from "@/lib/page-content-slug"

// Public, read-only endpoint. Returns the persisted inline page edits so the
// live site reflects admin edits for every visitor. Writes are NOT accepted
// here — they go through the admin-protected /api/admin/page-content endpoint.
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const content = await dbGetPageContent(INLINE_CONTENT_SLUG)
    const key = req.nextUrl.searchParams.get("key")
    if (key) {
      return NextResponse.json({ key, value: content[key] ?? null })
    }
    return NextResponse.json(content)
  } catch (err) {
    // Fail-soft: never break public pages if the DB is briefly unavailable —
    // the site simply renders its baked-in defaults.
    console.error("[page-content] GET error:", err)
    return NextResponse.json({})
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Inline content is written via the admin-protected /api/admin/page-content endpoint." },
    { status: 405 },
  )
}
