import { NextResponse } from "next/server"
import { dbListPromptRevisions } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/prompt-revisions?systemKey=chat&promptKind=systemPrompt
 * Lists revision history (most recent first) for a given (systemKey, promptKind).
 * Auth is enforced by the global /api/admin proxy gate.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const systemKey = url.searchParams.get("systemKey") || ""
  const promptKind = url.searchParams.get("promptKind") || ""
  if (!systemKey || !promptKind) {
    return NextResponse.json({ error: "systemKey and promptKind are required" }, { status: 400 })
  }
  try {
    const revisions = await dbListPromptRevisions(systemKey, promptKind, 50)
    return NextResponse.json({ revisions })
  } catch (err) {
    console.error("[prompt-revisions] GET error:", err)
    return NextResponse.json({ error: "Failed to load revisions" }, { status: 500 })
  }
}
