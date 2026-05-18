import { streamText } from "ai"
import { dbGetSettings } from "@/lib/db/queries"

export const maxDuration = 120

const DEFAULT_SYSTEM_PROMPT = `You are an expert SEO and AEO (Answer Engine Optimization) content writer for a Luxembourg tourism website called "Sightseeing Luxembourg".

Generate a high-quality, engaging blog post with SEO best practices: compelling keyword-rich title, structured H2/H3 headings, natural keyword placement, 1200-1800 words, strong CTA.

AEO: Direct answers to likely questions, FAQ section (3-5 Q&As), structured lists, conversational language.

OUTPUT FORMAT — metadata block first, then full Markdown:
---
TITLE: [suggested title]
SLUG: [url-friendly-slug]
EXCERPT: [2-3 sentence excerpt]
READ_TIME: [X min read]
IMAGE_PROMPT: [detailed DALL-E cover image prompt, photorealistic Luxembourg travel photography style]
---

Then the full Markdown article.`

function sse(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

export async function POST(req: Request) {
  const { topic, category } = await req.json()

  if (!topic?.trim()) {
    return Response.json({ error: "Topic is required" }, { status: 400 })
  }

  // Load blog system config from DB
  const settings = await dbGetSettings()
  const blogCfg = (settings.ai as Record<string, Record<string, unknown>>)?.blog ?? {}
  const systemPrompt = (blogCfg.systemPrompt as string)?.trim() || DEFAULT_SYSTEM_PROMPT
  // Default to Anthropic — AI Gateway works out-of-the-box for Anthropic in this environment.
  // Admins can override to openai/* models once AI_GATEWAY_API_KEY is configured.
  const model = (blogCfg.model as string) || "anthropic/claude-opus-4.6"
  const temperature = typeof blogCfg.temperature === "number" ? blogCfg.temperature : 0.75
  const maxOutputTokens = typeof blogCfg.maxTokens === "number" ? blogCfg.maxTokens : 4000

  // OpenAI key for DALL-E (env var takes priority over integrations table)
  const openaiKey =
    process.env.OPENAI_API_KEY ||
    (settings.apiKeys as Record<string, string>)?.openai ||
    ""

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => controller.enqueue(sse(data))

      try {
        // ── Step 1: init ─────────────────────────────────────────────────
        emit({ type: "milestone", id: "init",    label: "Initializing content structure", status: "done" })
        emit({ type: "milestone", id: "writing", label: "Writing SEO-optimized article…",  status: "active" })

        // ── Step 2: stream article text ───────────────────────────────────
        const userPrompt = `Write a comprehensive, SEO and AEO optimized blog post about: "${topic}"${category ? ` (category: ${category})` : ""}\n\nFocus on Luxembourg tourism. Follow the output format exactly — metadata block first, then Markdown article.`

        const result = streamText({
          model,
          system: systemPrompt,
          prompt: userPrompt,
          temperature,
          maxOutputTokens,
        })

        let fullContent = ""
        for await (const chunk of result.textStream) {
          fullContent += chunk
          emit({ type: "chunk", text: chunk })
        }

        // ── Parse metadata block ──────────────────────────────────────────
        const metaMatch = fullContent.match(/---\n([\s\S]*?)\n---/)
        const meta = {
          title:       "",
          slug:        "",
          excerpt:     "",
          readTime:    "5 min read",
          imagePrompt: "",
        }
        if (metaMatch) {
          const blk = metaMatch[1]
          meta.title       = blk.match(/TITLE:\s*(.+)/)?.[1]?.trim()        ?? ""
          meta.slug        = blk.match(/SLUG:\s*(.+)/)?.[1]?.trim()         ?? ""
          meta.excerpt     = blk.match(/EXCERPT:\s*(.+)/)?.[1]?.trim()      ?? ""
          meta.readTime    = blk.match(/READ_TIME:\s*(.+)/)?.[1]?.trim()    ?? "5 min read"
          meta.imagePrompt = blk.match(/IMAGE_PROMPT:\s*(.+)/)?.[1]?.trim() ?? ""
        }

        emit({ type: "milestone", id: "writing", label: "Article written",               status: "done" })
        emit({ type: "milestone", id: "seo",     label: "SEO & AEO optimization applied", status: "done" })

        // ── Step 3: generate cover image (DALL-E 2) ───────────────────────
        emit({ type: "milestone", id: "image", label: "Generating cover image with DALL-E 2…", status: "active" })

        if (openaiKey) {
          try {
            const imagePrompt =
              meta.imagePrompt ||
              `Professional travel photography for a Luxembourg tourism blog post: "${meta.title || topic}". Vibrant, scenic, high-quality photorealistic image, golden hour lighting, welcoming atmosphere.`

            const imgRes = await fetch("https://api.openai.com/v1/images/generations", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${openaiKey}`,
              },
              body: JSON.stringify({
                model:  "dall-e-2",
                prompt: imagePrompt.slice(0, 1000), // DALL-E 2 max prompt
                n:      1,
                size:   "1024x1024",
              }),
            })

            if (imgRes.ok) {
              const imgData = await imgRes.json()
              const url = imgData.data?.[0]?.url as string | undefined
              if (url) {
                emit({ type: "image", url })
                emit({ type: "milestone", id: "image", label: "Cover image generated", status: "done" })
              } else {
                emit({ type: "milestone", id: "image", label: "Cover image skipped (no URL returned)", status: "done" })
              }
            } else {
              const errText = await imgRes.text().catch(() => "")
              console.error("[generate-blog] DALL-E error:", imgRes.status, errText)
              emit({ type: "milestone", id: "image", label: `Cover image skipped (${imgRes.status})`, status: "done" })
            }
          } catch (imgErr) {
            console.error("[generate-blog] DALL-E fetch error:", imgErr)
            emit({ type: "milestone", id: "image", label: "Cover image skipped (network error)", status: "done" })
          }
        } else {
          emit({ type: "milestone", id: "image", label: "Cover image skipped — add OpenAI API key in Integrations", status: "done" })
        }

        // ── Step 4: finalize ──────────────────────────────────────────────
        emit({ type: "meta",      title: meta.title, slug: meta.slug, excerpt: meta.excerpt, readTime: meta.readTime })
        emit({ type: "milestone", id: "ready", label: "Content ready!", status: "done" })
        emit({ type: "done" })

      } catch (err) {
        console.error("[generate-blog] error:", err)
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      Connection:      "keep-alive",
    },
  })
}
