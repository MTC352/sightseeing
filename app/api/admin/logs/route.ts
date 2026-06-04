import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import {
  dbListErrorLogs,
  dbListErrorLogSources,
  dbClearErrorLogs,
  dbCountErrorLogs,
} from "@/lib/error-log"

export const dynamic = "force-dynamic"

type LogLevel = "error" | "warn" | "info"

function parseLevels(raw: string | null): LogLevel[] | undefined {
  if (!raw) return undefined
  const levels = raw
    .split(",")
    .map((s) => s.trim())
    .filter((l): l is LogLevel => l === "error" || l === "warn" || l === "info")
  return levels.length ? levels : undefined
}

export async function GET(req: Request) {
  try {
    await requireAdminSession()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const source = searchParams.get("source")?.trim() || undefined
  // Accept both `levels=error,warn` and the legacy single `level=error`.
  const levels = parseLevels(searchParams.get("levels") ?? searchParams.get("level"))
  const from = searchParams.get("from")?.trim() || undefined
  const to = searchParams.get("to")?.trim() || undefined

  const limitRaw = parseInt(searchParams.get("limit") ?? "10", 10)
  const offsetRaw = parseInt(searchParams.get("offset") ?? "0", 10)
  const limit = Number.isFinite(limitRaw) ? limitRaw : 10
  const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0

  const filter = { source, levels, from, to }

  try {
    const [logs, sources, total] = await Promise.all([
      dbListErrorLogs({ ...filter, limit, offset }),
      dbListErrorLogSources(),
      dbCountErrorLogs(filter),
    ])
    return NextResponse.json({ logs, sources, total })
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
