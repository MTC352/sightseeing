import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import { dbGetMedia, dbFindMediaUsage } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    const file = await dbGetMedia(id)
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const usage = await dbFindMediaUsage(file.url)
    return NextResponse.json({ file, usage })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/media/usage] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
