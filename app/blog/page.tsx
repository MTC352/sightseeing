import Link from "next/link"
import Image from "next/image"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { Clock, User, ArrowRight } from "lucide-react"
import type { Metadata } from "next"
import { dbListPosts } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Blog | sightseeing.lu",
  description: "Travel tips, local stories, and insider guides for exploring Luxembourg and beyond.",
}

interface BlogPost {
  slug: string
  title: string
  excerpt: string
  image: string
  author: string
  date: string
  category: string
  readTime: string
}

const FALLBACK_POST: BlogPost = {
  slug: "top-10-hidden-gems-luxembourg",
  title: "10 Hidden Gems in Luxembourg You Probably Missed",
  excerpt: "Beyond the Grand Ducal Palace and Casemates, Luxembourg is full of secret spots locals love. Here are our top 10 picks for adventurous explorers.",
  image: "/images/trips/city-train.jpg",
  author: "Sophie Martin",
  date: "March 4, 2026",
  category: "Travel Tips",
  readTime: "6 min read",
}

export default async function BlogPage() {
  const rawPosts = await dbListPosts() as {
    slug: string; title: string; excerpt: string; image: string | null;
    author: string; publishedAt: string | null; category: string; readTime: string | null;
    status: string;
  }[]

  const adminPosts: BlogPost[] = rawPosts
    .filter((p) => p.status === "published")
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      image: p.image || "/images/hero-luxembourg.jpg",
      author: p.author,
      date: p.publishedAt
        ? new Date(p.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : "",
      category: p.category,
      readTime: p.readTime || "5 min read",
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const POSTS: BlogPost[] = adminPosts.length > 0 ? adminPosts : [FALLBACK_POST]
  const [featured, ...rest] = POSTS

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
          <p className="text-sm font-medium text-primary">From our blog</p>
          <h1 className="mt-2 text-3xl font-bold text-foreground lg:text-4xl">Stories, guides &amp; local insight</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">Travel tips, hidden gems, and expert advice from our team of local Luxembourg guides.</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
        {/* Featured post */}
        <Link href={`/blog/${featured.slug}`} className="group mb-10 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md lg:flex-row">
          <div className="relative h-56 shrink-0 lg:h-auto lg:w-[480px]">
            <Image src={featured.image} alt={featured.title} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="(max-width: 1024px) 100vw, 480px" priority />
          </div>
          <div className="flex flex-col justify-center p-6 lg:p-8">
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{featured.category}</span>
            <h2 className="mt-3 text-xl font-bold text-foreground lg:text-2xl">{featured.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{featured.excerpt}</p>
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{featured.author}</span>
              <span>{featured.date}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{featured.readTime}</span>
            </div>
            <span className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
              Read article <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </Link>

        {/* Post grid */}
        {rest.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
                <div className="relative aspect-video overflow-hidden">
                  <Image src={post.image} alt={post.title} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" loading="lazy" />
                  <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur-sm">
                    {post.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-sm font-bold text-foreground leading-snug group-hover:text-primary transition-colors">{post.title}</h3>
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground line-clamp-3">{post.excerpt}</p>
                  <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{post.author}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{post.readTime}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <SiteFooter />
    </div>
  )
}
