import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireAdminSession()
    const rows = await query(`
      SELECT
        (SELECT COUNT(*) FROM admin_users)          AS admin_users,
        (SELECT COUNT(*) FROM trips)                AS trips,
        (SELECT COUNT(*) FROM blog_posts)           AS blog_posts,
        (SELECT COUNT(*) FROM jobs)                 AS jobs,
        (SELECT COUNT(*) FROM help_articles)        AS help_articles,
        (SELECT COUNT(*) FROM ai_system_configs)    AS ai_configs,
        (SELECT COUNT(*) FROM integrations)         AS integrations,
        (SELECT COUNT(*) FROM header_footer_blocks) AS hf_blocks,
        (SELECT COUNT(*) FROM pages)                AS pages,
        (SELECT COUNT(*) FROM taxonomies)           AS taxonomies,
        (SELECT COUNT(*) FROM departures)           AS departures
    `)
    return NextResponse.json(rows[0])
  } catch (err: unknown) {
    if (err instanceof Error && (err as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[impl-check] error:", err)
    return NextResponse.json({ error: "DB check failed" }, { status: 500 })
  }
}
