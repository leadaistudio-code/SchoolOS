import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, CheckCircle2, ChevronRight, Plus } from 'lucide-react'
import { Container, Section } from '@/components/site/container'
import { BlogCover, CategoryPill, PostCard, PostMeta } from '@/components/site/blog'
import { ClosingCta } from '@/components/site/cta'
import { blogPostingJsonLd, breadcrumbJsonLd, faqJsonLd } from '@/components/site/seo'
import { blogCategory } from '@/lib/blog'
import { getPublishedPost, relatedPosts } from '@/server/modules/blog/queries'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublishedPost((await params).slug)
  if (!post) return { title: 'Article not found', robots: { index: false } }
  const path = `/blog/${post.slug}`
  return {
    title: { absolute: post.metaTitle },
    description: post.metaDescription,
    keywords: post.keywords,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      url: path,
      title: post.title,
      description: post.metaDescription,
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      section: blogCategory(post.category).label,
      tags: post.keywords,
      images: [{ url: `${path}/og`, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.metaDescription,
      images: [`${path}/og`],
    },
  }
}

function decode(text: string) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, '’')
    .replace(/&nbsp;/g, ' ')
}

function outline(html: string) {
  return Array.from(html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)).map((m) => ({
    id: m[1]!,
    text: decode(m[2]!),
  }))
}

/**
 * One article.
 *
 * The body is HTML the generator has already sanitised to a short allowlist
 * of tags and to links on this site only, so it is rendered as it is stored.
 */
export default async function BlogPostPage({ params }: Props) {
  const post = await getPublishedPost((await params).slug)
  if (!post) notFound()
  const category = blogCategory(post.category)
  const toc = outline(post.contentHtml)
  const related = await relatedPosts(post.slug, post.category)

  return (
    <>
      {breadcrumbJsonLd([
        { name: 'Blog', path: '/blog' },
        { name: category.label, path: `/blog/category/${category.key}` },
        { name: post.title, path: `/blog/${post.slug}` },
      ])}
      {blogPostingJsonLd({
        slug: post.slug,
        title: post.title,
        description: post.metaDescription,
        category: category.label,
        keywords: post.keywords,
        wordCount: post.wordCount,
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
      })}
      {post.faq.length > 0 ? faqJsonLd(post.faq) : null}

      <header className="border-b border-[var(--rule)] bg-[var(--paper)] pt-10 sm:pt-14">
        <Container>
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[13.5px] text-[var(--text-subtle)]">
            <Link href="/blog" className="hover:text-[var(--text)]">Blog</Link>
            <ChevronRight className="size-3.5" aria-hidden />
            <Link href={`/blog/category/${category.key}`} className="hover:text-[var(--text)]">
              {category.label}
            </Link>
          </nav>
          <div className="mx-auto max-w-[52rem] pb-10 pt-8 text-center sm:pb-12">
            <div className="flex justify-center">
              <CategoryPill categoryKey={post.category} />
            </div>
            <h1 className="display mt-5 text-[clamp(2rem,4.4vw,3.2rem)] leading-[1.12]">{post.title}</h1>
            <p className="muted mx-auto mt-5 max-w-2xl text-[18.5px] leading-[1.6]">{post.excerpt}</p>
            <div className="mt-6 flex justify-center">
              <PostMeta date={post.publishedAt} minutes={post.readingMinutes} className="justify-center" />
            </div>
          </div>
          <BlogCover
            categoryKey={post.category}
            size="hero"
            className="mx-auto aspect-[21/9] max-w-[64rem] rounded-t-2xl border border-b-0 border-[var(--rule)]"
          />
        </Container>
      </header>

      <Section space="snug">
        <Container>
          <div className="mx-auto grid max-w-[64rem] gap-12 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-14">
            {toc.length > 2 ? (
              <aside className="hidden lg:block">
                <nav aria-label="In this article" className="sticky top-28">
                  <p className="eyebrow">In this article</p>
                  <ol className="mt-4 space-y-1 border-l border-[var(--rule)]">
                    {toc.map((item) => (
                      <li key={item.id}>
                        <a
                          href={`#${item.id}`}
                          className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[14px] leading-[1.45] text-[var(--text-muted)] transition-colors hover:border-[var(--ink)] hover:text-[var(--text)]"
                        >
                          {item.text}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              </aside>
            ) : (
              <div className="hidden lg:block" />
            )}

            <div className="min-w-0">
              {post.takeaways.length > 0 ? (
                <aside
                  className="mb-10 rounded-xl border p-6 sm:p-7"
                  style={{ backgroundColor: category.tint, borderColor: `${category.accent}33` }}
                >
                  <p className="text-[15px] font-semibold" style={{ color: category.accent }}>
                    Key takeaways
                  </p>
                  <ul className="mt-4 space-y-3">
                    {post.takeaways.map((item) => (
                      <li key={item} className="flex gap-3 text-[16px] leading-[1.6] text-[var(--text)]">
                        <CheckCircle2 className="mt-1 size-[18px] shrink-0" style={{ color: category.accent }} aria-hidden />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </aside>
              ) : null}

              <div className="blog-prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />

              {post.faq.length > 0 ? (
                <section aria-labelledby="faq" className="mt-14">
                  <h2 id="faq" className="text-[26px] font-semibold leading-[1.25] text-[var(--text)]">
                    Frequently asked questions
                  </h2>
                  <div className="mt-6 divide-y divide-[var(--rule)] rounded-xl border border-[var(--rule)] bg-white">
                    {post.faq.map((item) => (
                      <details key={item.question} className="group px-5 sm:px-6">
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-5 text-[16.5px] font-semibold text-[var(--text)] [&::-webkit-details-marker]:hidden">
                          {item.question}
                          <Plus className="mt-1 size-4 shrink-0 text-[var(--text-subtle)] transition-transform duration-200 group-open:rotate-45" aria-hidden />
                        </summary>
                        <p className="pb-5 text-[16px] leading-[1.7] text-[var(--text-muted)]">{item.answer}</p>
                      </details>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="relative mt-14 overflow-hidden rounded-2xl bg-[var(--navy)] p-7 sm:p-9">
                <div
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                  }}
                  aria-hidden
                />
                <div className="relative">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--on-dark-muted)]">
                    MyCampusView
                  </p>
                  <p className="mt-2 text-[22px] font-semibold leading-[1.3] text-white">
                    Run fees, admissions, attendance and parent updates from one system.
                  </p>
                  <p className="mt-3 max-w-xl text-[15.5px] leading-[1.6] text-[var(--on-dark-muted)]">
                    See it working with your own school&rsquo;s setup in a 30-minute walkthrough.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      href="/book-demo"
                      className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--blue-tint)]"
                    >
                      Book a demo
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                    <Link
                      href="/modules"
                      className="inline-flex items-center rounded-lg border border-[var(--navy-line)] px-4 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-white/10"
                    >
                      Explore the modules
                    </Link>
                  </div>
                </div>
              </div>

              <p className="mt-8 border-t border-[var(--rule)] pt-6 text-[13.5px] leading-[1.6] text-[var(--text-subtle)]">
                Written by the MyCampusView team with AI assistance. This is general guidance for
                schools; check board rules, local regulations and your own policies before acting
                on it.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {related.length > 0 ? (
        <Section space="snug" tone="page">
          <Container wide>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="display text-[clamp(1.6rem,3vw,2.1rem)]">Keep reading</h2>
              <Link href="/blog" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[var(--blue)]">
                All articles
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <PostCard key={item.slug} post={item} />
              ))}
            </div>
          </Container>
        </Section>
      ) : null}

      <ClosingCta />
    </>
  )
}
