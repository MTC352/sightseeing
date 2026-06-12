import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { Clock, User, ArrowLeft, Calendar, Eye } from "lucide-react"
import { dbGetPostBySlugAny } from "@/lib/db/queries"
import { getSession } from "@/lib/auth"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

interface Props {
  params: Promise<{ slug: string }>
}

type PostRow = {
  id: string
  title: string
  slug: string
  excerpt: string
  body: string
  image: string | null
  author: string
  publishedAt: string | null
  category: string
  readTime: string | null
  tags: string[] | null
  status: string
  seoTitle?: string | null
  seoDescription?: string | null
  created_at?: string | Date | null
  updated_at?: string | Date | null
}

/**
 * A post is publicly live only when it is published AND its scheduled publish
 * time has been reached. Mirrors the SQL gate in lib/db/queries.ts. Drafts and
 * future-scheduled posts are not live (only an authenticated admin may preview).
 */
function isPostLive(post: PostRow): boolean {
  if (post.status !== "published") return false
  if (!post.publishedAt) return true
  return new Date(post.publishedAt).getTime() <= Date.now()
}

function ogImageFor(post: PostRow) {
  const params = new URLSearchParams({
    eyebrow: post.category || "Blog",
    title: post.title,
    subtitle: (post.excerpt || "").slice(0, 140),
  })
  return `${BASE}/api/og?${params.toString()}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = (await dbGetPostBySlugAny(slug)) as PostRow | null

  // Hide non-live posts from anyone without an admin session — return the same
  // generic "not found" metadata a public visitor would see for a missing post.
  if (!post) return { title: "Post Not Found | sightseeing.lu" }
  if (!isPostLive(post)) {
    const isAdmin = !!(await getSession())
    if (!isAdmin) return { title: "Post Not Found | sightseeing.lu" }
    // Admin preview: never let drafts/scheduled posts be indexed.
    return {
      title: `[Preview] ${post.title} | sightseeing.lu`,
      robots: { index: false, follow: false },
    }
  }

  const title = post.seoTitle || `${post.title} | sightseeing.lu`
  const description = post.seoDescription || post.excerpt
  const ogImage = ogImageFor(post)
  const canonical = `${BASE}/blog/${post.slug}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: canonical,
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updated_at ? new Date(post.updated_at).toISOString() : undefined,
      authors: post.author ? [post.author] : undefined,
      tags: post.tags ?? undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: [ogImage],
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = (await dbGetPostBySlugAny(slug)) as PostRow | null

  if (!post) notFound()

  // Gate: drafts and future-scheduled posts are hidden from the public. Only a
  // logged-in admin may preview them via the direct URL.
  const live = isPostLive(post)
  const isAdmin = live ? false : !!(await getSession())
  if (!live && !isAdmin) notFound()

  const scheduled = post.status === "published" && !live
  const previewLabel = scheduled
    ? `Scheduled — goes live ${post.publishedAt ? new Date(post.publishedAt).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "soon"}`
    : "Draft — not visible to the public"

  const renderBody = (body: string) => {
    const lines = body.split("\n")
    return lines.map((line, i) => {
      if (line.startsWith("## ")) return <h2 key={i} className="mt-8 mb-4 text-xl font-bold text-foreground">{line.replace("## ", "")}</h2>
      if (line.startsWith("### ")) return <h3 key={i} className="mt-6 mb-3 text-lg font-semibold text-foreground">{line.replace("### ", "")}</h3>
      if (line.startsWith("- ")) return <li key={i} className="ml-4 text-muted-foreground">{line.replace("- ", "")}</li>
      if (line.trim() === "") return <br key={i} />
      return <p key={i} className="mb-4 leading-relaxed text-muted-foreground">{line}</p>
    })
  }

  const canonical = `${BASE}/blog/${post.slug}`
  const datePublished = post.publishedAt ?? (post.created_at ? new Date(post.created_at).toISOString() : null)
  const dateModified = post.updated_at ? new Date(post.updated_at).toISOString() : datePublished
  const imageUrl = post.image
    ? post.image.startsWith("/") ? `${BASE}${post.image}` : post.image
    : `${BASE}/images/hero-luxembourg.jpg`
  const ogImage = ogImageFor(post)

  // Article + BreadcrumbList JSON-LD. Author is modelled as a Person; if you
  // later add real author profiles in the admin, swap to a stable @id linking
  // to a Person page.
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: [ogImage, imageUrl],
    datePublished: datePublished ?? undefined,
    dateModified: dateModified ?? undefined,
    author: {
      "@type": "Person",
      name: post.author || "sightseeing.lu Editorial",
    },
    publisher: {
      "@type": "Organization",
      name: "sightseeing.lu",
      logo: { "@type": "ImageObject", url: `${BASE}/icon.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    articleSection: post.category,
    keywords: (post.tags ?? []).join(", "),
    inLanguage: "en",
    url: canonical,
  }

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${BASE}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonical },
    ],
  }

  const safeJsonLd = JSON.stringify([articleLd, breadcrumbLd])
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")

  return (
    <div className="min-h-screen bg-background">
      {live && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd }} />}
      <Navbar />

      {!live && isAdmin && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-amber-950 shadow-md">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          <span>Admin preview · {previewLabel}</span>
        </div>
      )}

      <section className="relative">
        <div className="absolute inset-0 h-72 lg:h-96">
          <Image
            src={post.image || "/images/hero-luxembourg.jpg"}
            alt={`${post.title} — ${post.category} article on sightseeing.lu`}
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-background" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 pb-10 pt-32 lg:pt-44 lg:pb-14">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to blog
          </Link>
          <span className="mt-4 inline-block rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            {post.category}
          </span>
          <h1 className="mt-3 text-2xl font-bold text-white lg:text-4xl leading-tight">{post.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-white/80">
            <span className="flex items-center gap-1.5"><User className="h-4 w-4" />{post.author}</span>
            {post.publishedAt && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <time dateTime={post.publishedAt}>
                  {new Date(post.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </time>
              </span>
            )}
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{post.readTime || "5 min read"}</span>
          </div>
        </div>
      </section>

      <article className="mx-auto max-w-3xl px-4 py-10 lg:py-14">
        <p className="mb-6 text-lg leading-relaxed text-foreground font-medium">{post.excerpt}</p>
        <div className="prose prose-neutral max-w-none">{renderBody(post.body)}</div>

        {post.tags && post.tags.length > 0 && (
          <div className="mt-10 border-t border-border pt-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Tags</p>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{tag}</span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
          <h3 className="text-lg font-bold text-foreground">Ready to explore Luxembourg?</h3>
          <p className="mt-2 text-sm text-muted-foreground">Discover guided tours, local experiences, and hidden gems.</p>
          <Link href="/explore" className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            Browse Experiences
          </Link>
        </div>
      </article>

      <SiteFooter />
    </div>
  )
}
