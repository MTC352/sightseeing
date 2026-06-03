import { NextResponse } from "next/server"
import { dbGetIntegration, dbGetMedia } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

// Public endpoint: exposes only the public document links (e.g. the Terms of
// Service PDF) used by the site footer. Never returns any other integration data.
export async function GET() {
  try {
    const row = await dbGetIntegration("terms_of_service")
    let termsOfService: string | null = null
    if (row?.value) {
      try {
        const ref = JSON.parse(row.value)
        if (ref?.url) {
          // Only surface the link if the underlying media file still exists.
          if (ref.mediaId) {
            const media = await dbGetMedia(ref.mediaId)
            termsOfService = media ? media.url : null
          } else {
            termsOfService = ref.url
          }
        }
      } catch {
        termsOfService = null
      }
    }
    return NextResponse.json({ termsOfService })
  } catch (err) {
    console.error("[legal-documents] GET error:", err)
    return NextResponse.json({ termsOfService: null })
  }
}
