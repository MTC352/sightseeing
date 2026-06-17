export const dynamic = "force-dynamic"

import { dbGetHelpArticle } from "@/lib/db/queries"
import { HelpEditForm } from "./help-edit-form"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth-server"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"
import { redirect } from "next/navigation"

export default async function AdminHelpEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ audience?: string }>
}) {
  // requirePermission throws on auth failure; redirect() throws a NEXT_REDIRECT
  // so control never reaches the code below if it fires. The `!` assertion
  // avoids a TypeScript "used before assigned" error since TS can't infer that
  // redirect() is a "never" function.
  // eslint-disable-next-line prefer-const
  let session!: Awaited<ReturnType<typeof requirePermission>>
  try {
    session = await requirePermission("help")
  } catch {
    redirect("/admin/login")
  }

  const { id } = await params
  const { audience } = await searchParams
  const defaultAudience = audience === "admin" ? "admin" : "public"
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
