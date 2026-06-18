import { NextResponse } from "next/server"
import { dbGetAnnouncement } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const announcement = await dbGetAnnouncement()
    return NextResponse.json(announcement, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch {
    return NextResponse.json({
      enabled: false,
      content: "",
      size: "md",
      align: "center",
      bgColor: "",
      textColor: "",
    })
  }
}
