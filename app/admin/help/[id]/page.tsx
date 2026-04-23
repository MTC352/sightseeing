import { getHelpArticle } from "@/lib/admin-store"
import { HelpEditForm } from "./help-edit-form"
import { notFound } from "next/navigation"

export default async function AdminHelpEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (id === "new") return <div className="p-6 lg:p-10"><HelpEditForm article={null} /></div>
  const article = getHelpArticle(id)
  if (!article) notFound()
  return <div className="p-6 lg:p-10"><HelpEditForm article={article} /></div>
}
