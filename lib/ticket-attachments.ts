/**
 * lib/ticket-attachments.ts
 * Server-only storage for support-ticket attachments.
 *
 * Files are written OUTSIDE `public/` so no URL ever maps to them directly:
 *   <PRIVATE_STORAGE_DIR>/ticket-attachments/<ticketId>/<uuid>.<ext>
 * PRIVATE_STORAGE_DIR defaults to ./storage (gitignored); in Docker it is
 * /app/storage, mounted from the host's ./storage so files survive rebuilds.
 * The `ticket_attachments` table holds the metadata, and the only way to read
 * a file is /api/admin/tickets/attachments/[id], which requires a full admin.
 */
import { randomUUID } from "node:crypto"
import { mkdir, rm, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { dbInsertTicketAttachments, dbListTicketAttachments } from "@/lib/db/queries"
import { isFullAdmin } from "@/lib/admin-permissions"
import {
  cleanFilename, fileExtension, isSafeStorageKey, mimeForExtension, type TicketAttachment,
} from "@/lib/ticket-attachment-rules"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function storageRoot(): string {
  const base = process.env.PRIVATE_STORAGE_DIR || path.join(process.cwd(), "storage")
  return path.resolve(base, "ticket-attachments")
}

/** Absolute path for a stored key, or null when the key isn't one we generated. */
export function attachmentPath(storageKey: string): string | null {
  return isSafeStorageKey(storageKey) ? path.join(storageRoot(), storageKey) : null
}

/**
 * Read a ticket create/reply request: JSON (text only) or multipart with the
 * text fields plus `files`.
 */
export async function parseTicketRequest(req: Request): Promise<{ data: Record<string, unknown>; files: File[] }> {
  if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    return { data: await req.json(), files: [] }
  }
  const form = await req.formData()
  const data: Record<string, unknown> = {}
  const files: File[] = []
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") data[key] = value
    else if (key === "files") files.push(value)
  }
  return { data, files }
}

/**
 * Write validated files to disk, then record them in one transaction. If
 * anything fails, files already written are removed so nothing is orphaned.
 */
export async function saveTicketAttachments(
  ticketId: string,
  replyId: string | null,
  files: File[],
  uploadedBy: string | null,
): Promise<TicketAttachment[]> {
  if (files.length === 0) return []
  if (!UUID_RE.test(ticketId)) throw new Error("Invalid ticket id")
  await mkdir(path.join(storageRoot(), ticketId), { recursive: true })

  const written: string[] = []
  try {
    const rows = []
    for (const file of files) {
      const filename = cleanFilename(file.name)
      const ext = fileExtension(filename)
      const id = randomUUID()
      const storageKey = `${ticketId}/${id}.${ext}`
      const target = attachmentPath(storageKey)
      if (!target) throw new Error(`Unsupported file name: ${filename}`)
      // "wx": never overwrite an existing file.
      await writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: "wx" })
      written.push(target)
      rows.push({ id, ticketId, replyId, filename, mimeType: mimeForExtension(ext), sizeBytes: file.size, storageKey, uploadedBy })
    }
    return (await dbInsertTicketAttachments(rows)) as unknown as TicketAttachment[]
  } catch (err) {
    await Promise.all(written.map((p) => unlink(p).catch(() => undefined)))
    throw err
  }
}

/** Remove every stored file for a ticket (its rows go via ON DELETE CASCADE). */
export async function removeTicketAttachmentFiles(ticketId: string): Promise<void> {
  if (!UUID_RE.test(ticketId)) return
  await rm(path.join(storageRoot(), ticketId), { recursive: true, force: true })
}

/**
 * Add the attachment list for full admins. Everyone else gets none, so
 * filenames never reach an employee without full access.
 */
export async function withTicketAttachments<T extends { id: string }>(
  ticket: T,
  session: { role: string; permissions?: unknown },
): Promise<T & { canAttach: boolean; attachments: TicketAttachment[] }> {
  if (!isFullAdmin(session.role, session.permissions)) return { ...ticket, canAttach: false, attachments: [] }
  const attachments = (await dbListTicketAttachments(ticket.id)) as unknown as TicketAttachment[]
  return { ...ticket, canAttach: true, attachments }
}
