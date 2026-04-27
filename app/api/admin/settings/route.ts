import { NextResponse } from "next/server"
import {
  dbGetSettings,
  dbUpdateApiKeys,
  dbUpdateAiSystem,
  dbUpdateWeglot,
  dbUpdateHeaderFooter,
} from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await dbGetSettings())
  } catch (err) {
    console.error("[admin/settings] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { section, data } = body as {
      section: "apiKeys" | "ai" | "weglot" | "header" | "footer"
      data: Record<string, unknown>
    }

    if (section === "apiKeys") {
      await dbUpdateApiKeys(data as Record<string, string>)
    } else if (section === "ai") {
      const { system, ...config } = data as { system: string } & Record<string, unknown>
      await dbUpdateAiSystem(system, config)
    } else if (section === "weglot") {
      await dbUpdateWeglot(data)
    } else if (section === "header") {
      await dbUpdateHeaderFooter("header", data.customHtml as string)
    } else if (section === "footer") {
      await dbUpdateHeaderFooter("footer", data.customHtml as string)
    } else {
      return NextResponse.json({ error: "Unknown section" }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[admin/settings] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
