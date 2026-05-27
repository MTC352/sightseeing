import { NextResponse } from "next/server"
import { dbListPromptRevisions } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/prompt-revisions?systemKey=chat&promptKind=systemPrompt
 * Lists revision history (most recent first) for a given (systemKey, promptKind).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const systemKey = url.searchParams.get("systemKey") || ""
  const promptKind = url.searchParams.get("promptKind") || ""
  if (!systemKey || !promptKind) {
    return NextResponse.json({ error: "systemKey and promptKind are required" }, { status: 400 })
  }
  try {
    await requireAdminSession()
    const revisions = await dbListPromptRevisions(systemKey, promptKind, 50)
    return NextResponse.json({ revisions })
  } catch (err: unknown) {
    if (err instanceof Error && (err as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[prompt-revisions] GET error:", err)
    return NextResponse.json({ error: "Failed to load revisions" }, { status: 500 })
  }
}
