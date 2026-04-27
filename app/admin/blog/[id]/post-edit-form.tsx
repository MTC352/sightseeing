"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { AdminPost } from "@/lib/admin-store"
import { Save, ArrowLeft, Sparkles, Loader2, Wand2, Upload, X, AlertCircle } from "lucide-react"

import Link from "next/link"

function toSlug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80)
}

const CATEGORIES = ["Travel Tips", "Food & Drink", "Outdoor & Nature", "Wine & Culture", "Family Travel", "Day Trips", "Photography", "Events"]

export function PostEditForm({ post }: { post: AdminPost | null }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [aiTopic, setAiTopic] = useState("")
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPreview, setAiPreview] = useState("")
  const [uploading, setUploading] = useState(false)

  const [form, setForm] = useState<Partial<AdminPost>>(
    post ?? {
      slug: "",
      title: "",
      excerpt: "",
      body: "",
      image: "",
      author: "",
      category: "Travel Tips",
      tags: [],
      status: "draft",
      publishedAt: new Date().toISOString().slice(0, 10),
      readTime: "5 min read",
    }
  )

  function set<K extends keyof AdminPost>(key: K, value: AdminPost[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleGenerateBlog() {
    if (!aiTopic.trim()) return
    
    setAiLoading(true)
    setAiPreview("")
    
    try {
      const response = await fetch("/api/admin/generate-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: aiTopic, category: form.category }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let fullContent = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        fullContent += chunk
        setAiPreview((prev) => prev + chunk)
      }

      // Parse the metadata block and content
      const metaMatch = fullContent.match(/---\n([\s\S]*?)\n---/)
      if (metaMatch) {
        const metaBlock = metaMatch[1]
        const titleMatch = metaBlock.match(/TITLE:\s*(.+)/)
        const slugMatch = metaBlock.match(/SLUG:\s*(.+)/)
        const excerptMatch = metaBlock.match(/EXCERPT:\s*(.+)/)
        const readTimeMatch = metaBlock.match(/READ_TIME:\s*(.+)/)

        if (titleMatch) set("title", titleMatch[1].trim())
        if (slugMatch) set("slug", slugMatch[1].trim())
        if (excerptMatch) set("excerpt", excerptMatch[1].trim())
        if (readTimeMatch) set("readTime", readTimeMatch[1].trim())

        // Extract the body content (everything after the metadata block)
        const bodyContent = fullContent.replace(/---\n[\s\S]*?\n---\n*/, "").trim()
        set("body", bodyContent)
      } else {
        // If no metadata block, use the whole response as body
        console.log("[v0] No metadata block found, using full content as body")
        set("body", fullContent)
      }
      
      setShowAiPanel(false)
      setAiTopic("")
    } catch (error) {
      console.error("[v0] Generate blog error:", error)
      alert("Failed to generate blog content. Please try again.")
    } finally {
      setAiLoading(false)
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Upload failed")
      }

      const { url } = await res.json()
      set("image", url)
    } catch (error) {
      console.error("Image upload error:", error)
      alert(error instanceof Error ? error.message : "Failed to upload image")
    } finally {
      setUploading(false)
    }
  }

  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    if (!form.title?.trim()) {
      setSaveError("Title is required before saving.")
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const method = post ? "PATCH" : "POST"
      const url = post ? `/api/admin/posts/${post.id}` : `/api/admin/posts`
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveError(body.error ?? `Save failed (${res.status})`)
        return
      }
      const saved = await res.json()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      if (!post) {
        router.push("/admin/blog")
        router.refresh()
      } else {
        // Update slug in form state in case it was normalised server-side
        if (saved.slug) setForm((f) => ({ ...f, slug: saved.slug }))
        router.refresh()
      }
    } catch {
      setSaveError("Network error — please try again.")
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
  const labelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/blog" className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to blog
        </Link>
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </button>
      </div>

      {saveError && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
          <button type="button" onClick={() => setSaveError(null)} className="ml-auto rounded p-0.5 hover:bg-destructive/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* AI Content Generator */}
        <section className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Wand2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">AI Content Generator</h2>
                <p className="text-xs text-muted-foreground">Generate SEO & AEO optimized blog content</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAiPanel(!showAiPanel)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {showAiPanel ? "Hide" : "Show"}
            </button>
          </div>

          {showAiPanel && (
            <div className="space-y-4 pt-2 border-t border-border/50">
              <div className="mt-4">
                <label className={labelClass}>Topic / Subject</label>
                <textarea
                  rows={2}
                  className={inputClass}
                  placeholder="E.g., Best hiking trails in Luxembourg for families with kids"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                />
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Describe the blog topic. The AI will generate a full article with SEO title, slug, excerpt, and optimized content.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerateBlog}
                disabled={aiLoading || !aiTopic.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Blog Content
                  </>
                )}
              </button>

              {aiLoading && aiPreview && (
                <div className="rounded-lg border border-border bg-secondary/30 p-4 max-h-60 overflow-y-auto">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Preview (streaming...)</p>
                  <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">{aiPreview.slice(0, 800)}...</pre>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Meta */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Post Details</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>Title <span className="text-destructive">*</span></label>
              <input
                type="text"
                className={inputClass}
                placeholder="Post title"
                value={form.title ?? ""}
                onChange={(e) => {
                  const title = e.target.value
                  setForm((f) => ({
                    ...f,
                    title,
                    // Auto-generate slug from title only when no slug has been manually set
                    slug: f.slug && f.slug !== toSlug(f.title ?? "") ? f.slug : toSlug(title),
                  }))
                }}
              />
            </div>
            <div>
              <label className={labelClass}>Slug</label>
              <input type="text" className={inputClass} placeholder="my-post-slug" value={form.slug ?? ""} onChange={(e) => set("slug", e.target.value)} />
              <p className="mt-1 text-[10px] text-muted-foreground/60">Auto-generated from title. You can customise it.</p>
            </div>
            <div>
              <label className={labelClass}>Excerpt</label>
              <textarea rows={2} className={inputClass} placeholder="Short description shown in the blog listing" value={form.excerpt ?? ""} onChange={(e) => set("excerpt", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Category</label>
                <select className={inputClass} value={form.category ?? "Travel Tips"} onChange={(e) => set("category", e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Author</label>
                <input type="text" className={inputClass} placeholder="Author name" value={form.author ?? ""} onChange={(e) => set("author", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Published at</label>
                <input type="date" className={inputClass} value={form.publishedAt ?? ""} onChange={(e) => set("publishedAt", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Read time</label>
                <input type="text" className={inputClass} placeholder="5 min read" value={form.readTime ?? ""} onChange={(e) => set("readTime", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Cover Image</label>
              {form.image ? (
                <div className="relative mt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.image} alt="Cover preview" className="h-40 w-full rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => set("image", "")}
                    className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground"
                    aria-label="Remove image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/30 px-6 py-8 transition-colors hover:border-primary/40 hover:bg-secondary/50">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleImageUpload}
                    className="sr-only"
                    disabled={uploading}
                  />
                  {uploading ? (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="mt-2 text-sm text-muted-foreground">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="mt-2 text-sm font-medium text-foreground">Click to upload cover image</span>
                      <span className="mt-1 text-xs text-muted-foreground">JPEG, PNG, WebP or GIF (max 5MB)</span>
                    </>
                  )}
                </label>
              )}
            </div>
          </div>
        </section>

        {/* Body */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Body (Markdown)</h2>
          <textarea
            rows={16}
            className={`${inputClass} font-mono text-xs leading-relaxed`}
            placeholder="Write your article content here. Markdown is supported."
            value={form.body ?? ""}
            onChange={(e) => set("body", e.target.value)}
          />
        </section>

        {/* Status */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Publication</h2>
          <div>
            <label className={labelClass}>Status</label>
            <select className={`${inputClass} max-w-xs`} value={form.status ?? "draft"} onChange={(e) => set("status", e.target.value as "draft" | "published")}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : saved ? "Saved!" : "Save Post"}
        </button>
      </div>
    </div>
  )
}
