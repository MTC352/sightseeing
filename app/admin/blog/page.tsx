import Link from "next/link"
import { listPosts } from "@/lib/admin-store"
import { Plus, Pencil, ExternalLink, FileText } from "lucide-react"
import { PostDeleteButton } from "./post-delete-button"

export default function AdminBlogPage() {
  const posts = listPosts()
  const published = posts.filter((p) => p.status === "published").length
  const drafts = posts.filter((p) => p.status === "draft").length

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Content</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Blog</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{published} published · {drafts} drafts</p>
        </div>
        <Link
          href="/admin/blog/new"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New Post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No blog posts yet</p>
          <Link href="/admin/blog/new" className="mt-3 text-sm font-medium text-primary hover:underline">Create your first post</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Title</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 sm:table-cell">Category</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 md:table-cell">Author</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 lg:table-cell">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {posts.map((post) => (
                <tr key={post.id} className="group transition-colors hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <p className="truncate font-medium text-foreground max-w-[260px]">{post.title}</p>
                    <p className="text-xs text-muted-foreground">{post.slug}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{post.category}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{post.author}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{post.publishedAt}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      post.status === "published" ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
                    }`}>
                      {post.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/blog/${post.slug}`} target="_blank"
                        className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground" title="View on site">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                      <Link href={`/admin/blog/${post.id}`}
                        className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <PostDeleteButton postId={post.id} postTitle={post.title} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
