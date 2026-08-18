"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Save, ArrowLeft } from "lucide-react"
import Link from "next/link"

type PostOption = { id: string; title: string; slug: string; status: string }
type RedirectRecord = {
  id: string; sourcePath: string; postId: string; statusCode: number; enabled: boolean
} | null

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
const labelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"

export function RedirectEditForm({
  redirect,
  posts,
  initialSource,
}: {
  redirect: RedirectRecord
  posts: PostOption[]
  initialSource: string
}) {
  const router = useRouter()
  const [sourcePath, setSourcePath] = useState(redirect?.sourcePath ?? initialSource ?? "")
  const [postId, setPostId] = useState(redirect?.postId ?? "")
  const [statusCode, setStatusCode] = useState(redirect?.statusCode ?? 301)
  const [enabled, setEnabled] = useState(redirect?.enabled ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    if (!sourcePath.trim()) return setError("Old path is required")
    if (!postId) return setError("Pick the blog post this URL should point to")

    setSaving(true)
    const method = redirect ? "PATCH" : "POST"
    const url = redirect ? `/api/admin/blog-redirects/${redirect.id}` : "/api/admin/blog-redirects"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourcePath, postId, statusCode: Number(statusCode), enabled }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return setError(body?.error ?? "Failed to save redirect")
    }
    router.push("/admin/blog-redirects")
    router.refresh()
  }

  const selectedPost = posts.find((p) => p.id === postId)

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/blog-redirects"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to redirects
      </Link>

      <div className="space-y-5 rounded-xl border border-border bg-card p-6">
        <div>
          <label className={labelClass}>Old path</label>
          <input
            className={inputClass}
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            placeholder="/old-blog-title"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            The full old URL path (e.g. <span className="font-mono">/my-old-post</span>). A domain, query
            string, casing, or trailing slash are normalized automatically.
          </p>
        </div>

        <div>
          <label className={labelClass}>Target blog post</label>
          <select className={inputClass} value={postId} onChange={(e) => setPostId(e.target.value)}>
            <option value="">— Select a post —</option>
            {posts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.status !== "published" ? ` (${p.status})` : ""}
              </option>
            ))}
          </select>
          {selectedPost && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Redirects to <span className="font-mono">/blog/{selectedPost.slug}</span>
              {selectedPost.status !== "published" && (
                <span className="text-amber-600"> — this post isn&apos;t published yet, so the target will 404 until it is.</span>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className={labelClass}>Redirect type</label>
            <select
              className={inputClass}
              value={statusCode}
              onChange={(e) => setStatusCode(Number(e.target.value))}
            >
              <option value={301}>301 — Permanent (recommended)</option>
              <option value={302}>302 — Temporary</option>
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm text-foreground">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : redirect ? "Save changes" : "Create redirect"}
          </button>
        </div>
      </div>
    </div>
  )
}
