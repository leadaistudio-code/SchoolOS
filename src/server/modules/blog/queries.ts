import { prisma } from '@/server/db/prisma'

/**
 * What the website reads. Published posts only, and only the columns a page
 * renders, so a draft or a review note can never leak onto the public site.
 */

const CARD = {
  slug: true,
  title: true,
  excerpt: true,
  category: true,
  readingMinutes: true,
  publishedAt: true,
  coverImageKey: true,
  coverImageAlt: true,
} as const

export type BlogCard = {
  slug: string
  title: string
  excerpt: string
  category: string
  readingMinutes: number
  publishedAt: Date | null
  coverImageKey: string | null
  coverImageAlt: string | null
}

export type BlogFaq = { question: string; answer: string }

export const BLOG_PAGE_SIZE = 12

export async function listPublishedPosts(options: { category?: string; page?: number } = {}) {
  const page = Math.max(1, options.page ?? 1)
  const where = { status: 'PUBLISHED' as const, ...(options.category ? { category: options.category } : {}) }
  const [posts, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      select: CARD,
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * BLOG_PAGE_SIZE,
      take: BLOG_PAGE_SIZE,
    }),
    prisma.blogPost.count({ where }),
  ])
  return { posts, total, page, pages: Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE)) }
}

export async function getPublishedPost(slug: string) {
  const post = await prisma.blogPost.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: {
      ...CARD,
      metaTitle: true,
      metaDescription: true,
      keywords: true,
      contentHtml: true,
      faq: true,
      takeaways: true,
      wordCount: true,
      updatedAt: true,
    },
  })
  if (!post) return null
  return { ...post, faq: (Array.isArray(post.faq) ? post.faq : []) as BlogFaq[] }
}

export async function relatedPosts(slug: string, category: string, take = 3): Promise<BlogCard[]> {
  const same = await prisma.blogPost.findMany({
    where: { status: 'PUBLISHED', category, slug: { not: slug } },
    select: CARD,
    orderBy: { publishedAt: 'desc' },
    take,
  })
  if (same.length >= take) return same
  const more = await prisma.blogPost.findMany({
    where: { status: 'PUBLISHED', slug: { notIn: [slug, ...same.map((p) => p.slug)] } },
    select: CARD,
    orderBy: { publishedAt: 'desc' },
    take: take - same.length,
  })
  return [...same, ...more]
}

/** Every published slug, for the sitemap and RSS. */
export async function publishedForFeeds(take = 5000) {
  return prisma.blogPost.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, title: true, excerpt: true, category: true, publishedAt: true, updatedAt: true },
    orderBy: { publishedAt: 'desc' },
    take,
  })
}

export async function categoryCounts(): Promise<Record<string, number>> {
  const rows = await prisma.blogPost.groupBy({
    by: ['category'],
    where: { status: 'PUBLISHED' },
    _count: { _all: true },
  })
  return Object.fromEntries(rows.map((r) => [r.category, r._count._all]))
}
