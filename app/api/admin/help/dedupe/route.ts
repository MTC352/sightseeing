import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbDedupeHelpArticles } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function POST() {
  try {
    await requirePermission("help")
    const removed = await dbDedupeHelpArticles()
    revalidatePath("/admin/help")
    return NextResponse.json({ removed })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/help/dedupe] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
