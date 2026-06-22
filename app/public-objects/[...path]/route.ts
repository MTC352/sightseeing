/**
 * GET /public-objects/<key>
 * Streams a PUBLIC object (blog covers, imported/uploaded media) out of Replit
 * App Storage. These assets are world-readable by design, so no auth is required
 * — and because the key keeps its image extension, the proxy auth gate excludes
 * the path automatically.
 */
import { NextRequest } from "next/server"
import { findPublicObject } from "@/lib/object-storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const key = (path || []).join("/")
  // Only ever serve our own public media prefix, and never allow path traversal.
  // `uploadPublicObject` always writes under `media/`, so this guarantees by code
  // (not just by bucket config) that no other object can be reached here.
  if (!key || !key.startsWith("media/") || key.includes("..")) {
    return new Response("Not found", { status: 404 })
  }

  let file
  try {
    file = await findPublicObject(key)
  } catch {
    return new Response("Storage error", { status: 500 })
  }
  if (!file) {
    return new Response("Not found", { status: 404 })
  }

  let contentType = "application/octet-stream"
  let size: string | undefined
  try {
    const [metadata] = await file.getMetadata()
    if (metadata.contentType) contentType = metadata.contentType
    if (metadata.size != null) size = String(metadata.size)
  } catch {
    // Non-fatal — fall back to generic content type.
  }

  const nodeStream = file.createReadStream()
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      nodeStream.on("end", () => controller.close())
      nodeStream.on("error", (err) => controller.error(err))
    },
    cancel() {
      nodeStream.destroy()
    },
  })

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  }
  if (size) headers["Content-Length"] = size

  return new Response(webStream, { status: 200, headers })
}
