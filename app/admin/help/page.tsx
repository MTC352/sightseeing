import Link from "next/link"
import { dbListHelpArticles } from "@/lib/db/queries"
import { Plus, Pencil, HelpCircle } from "lucide-react"
import { HelpArticleDeleteButton } from "./help-delete-button"

type HelpArticle = {
  id: string; question: string; answer: string; category: string;
  status: string; order: number;
}

export default async function AdminHelpPage() {
  const articles = await dbListHelpArticles() as HelpArticle[]

  const byCategory: Record<string, HelpArticle[]> = {}
  for (const a of articles) {
    if (!byCategory[a.category]) byCategory[a.category] = []
    byCategory[a.category].push(a)
  }

  const published = articles.filter((a) => a.status === "published").length
  const drafts = articles.filter((a) => a.status === "draft").length
  const categories = Object.keys(byCategory).sort()

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Knowledge Base</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Help & FAQ</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {articles.length} articles · {published} published · {drafts} drafts · {categories.length} categories
          </p>
        </div>
        <Link
          href="/admin/help/new"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New Article
        </Link>
      </div>

      {articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <HelpCircle className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No help articles yet</p>
          <Link href="/admin/help/new" className="mt-3 text-sm font-medium text-primary hover:underline">
            Create your first article
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <div key={cat} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat}</span>
                <span className="text-xs text-muted-foreground/60">{byCategory[cat].length} articles</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {byCategory[cat].map((article) => (
                    <tr key={article.id} className="group transition-colors hover:bg-secondary/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{article.question}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{article.answer}</p>
                      </td>
                      <td className="hidden w-24 px-4 py-3 text-muted-foreground md:table-cell">
                        <span className="text-xs">Order {article.order}</span>
                      </td>
                      <td className="w-28 px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          article.status === "published"
                            ? "bg-emerald-500/15 text-emerald-600"
                            : "bg-amber-500/15 text-amber-600"
                        }`}>
                          {article.status}
                        </span>
                      </td>
                      <td className="w-20 px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/admin/help/${article.id}`}
                            className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                          <HelpArticleDeleteButton articleId={article.id} question={article.question} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
