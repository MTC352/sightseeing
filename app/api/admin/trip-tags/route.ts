import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import {
  dbCreateTripTag,
  dbListTripTagOptions,
  dbListTripTagsWithCounts,
} from "@/lib/db/queries"

export const dynamic = "force-dynamic"

/**
 * Admin Trip Tags endpoint.
 *
 * GET — returns the canonical Trip Tags catalog from the `trip_tags` table.
 *   Response shape: { tags: TripTag[], options: { value, label }[] }
 *   `options` is the legacy { value, label } projection still consumed by the
 *   Trip Planner Chat admin page's "Load from trip tags" button.
 *
 * POST — create a new tag.  Body: { slug?, label, show_on_homepage?, sort_order? }.
 *   `slug` is auto-derived from `label` when omitted.
 */
export async function GET() {
  try {
    // `tags` now carries a per-tag published-trip count so the admin
    // listing can render a "Trips" column.  `options` keeps the same
    // legacy shape consumed by the planner-chat admin's "Load from
    // trip tags" button — and it now reflects only tags that have at
    // least one published trip (mirroring the visitor planner).
    const [tags, options] = await Promise.all([
      dbListTripTagsWithCounts(),
      dbListTripTagOptions(),
    ])
    return NextResponse.json({ tags, options })
  } catch (err) {
    console.error("[admin/trip-tags] GET error:", err)
    return NextResponse.json({ tags: [], options: [] })
  }
}

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const label = String(body?.label ?? "").trim()
    if (!label) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 })
    }
    const slug = slugify(String(body?.slug ?? label))
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 })
    }
    const tag = await dbCreateTripTag({
      slug,
      label,
      show_on_homepage: Boolean(body?.show_on_homepage),
      sort_order: Number.isFinite(body?.sort_order) ? Number(body.sort_order) : 0,
    })
    if (!tag) {
      return NextResponse.json({ error: "Tag already exists" }, { status: 409 })
    }
    revalidatePath("/")
    revalidatePath("/admin/trip-tags")
    return NextResponse.json(tag, { status: 201 })
  } catch (err) {
    console.error("[admin/trip-tags] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
