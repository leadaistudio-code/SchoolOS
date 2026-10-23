import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Rss } from 'lucide-react'
import { Container, Section } from './container'
import { BlogCover, CategoryIcon, CategoryPill, PostCard, PostMeta } from './blog'
import { ClosingCta } from './cta'
import { BLOG_CATEGORIES, type BlogCategory } from '@/lib/blog'
import { categoryCounts, listPublishedPosts } from '@/server/modules/blog/queries'
import { cn } from '@/lib/utils'

/**
 * The archive, for both `/blog` and `/blog/category/[key]`.
 *
 * The first post on the front page is shown large; everything else is an even
 * grid so a reader scanning for a topic is not fighting the layout.
 */
export async function BlogListing({ category, page }: { category?: BlogCategory; page: number }) {
  const [{ posts, pages }, counts] = await Promise.all([
    listPublishedPosts({ category: category?.key, page }),
    categoryCounts(),
  ])
  const base = category ? `/blog/category/${category.key}` : '/blog'
  const featured = !category && page === 1 ? posts[0] : undefined
  const rest = featured ? posts.slice(1) : posts

  return (
    <>
      <div className="relative overflow-hidden border-b border-[var(--rule)] bg-[var(--paper)] pb-12 pt-16 sm:pb-16 sm:pt-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage: 'radial-gradient(var(--rule) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage: 'linear-gradient(to bottom, black, transparent 85%)',
          }}
          aria-hidden
        />
        <Container wide className="relative">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-3xl">
              <p className="eyebrow">
                {category ? (
                  <Link href="/blog" className="hover:text-[var(--text)]">
                    The MyCampusView blog
                  </Link>
                ) : (
                  'The MyCampusView blog'
                )}
              </p>
              <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.6rem)]">
                {category ? category.label : 'Practical guides for running a better school.'}
              </h1>
              <p className="muted mt-5 max-w-2xl text-[19px] leading-[1.55]">
                {category
                  ? category.blurb
                  : 'Fees, admissions, attendance, parent communication and the everyday work of a school office — written for principals, administrators and the people who keep a school running.'}
              </p>
            </div>
            <a
              href="/blog/rss.xml"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule)] bg-white px-3.5 py-2 text-[14px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text)]"
            >
              <Rss className="size-4" aria-hidden />
              RSS feed
            </a>
          </div>

          <nav aria-label="Blog categories" className="mt-10 flex flex-wrap gap-2">
            <CategoryLink href="/blog" active={!category} label="All articles" />
            {BLOG_CATEGORIES.filter((c) => counts[c.key]).map((c) => (
              <CategoryLink
                key={c.key}
                href={`/blog/category/${c.key}`}
                active={category?.key === c.key}
                label={c.label}
                count={counts[c.key]}
                category={c}
              />
            ))}
          </nav>
        </Container>
      </div>

      <Section space="snug" tone="page">
        <Container wide>
          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--rule-strong)] bg-white px-6 py-16 text-center">
              <p className="text-[18px] font-semibold text-[var(--text)]">The first articles are on their way.</p>
              <p className="muted mx-auto mt-2 max-w-md text-[15px] leading-[1.6]">
                A new guide is published every morning. Check back tomorrow, or follow the RSS feed.
              </p>
            </div>
          ) : null}

          {featured ? (
            <article className="group relative grid overflow-hidden rounded-2xl border border-[var(--rule)] bg-white transition-[border-color,box-shadow] duration-200 hover:border-[var(--rule-strong)] hover:shadow-[0_24px_60px_-32px_rgba(10,16,36,0.4)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
              <BlogCover categoryKey={featured.category} size="hero" className="aspect-[16/9] lg:aspect-auto lg:min-h-[340px]" />
              <div className="flex flex-col justify-center p-6 sm:p-10">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-[var(--ink)] px-2.5 py-1 text-[12px] font-semibold text-white">Latest</span>
                  <CategoryPill categoryKey={featured.category} />
                </div>
                <h2 className="display mt-4 text-[clamp(1.6rem,3vw,2.2rem)] leading-[1.18]">
                  <Link href={`/blog/${featured.slug}`} className="after:absolute after:inset-0">
                    {featured.title}
                  </Link>
                </h2>
                <p className="muted mt-4 text-[16.5px] leading-[1.6]">{featured.excerpt}</p>
                <div className="mt-6 flex items-center justify-between gap-4">
                  <PostMeta date={featured.publishedAt} minutes={featured.readingMinutes} />
                  <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[var(--blue)]">
                    Read the guide
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </div>
              </div>
            </article>
          ) : null}

          {rest.length > 0 ? (
            <div className={cn('grid gap-6 sm:grid-cols-2 lg:grid-cols-3', featured && 'mt-8')}>
              {rest.map((post) => (
                <PostCard key={post.slug} post={post} headingLevel="h2" />
              ))}
            </div>
          ) : null}

          {pages > 1 ? (
            <nav aria-label="Pagination" className="mt-12 flex items-center justify-between gap-4">
              {page > 1 ? (
                <Link
                  href={page === 2 ? base : `${base}?page=${page - 1}`}
                  rel="prev"
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule)] bg-white px-4 py-2.5 text-[15px] font-medium hover:border-[var(--rule-strong)]"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-[14px] text-[var(--text-subtle)]">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link
                  href={`${base}?page=${page + 1}`}
                  rel="next"
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule)] bg-white px-4 py-2.5 text-[15px] font-medium hover:border-[var(--rule-strong)]"
                >
                  Older
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </Container>
      </Section>

      <ClosingCta
        title="Put these ideas to work in your school."
        body="See how fees, admissions, attendance and parent communication run on one system — in a 30-minute walkthrough built around your school."
      />
    </>
  )
}

function CategoryLink({
  href,
  active,
  label,
  count,
  category,
}: {
  href: string
  active: boolean
  label: string
  count?: number
  category?: BlogCategory
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-colors duration-150',
        active
          ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
          : 'border-[var(--rule)] bg-white text-[var(--text-muted)] hover:border-[var(--rule-strong)] hover:text-[var(--text)]',
      )}
    >
      {category ? <CategoryIcon category={category} className="size-3.5" /> : null}
      {label}
      {count ? <span className={cn('text-[12px]', active ? 'text-white/70' : 'text-[var(--text-subtle)]')}>{count}</span> : null}
    </Link>
  )
}
