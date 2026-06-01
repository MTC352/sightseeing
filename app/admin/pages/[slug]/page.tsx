import { redirect } from "next/navigation"

const SLUG_TO_URL: Record<string, string> = {
  home:       "/",
  about:      "/about",
  explore:    "/explore",
  search:     "/search",
  planner:    "/planner",
  departures: "/departures",
  blog:       "/blog",
  careers:    "/careers",
  help:       "/help",
  checkout:   "/my-trips",
}

export default async function PageEditorRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const url = SLUG_TO_URL[slug] ?? `/${slug}`
  redirect(`${url}?admin_edit=1`)
}
