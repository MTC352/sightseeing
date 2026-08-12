import { createHash } from "node:crypto"

// Stable content key for the (lang, source_text) primary key. Server-only.
export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex")
}
