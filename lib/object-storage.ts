/**
 * lib/object-storage.ts
 * Thin server-side wrapper around Replit App Storage (Google Cloud Storage via
 * the Replit sidecar) for PUBLIC assets — currently AI-generated blog covers and
 * imported/uploaded media.
 *
 * Why this exists: a published Replit deploy runs on an EPHEMERAL filesystem and
 * only serves build-time `public/` assets, so anything written to `public/uploads`
 * at runtime 404s in production. Object Storage is durable across deploys, so
 * generated images survive and render on the live site.
 *
 * This module deliberately handles PUBLIC objects only: blog covers and media
 * library images are world-readable by design. Files are written under the
 * bucket's public search path and streamed back through `/public-objects/<key>`.
 */
import { Storage, type File } from "@google-cloud/storage"

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106"

let client: Storage | null = null

function getClient(): Storage {
  if (client) return client
  client = new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: "external_account",
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: {
          type: "json",
          subject_token_field_name: "access_token",
        },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  })
  return client
}

/** Comma-separated, de-duplicated public search paths (e.g. `/bucket/public`). */
function publicSearchPaths(): string[] {
  const raw = process.env.PUBLIC_OBJECT_SEARCH_PATHS || ""
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    ),
  )
}

/** True when a public bucket path is configured (i.e. App Storage is set up). */
export function isObjectStorageConfigured(): boolean {
  return publicSearchPaths().length > 0
}

/** Split `/bucket/object/name` into its bucket + object-name parts. */
function parseObjectPath(fullPath: string): { bucketName: string; objectName: string } {
  const normalized = fullPath.startsWith("/") ? fullPath : `/${fullPath}`
  const parts = normalized.split("/")
  if (parts.length < 3) {
    throw new Error("Invalid object path: must contain a bucket name and object name")
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") }
}

/**
 * Upload raw bytes as a PUBLIC object and return the app-relative URL it is
 * served from (`/public-objects/<key>`). The key intentionally keeps its file
 * extension so the served URL bypasses the proxy auth gate (which excludes image
 * extensions) and is treated as a static-style asset.
 */
export async function uploadPublicObject(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const searchPaths = publicSearchPaths()
  if (searchPaths.length === 0) {
    throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set — App Storage is not configured")
  }
  const fullPath = `${searchPaths[0]}/${key}`
  const { bucketName, objectName } = parseObjectPath(fullPath)
  const file = getClient().bucket(bucketName).file(objectName)
  await file.save(buffer, {
    contentType: contentType || "application/octet-stream",
    resumable: false,
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
  })
  return `/public-objects/${key}`
}

/** Locate a previously-stored public object by its key, across all search paths. */
export async function findPublicObject(key: string): Promise<File | null> {
  for (const searchPath of publicSearchPaths()) {
    const { bucketName, objectName } = parseObjectPath(`${searchPath}/${key}`)
    const file = getClient().bucket(bucketName).file(objectName)
    const [exists] = await file.exists()
    if (exists) return file
  }
  return null
}
