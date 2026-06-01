import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbDedupeHelpArticles } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function POST() {
  try {
    await requireAdminSession()
    const removed = await dbDedupeHelpArticles()
    revalidatePath("/admin/help")
    return NextResponse.json({ removed })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/help/dedupe] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
