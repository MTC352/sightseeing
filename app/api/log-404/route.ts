import { NextResponse } from "next/server"
import { dbLog404 } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

// Beacon endpoint hit by the 404 page's client tracker. Because it fires only
// when the not-found UI actually renders in the browser, it records real broken
// links (people following old indexed URLs) without the false positives a
// server-side not-found boundary produces (that boundary is evaluated on every
// request, including successful 200 pages). dbLog404 dedupes by path, counts
// hits, and skips assets — so this is safe to call freely and fail-soft.
export async function POST(req: Request) {
  try {
    const { path } = await req.json()
    if (typeof path !== "string" || !path.startsWith("/") || path.length > 512) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    await dbLog404(path)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
