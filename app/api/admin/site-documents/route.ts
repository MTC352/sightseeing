import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import { dbGetIntegration, dbUpsertIntegration, dbGetMedia } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

const TOS_KEY = "terms_of_service"

type DocRef = { mediaId: string | null; url: string | null; filename: string | null }

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function parseRef(value: string | null | undefined): DocRef {
  if (!value) return { mediaId: null, url: null, filename: null }
  try {
    const v = JSON.parse(value)
    return { mediaId: v.mediaId ?? null, url: v.url ?? null, filename: v.filename ?? null }
  } catch {
    return { mediaId: null, url: null, filename: null }
  }
}

export async function GET() {
  try {
    await requireAdminSession()
    const row = await dbGetIntegration(TOS_KEY)
    return NextResponse.json({ termsOfService: parseRef(row?.value) })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/site-documents] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdminSession()
    const body = await req.json().catch(() => ({}))
    const mediaId: string | null = typeof body.mediaId === "string" && body.mediaId ? body.mediaId : null

    let ref: DocRef = { mediaId: null, url: null, filename: null }
    if (mediaId) {
      const media = await dbGetMedia(mediaId)
      if (!media) return NextResponse.json({ error: "File not found" }, { status: 404 })
      ref = { mediaId: media.id, url: media.url, filename: media.title ?? media.filename }
    }

    await dbUpsertIntegration(TOS_KEY, "Terms of Service Document", JSON.stringify(ref))
    return NextResponse.json({ termsOfService: ref })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/site-documents] PUT error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
