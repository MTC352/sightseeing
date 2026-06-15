---
name: Blog cover image (OpenAI Images)
description: Why blog cover-image generation fails 400 and the model-support gotcha
---

# Blog cover image generation (OpenAI Images API)

Cover images for the admin AI Blog generator go through `lib/blog-image.ts`
(`generateAndSaveBlogCover`/`loadBlogImageConfig`), shared by the streaming
generator (`/api/admin/generate-blog`) and the standalone regenerate endpoint
(`/api/admin/generate-blog-image`).

## Rule: never send `response_format` to the Images API
**Why:** OpenAI's current `images/generations` API rejects `response_format`
("Unknown parameter: 'response_format'", HTTP 400) — this broke every cover
image. Instead, accept whatever the model returns and normalize: gpt-image-1
returns inline `b64_json`; dall-e returns a short-lived `url` (download it).
Both paths must stay handled.

## Rule: model availability is account-scoped
**Why:** The connected OpenAI key may only support a subset of image models.
On this project's key, ONLY `gpt-image-1` works — `dall-e-2` and `dall-e-3`
both return `"The model 'X' does not exist"` (HTTP 400, code invalid_value).
The admin-selected model lives in `ai_system_configs` (system_key='blog')
`extra_config.imageModel`; keep it pinned to a supported model (gpt-image-1).
There is no capability auto-detection — a bad model choice surfaces as an
opaque OpenAI 400 in error_logs (source 'ai:blog', phase 'image-generate').
