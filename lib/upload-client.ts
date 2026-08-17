/**
 * Shared client-side image upload helper.
 *
 * Both the blog cover uploader and the trip edit form used to call the upload
 * endpoints and then blindly `await res.json()`. When a response is NOT valid
 * JSON — e.g. a large file truncated/rejected by the proxy or platform (413),
 * an HTML error page, or an empty body — that `res.json()` throws a raw
 * `SyntaxError: Unexpected token '<' … is not valid JSON`, which surfaced to
 * users as a confusing "JSON parse error".
 *
 * This helper parses defensively and always throws an Error with a clean,
 * user-facing message, so callers only need a single try/catch.
 */

interface UploadResponseBody {
  url?: string
  error?: string
}

/** Read a Response as JSON without ever throwing on a non-JSON body. */
async function safeJson(res: Response): Promise<UploadResponseBody | null> {
  try {
    return (await res.json()) as UploadResponseBody
  } catch {
    return null
  }
}

/**
 * Upload a single image file to `endpoint` (POST multipart, field `file`).
 * Resolves to the uploaded image URL, or throws an Error whose `message` is
 * safe to show directly to the user.
 */
export async function uploadImageFile(file: File, endpoint: string): Promise<string> {
  const fd = new FormData()
  fd.append("file", file)

  let res: Response
  try {
    res = await fetch(endpoint, { method: "POST", body: fd })
  } catch {
    throw new Error("Upload failed — network error. Please check your connection and try again.")
  }

  const body = await safeJson(res)

  if (!res.ok) {
    // Prefer the server's JSON error; otherwise craft a clean message. A 413
    // (or a non-JSON body, which almost always means the file was too large to
    // reach the server) gets a size-specific hint instead of a parse error.
    if (body?.error) throw new Error(body.error)
    if (res.status === 413 || body === null) {
      throw new Error("The image is too large to upload. Please use a smaller file (or compress it) and try again.")
    }
    throw new Error(`Upload failed (HTTP ${res.status}). Please try again.`)
  }

  if (!body?.url) {
    throw new Error("Upload failed — the server did not return an image URL. Please try again.")
  }

  return body.url
}
