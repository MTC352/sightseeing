---
name: Admin AI Assistant empty-body 500
description: SSE chat routes must guard req.json() + empty messages or cold-start/aborted requests 500 and break the chat UI.
---
The admin docs assistant (/admin/docs → POST /api/admin/admin-help-chat) appeared
to "not answer". Root cause: unguarded `await req.json()` threw "Unexpected end of
JSON input" on an empty/aborted/cold-start POST body → 500 → SSE chat shows nothing.
A real body streams correct doc-grounded answers (KB loads fine).

**Rule:** every SSE chat route must (1) wrap `req.json()` in try/catch and (2) bail
when the messages array is empty — returning a graceful **in-band SSE error**
(status 200, `text/event-stream`, `{type:start}{type:error,errorText}{[DONE]}`),
never a non-200 JSON body (which the useChat client renders as a hard failure).

**Why:** Next dev cold compile / aborted requests / client retries can deliver an
empty POST body; a 500 there looks like "the assistant is broken".

**How to apply:** reuse the same SSE error shape the route already uses for the
"AI not configured" branch. The blog route logs this as phase 'parse-body'.
