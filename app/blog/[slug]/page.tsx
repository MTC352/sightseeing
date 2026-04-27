import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { Clock, User, ArrowLeft, Calendar } from "lucide-react"
import { dbGetPostBySlug } from "@/lib/db/queries"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await dbGetPostBySlug(slug) as { title?: string; excerpt?: string } | null
  if (!post) return { title: "Post Not Found | sightseeing.lu" }
  return {
    title: `${post.title} | sightseeing.lu`,
    description: post.excerpt,
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = await dbGetPostBySlug(slug) as {
    id: string; title: string; slug: string; excerpt: string; body: string;
    image: string | null; author: string; publishedAt: string | null;
    category: string; readTime: string | null; tags: string[] | null;
    status: string;
  } | null

  if (!post || post.status !== "published") notFound()

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="relative">
        <div className="absolute inset-0 h-72 lg:h-96">
          <Image
            src={post.image || "/images/hero-luxembourg.jpg"}
            alt={post.title}
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
                {new Date(post.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
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
