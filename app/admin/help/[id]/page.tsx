export const dynamic = "force-dynamic"

import { dbGetHelpArticle } from "@/lib/db/queries"
import { HelpEditForm } from "./help-edit-form"
import { notFound } from "next/navigation"
import { requireAdminSession } from "@/lib/auth-server"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"

export default async function AdminHelpEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ audience?: string }>
}) {
  const { id } = await params
  const { audience } = await searchParams
  const defaultAudience = audience === "admin" ? "admin" : "public"
  const session = await requireAdminSession()
  // "Select from Files" is only offered to users who can access the media
  // library; everyone else gets upload-only.
  const canUseFiles =
    session.role === FULL_ACCESS_ROLE ||
    (Array.isArray(session.permissions) && session.permissions.includes("files"))

  if (id === "new") {
    return <div className="p-6 lg:p-10"><HelpEditForm article={null} canUseFiles={canUseFiles} defaultAudience={defaultAudience} /></div>
  }
  const article = await dbGetHelpArticle(id)
  if (!article) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <div className="p-6 lg:p-10"><HelpEditForm article={article as any} canUseFiles={canUseFiles} /></div>
}
