import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'
import { BLOG_CATEGORIES } from '@/lib/blog'
import { publishedForFeeds } from '@/server/modules/blog/queries'

/**
 * The public sitemap.
 *
 * Marketing pages only. The application lives on per-school hosts, is behind
 * authentication, and must never be listed — a sitemap that advertises
 * `/students` invites crawlers to hammer a login wall and tells the world which
 * schools are customers.
 *
 * Reached at the root of the marketing host: `/sitemap.xml` is in the
 * middleware passthrough list, so it is not rewritten under `/site`.
 */

/** Path, and how strongly it should be crawled relative to the homepage. */
const PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/product', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/student-information-system', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/admission-crm', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/school-erp', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/modules', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/integrations', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/transport', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/solutions', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/solutions/private-schools', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/solutions/international-schools', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/solutions/preschools', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/solutions/multi-campus', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/customers', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/services', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/security', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/contact', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/book-demo', priority: 0.9, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
]

/** Rebuilt hourly so a new article is listed the day it is published. */
export const revalidate = 3600

async function blogEntries(base: string): Promise<MetadataRoute.Sitemap> {
  // The build has no database; the static pages still deserve a sitemap.
  try {
    const posts = await publishedForFeeds()
    const categories = new Set(posts.map((post) => post.category))
    return [
      { url: `${base}/blog`, lastModified: posts[0]?.updatedAt ?? new Date(), changeFrequency: 'daily', priority: 0.8 },
      ...BLOG_CATEGORIES.filter((c) => categories.has(c.key)).map((c) => ({
        url: `${base}/blog/category/${c.key}`,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
      ...posts.map((post) => ({
        url: `${base}/blog/${post.slug}`,
        lastModified: post.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
    ]
  } catch {
    return [{ url: `${base}/blog`, changeFrequency: 'daily', priority: 0.8 }]
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL.replace(/\/$/, '')
  const lastModified = new Date()

  const pages: MetadataRoute.Sitemap = PAGES.map((page) => ({
    url: `${base}${page.path === '/' ? '' : page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }))
  return [...pages, ...(await blogEntries(base))]
}
