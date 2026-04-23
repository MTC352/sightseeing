import { NextResponse } from "next/server"
import {
  getSettings,
  updateApiKeys,
  updateAiSystem,
  updateWeglot,
  updateHeaderFooter,
} from "@/lib/admin-store"

export async function GET() {
  return NextResponse.json(getSettings())
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { section, data } = body as {
      section: "apiKeys" | "ai" | "weglot" | "header" | "footer"
      data: Record<string, unknown>
      system?: string
    }

    if (section === "apiKeys") {
      updateApiKeys(data as Parameters<typeof updateApiKeys>[0])
    } else if (section === "ai") {
      const { system, ...config } = data as { system: string } & Record<string, unknown>
      updateAiSystem(system, config as Parameters<typeof updateAiSystem>[1])
    } else if (section === "weglot") {
      updateWeglot(data as Parameters<typeof updateWeglot>[0])
    } else if (section === "header") {
      updateHeaderFooter("header", data.customHtml as string)
    } else if (section === "footer") {
      updateHeaderFooter("footer", data.customHtml as string)
    } else {
      return NextResponse.json({ error: "Unknown section" }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[admin/settings] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
