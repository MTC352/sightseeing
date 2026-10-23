import { NextResponse } from "next/server"
import { dbGetPageContent, dbSavePageContent } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"
import { validateLayoutChanges } from "@/lib/page-layout"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET(req: Request) {
  try {
    await requirePermission("pages")
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "slug query param required" }, { status: 400 })
    const content = await dbGetPageContent(slug)
    return NextResponse.json(content)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/page-content] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("pages")
    const data = await req.json()
    const { slug, changes } = data
    if (
      !slug ||
      typeof slug !== "string" ||
      typeof changes !== "object" ||
      changes === null ||
      Array.isArray(changes)
    ) {
      return NextResponse.json({ error: "slug and changes are required" }, { status: 400 })
    }
    if (!Object.values(changes).every((v) => typeof v === "string")) {
      return NextResponse.json(
        { error: "changes must be an object of string values" },
        { status: 400 },
      )
    }
    // Layout controls (removed boxes / column presets): validate values, and
    // reserve restoring a removed box for the superadmin.
    const layoutError = validateLayoutChanges(
      changes as Record<string, string>,
      await dbGetPageContent(slug),
      session.role === FULL_ACCESS_ROLE,
    )
    if (layoutError) return NextResponse.json({ error: layoutError }, { status: 403 })
    const saved = await dbSavePageContent(slug, changes)
    return NextResponse.json({ saved })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/page-content] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
