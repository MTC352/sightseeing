import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import { dbListErrorLogs, dbListErrorLogSources, dbClearErrorLogs } from "@/lib/error-log"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    await requireAdminSession()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const source = searchParams.get("source")?.trim() || undefined
  const limit = parseInt(searchParams.get("limit") ?? "200", 10)
  const levelParam = searchParams.get("level")?.trim()
  const level =
    levelParam === "error" || levelParam === "warn" || levelParam === "info"
      ? levelParam
      : undefined

  try {
    const [logs, sources] = await Promise.all([
      dbListErrorLogs({ limit: Number.isFinite(limit) ? limit : 200, source, level }),
      dbListErrorLogSources(),
    ])
    return NextResponse.json({ logs, sources })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load logs"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdminSession()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const source = searchParams.get("source")?.trim() || undefined

  try {
    const removed = await dbClearErrorLogs(source)
    return NextResponse.json({ ok: true, removed })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to clear logs"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
