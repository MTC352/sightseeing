import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import { requireFullAccess } from "@/lib/auth-server"
import { dbGetTicketAttachment } from "@/lib/db/queries"
import { attachmentPath } from "@/lib/ticket-attachments"
import { contentDisposition, isInlineMimeType } from "@/lib/ticket-attachment-rules"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type AttachmentRow = { filename: string; mimeType: string; storageKey: string }

/**
 * Serve a ticket attachment from private disk storage. Full admins only
 * (superadmin or a "*" full-access employee); proxy.ts additionally requires
 * the `tickets` section for this prefix. Images and PDFs open in the browser
 * (`?download=1` forces a download); other types always download.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireFullAccess()
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const row = (await dbGetTicketAttachment(id)) as AttachmentRow | null
    const file = row ? attachmentPath(row.storageKey) : null
    if (!row || !file) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let bytes: Buffer
    try {
      bytes = await readFile(file)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(`[admin/tickets/attachments] file missing on disk for ${id}`)
        return NextResponse.json({ error: "File is missing from storage" }, { status: 404 })
      }
      throw err
    }

    const inline = isInlineMimeType(row.mimeType) && new URL(req.url).searchParams.get("download") !== "1"
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": contentDisposition(row.filename, inline),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 403) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/tickets/attachments/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
