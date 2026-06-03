import { NextResponse } from "next/server"
import {
  dbGetSettings,
  dbUpdateApiKeys,
  dbUpdateAiSystem,
  dbUpdateAiSystemExtra,
  dbUpdateWeglot,
  dbUpdateHeaderFooter,
} from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET() {
  try {
    await requireAdminSession()
    return NextResponse.json(await dbGetSettings())
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/settings] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession()
    const body = await req.json()
    const { section, data } = body as {
      section: "apiKeys" | "ai" | "weglot" | "header" | "footer"
      data: Record<string, unknown>
    }

    if (section === "apiKeys") {
      await dbUpdateApiKeys(data as Record<string, string>)
    } else if (section === "ai") {
      const { system, displayCount, ...config } = data as { system: string; displayCount?: number } & Record<string, unknown>
      await dbUpdateAiSystem(system, config)
      if (typeof displayCount === "number") {
        await dbUpdateAiSystemExtra(system, { display_count: displayCount })
      }
    } else if (section === "weglot") {
      await dbUpdateWeglot(data)
    } else if (section === "header") {
      await dbUpdateHeaderFooter("header", data.customHtml as string)
    } else if (section === "footer") {
      await dbUpdateHeaderFooter("footer", data.customHtml as string)
    } else {
      return NextResponse.json({ error: "Unknown section" }, { status: 400 })
    }

    void logActivity({
      actor: session,
      action: "settings.update",
      entityType: "settings",
      entityId: section,
      summary: `Updated ${section} settings`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/settings] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
