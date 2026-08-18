export const dynamic = "force-dynamic"

import { dbGetRedirect, dbListPosts } from "@/lib/db/queries"
import { notFound, redirect } from "next/navigation"
import { RedirectEditForm } from "./redirect-edit-form"
import { requirePermission } from "@/lib/auth-server"

type PostOption = { id: string; title: string; slug: string; status: string }

export default async function RedirectEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ source?: string }>
}) {
  try {
    await requirePermission("blog")
  } catch {
    redirect("/admin/login")
  }

  const { id } = await params
  const { source } = await searchParams
  const rec = id === "new" ? null : await dbGetRedirect(id)
  if (id !== "new" && !rec) notFound()

  const posts = (await dbListPosts()) as PostOption[]
  // Published posts are valid targets first, then drafts (labeled) as a fallback.
  const options = [...posts].sort((a, b) => {
    const rank = (s: string) => (s === "published" ? 0 : 1)
    return rank(a.status) - rank(b.status) || a.title.localeCompare(b.title)
  })

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Blog Redirects</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{rec ? "Edit Redirect" : "New Redirect"}</h1>
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RedirectEditForm redirect={rec as any} posts={options} initialSource={source ?? ""} />
    </div>
  )
}
