import { processUploadFile } from "@/lib/media-upload"

/**
 * Shared OpenAI cover-image generation + persistence for the blog tools.
 *
 * Used by BOTH the streaming article generator (app/api/admin/generate-blog)
 * and the standalone "regenerate cover image" endpoint
 * (app/api/admin/generate-blog-image) so the two paths never drift.
 *
 * Key correctness note: we do NOT send `response_format`. OpenAI's current
 * images/generations API rejects it for these models ("Unknown parameter:
 * 'response_format'") which previously caused every cover image to fail with a
 * 400. Instead we accept whatever the model returns — DALL·E models return a
 * (short-lived) `url`, gpt-image-1 returns inline `b64_json` — and normalize
 * both into bytes before persisting through the media pipeline.
 */

const ALLOWED_IMAGE_MODELS = ["dall-e-3", "dall-e-2", "gpt-image-1"] as const

/** Clamp an admin-configured image model to a supported value (default dall-e-3). */
export function resolveImageModel(requested: string | undefined): string {
  const r = typeof requested === "string" ? requested.trim() : ""
  return (ALLOWED_IMAGE_MODELS as readonly string[]).includes(r) ? r : "dall-e-3"
}

/** Default house style appended when the admin hasn't set an Image Style Prompt. */
export const DEFAULT_IMAGE_STYLE =
  "Professional travel photography, photorealistic, vibrant natural colors, soft natural lighting, sharp focus, high detail, no text, no watermark, no logos."

/** Build a sensible subject prompt from a title/topic when the article didn't supply one. */
export function defaultSubjectPrompt(titleOrTopic: string): string {
  return `Professional travel photography for a Luxembourg tourism blog post titled "${titleOrTopic}". Scenic, inviting, high-quality photorealistic image with golden-hour lighting and a welcoming atmosphere. Show a real Luxembourg landmark or landscape relevant to the topic.`
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Pull the blog cover-image config + OpenAI key out of the merged settings object. */
export function loadBlogImageConfig(settings: any): {
  imageModel: string
  imageStyle: string
  openaiKey: string
} {
  const blogCfg = (settings?.ai as Record<string, Record<string, unknown>>)?.blog ?? {}
  const blogExtra = (blogCfg.extra && typeof blogCfg.extra === "object" ? blogCfg.extra : {}) as Record<string, unknown>
  const imageModel = resolveImageModel(typeof blogExtra.imageModel === "string" ? blogExtra.imageModel : "")
  const rawStyle = typeof blogExtra.imagePrompt === "string" ? blogExtra.imagePrompt.trim() : ""
  const imageStyle = rawStyle || DEFAULT_IMAGE_STYLE
  const apiKeys = (settings as any)?.apiKeys as Record<string, string> | undefined
  // env var takes priority over the integrations table. Image generation stays
  // on OpenAI regardless of the active text provider — never routed via resolveAi.
  const openaiKey = process.env.OPENAI_API_KEY || apiKeys?.openai || ""
  return { imageModel, imageStyle, openaiKey }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type BlogCoverResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string; detail?: string }

/**
 * Generate a cover image via OpenAI and persist it through the media pipeline,
 * returning a permanent URL. Fail-soft: returns a structured error instead of
 * throwing for HTTP/parse failures (the caller decides how loud to be).
 */
export async function generateAndSaveBlogCover(opts: {
  openaiKey: string
  imageModel: string
  imageStyle: string
  /** The subject matter (article IMAGE_PROMPT or a derived default). */
  subject: string
  title: string
  userId: string
}): Promise<BlogCoverResult> {
  const { openaiKey, imageModel, imageStyle, subject, title, userId } = opts

  if (!openaiKey) {
    return { ok: false, status: 503, error: "no OpenAI API key configured" }
  }

  const fullPrompt = imageStyle ? `${subject}\n\nStyle: ${imageStyle}` : subject
  // DALL·E 2 caps prompts at 1000 chars; DALL·E 3 / gpt-image-1 allow up to 4000.
  const promptCap = imageModel === "dall-e-2" ? 1000 : 4000

  const reqBody: Record<string, unknown> = {
    model: imageModel,
    prompt: fullPrompt.slice(0, promptCap),
    n: 1,
    size: "1024x1024",
  }

  const imgRes = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify(reqBody),
  })

  if (!imgRes.ok) {
    const detail = await imgRes.text().catch(() => "")
    return {
      ok: false,
      status: imgRes.status,
      error: `OpenAI ${imgRes.status}`,
      detail: detail.slice(0, 500),
    }
  }

  const imgData = await imgRes.json()
  const b64 = imgData?.data?.[0]?.b64_json as string | undefined
  const remoteUrl = imgData?.data?.[0]?.url as string | undefined

  let bytes: Buffer | null = null
  if (b64) {
    bytes = Buffer.from(b64, "base64")
  } else if (remoteUrl) {
    const dl = await fetch(remoteUrl)
    if (dl.ok) bytes = Buffer.from(await dl.arrayBuffer())
  }
  if (!bytes) {
    return { ok: false, status: 502, error: "no image data returned" }
  }

  const file = new File([bytes], `blog-cover-${Date.now()}.png`, { type: "image/png" })
  const result = await processUploadFile(file, userId, {
    restrictImage: true,
    title: title || "Blog cover",
  })
  const savedUrl = (result.body as { url?: string })?.url
  if (result.status >= 400 || !savedUrl) {
    const errMsg = (result.body as { error?: string })?.error || "could not save image"
    return { ok: false, status: result.status || 500, error: errMsg }
  }

  return { ok: true, url: savedUrl }
}
