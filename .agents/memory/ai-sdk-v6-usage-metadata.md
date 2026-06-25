---
name: AI SDK v6 token-usage plumbing
description: How token usage reaches the client in AI SDK v6 (the old sendUsage/onFinish.usage shortcuts were removed).
---

# AI SDK v6 — token usage travels as MESSAGE METADATA

This repo is on `ai@6` + `@ai-sdk/react@3`. v6 removed both old usage shortcuts:
- `toUIMessageStreamResponse({ sendUsage: true })` — `sendUsage` no longer exists.
- `useChat({ onFinish({ usage }) })` — the client `onFinish` no longer receives `usage`.

**The v6 way:** attach usage as message metadata server-side, read it from the
finished message client-side.
- Server: `toUIMessageStreamResponse({ messageMetadata: ({ part }) => part.type === "finish" ? { usage: {...part.totalUsage} } : undefined })`. `part.totalUsage` uses `inputTokens`/`outputTokens`/`totalTokens` (RENAMED from v4's `promptTokens`/`completionTokens`).
- Type it via the message metadata generic: `UIMessage<METADATA, DATA, TOOLS>` (first generic; was `never`). Export the metadata type for the client.
- Client: read `message.metadata.usage` in `onFinish({ message })`. Plain pass-through needs no `messageMetadataSchema`.

**Why:** this broke silently — it surfaced only as long-standing tsc errors, never a
runtime crash, so the planner Dev Info token panel just went blank.
**How to apply:** any AI route needing usage/cost on the client must use this metadata
path; don't re-add `sendUsage` or destructure `usage` from `onFinish`.
