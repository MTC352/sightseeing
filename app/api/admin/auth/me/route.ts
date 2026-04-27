import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { queryOne } from "@/lib/db"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const user = await queryOne<{
    id: string; email: string; name: string; role: string; last_login: string
  }>(`SELECT id, email, name, role, last_login FROM admin_users WHERE id = $1 AND is_active = true`, [session.id])
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role, lastLogin: user.last_login })
}
