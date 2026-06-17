import { dbGetSettings } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import {
  generateAndSaveBlogCover,
  loadBlogImageConfig,
  defaultSubjectPrompt,
} from "@/lib/blog-image"
import { logError, logCaughtError, requestMeta } from "@/lib/error-log"

export const maxDuration = 120

/**
 * Standalone cover-image (re)generation for the blog editor.
 *
 * Lets an admin regenerate ONLY the cover image — using the same admin-selected
 * OpenAI image model + Image Style Prompt as the full article generator — without
 * re-writing the whole post. The subject is derived from an explicit imagePrompt
 * if supplied, otherwise from the post title/topic.
 *
 * Returns the PERSISTED image URL (OpenAI-hosted URLs expire within ~1h).
 */
export async function POST(req: Request) {
  const reqMeta = requestMeta(req)

  let session
  try {
    session = await requirePermission("blog")
  } catch (authErr: unknown) {
    if ((authErr as { status?: number })?.status === 403) return Response.json({ error: "Forbidden" }, { status: 403 })
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let title: string | undefined
  let topic: string | undefined
  let imagePrompt: string | undefined
  try {
    const body = (await req.json()) as {
      title?: string
      topic?: string
      imagePrompt?: string
    }
    title = body?.title
    topic = body?.topic
    imagePrompt = body?.imagePrompt
  } catch (err) {
    void logCaughtError("ai:blog", err, { ...reqMeta, phase: "image-parse-body" })
    return Response.json({ error: "Invalid request body" }, { status: 400 })
  }

  const subjectSource = (imagePrompt || title || topic || "").trim()
  if (!subjectSource) {
    return Response.json(
      { error: "Provide a title, topic, or image prompt to generate a cover image." },
      { status: 400 },
    )
  }

  try {
    const settings = await dbGetSettings()
    const { imageModel, imageStyle, openaiKey } = loadBlogImageConfig(settings)

    if (!openaiKey) {
      void logError({
        source: "ai:blog",
        level: "error",
        message: "Cover image regeneration blocked: no OpenAI API key configured.",
        statusCode: 503,
        context: { ...reqMeta, phase: "image-resolveKey" },
      })
      return Response.json(
        {
          error:
            "Image generation is not configured. Add your OpenAI API key in Admin → Integrations.",
        },
        { status: 503 },
      )
    }

    // An explicit prompt is used verbatim as the subject; otherwise derive a
    // sensible Luxembourg-tourism subject from the title/topic.
    const subject = imagePrompt?.trim()
      ? imagePrompt.trim()
      : defaultSubjectPrompt(title || topic || subjectSource)

    const img = await generateAndSaveBlogCover({
      openaiKey,
      imageModel,
      imageStyle,
      subject,
      title: title || topic || "Blog cover",
      userId: session.id,
    })

    if (!img.ok) {
      void logError({
        source: "ai:blog",
        level: "warn",
        message: `Cover image regeneration failed: ${img.error}`,
        statusCode: img.status,
        context: { ...reqMeta, phase: "image-generate", detail: img.detail },
      })
      return Response.json(
        { error: `Image generation failed (${img.error}).` },
        { status: img.status >= 400 ? img.status : 502 },
      )
    }

    return Response.json({ url: img.url })
  } catch (err) {
    void logCaughtError("ai:blog", err, { ...reqMeta, phase: "image-regenerate" })
    return Response.json({ error: "Image generation failed." }, { status: 500 })
  }
}
