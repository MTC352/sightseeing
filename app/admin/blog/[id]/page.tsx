export const dynamic = "force-dynamic"

import { dbGetPost } from "@/lib/db/queries"
import { notFound, redirect } from "next/navigation"
import { PostEditForm } from "./post-edit-form"
import { requirePermission } from "@/lib/auth-server"

export default async function PostEditPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("blog")
  } catch {
    redirect("/admin/login")
  }

  const { id } = await params
  const post = id === "new" ? null : await dbGetPost(id)
  if (id !== "new" && !post) notFound()

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Blog</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{post ? "Edit Post" : "New Post"}</h1>
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <PostEditForm post={post as any} />
    </div>
  )
}
