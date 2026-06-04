import { NextResponse } from "next/server"
import { queryOne } from "@/lib/db"

export const dynamic = "force-dynamic"

// Lightweight slug resolver used by proxy.ts to issue real HTTP 308 redirects
// from legacy id / palisis_id trip URLs (`/trip/tcms_21`, `/trip/21`) to the
// canonical WordPress-style slug URL (`/trip/{slug}`). Returns only the slug —
// it is intentionally tiny so the per-request middleware lookup stays cheap.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const row = await queryOne<{ slug: string | null }>(
      `SELECT slug FROM trips WHERE id = $1 OR palisis_id::text = $1 LIMIT 1`,
      [id]
    )
    return NextResponse.json({ slug: row?.slug ?? null })
  } catch {
    return NextResponse.json({ slug: null })
  }
}
