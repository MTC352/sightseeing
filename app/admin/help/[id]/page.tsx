import { dbGetHelpArticle } from "@/lib/db/queries"
import { HelpEditForm } from "./help-edit-form"
import { notFound } from "next/navigation"

export default async function AdminHelpEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (id === "new") return <div className="p-6 lg:p-10"><HelpEditForm article={null} /></div>
  const article = await dbGetHelpArticle(id)
  if (!article) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <div className="p-6 lg:p-10"><HelpEditForm article={article as any} /></div>
}
