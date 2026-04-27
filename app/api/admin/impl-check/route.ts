import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
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
  } catch (err) {
    console.error("[impl-check] error:", err)
    return NextResponse.json({ error: "DB check failed" }, { status: 500 })
  }
}
