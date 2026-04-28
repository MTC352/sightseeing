import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbListIntegrations, dbUpsertIntegration, dbGetIntegration } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await dbListIntegrations()
    return NextResponse.json(rows)
  } catch (err) {
    console.error("[admin/integrations] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { key: string; label?: string; value: string } | Array<{ key: string; label?: string; value: string }>

    const items = Array.isArray(body) ? body : [body]

    for (const item of items) {
      if (!item.key) continue
      const existing = await dbGetIntegration(item.key)
      await dbUpsertIntegration(
        item.key,
        item.label ?? existing?.label ?? item.key,
        item.value ?? ""
      )
    }

    revalidatePath("/admin/integrations")
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[admin/integrations] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
