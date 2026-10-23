import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BlogListing } from '@/components/site/blog-listing'
import { breadcrumbJsonLd } from '@/components/site/seo'
import { BLOG_CATEGORIES } from '@/lib/blog'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ page?: string }> }

function pageNumber(value?: string) {
  const n = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { key } = await params
  const category = BLOG_CATEGORIES.find((c) => c.key === key)
  if (!category) return {}
  const page = pageNumber((await searchParams).page)
  const path = `/blog/category/${category.key}`
  return {
    title: `${category.label} for schools${page > 1 ? ` — page ${page}` : ''}`,
    description: `${category.blurb} Practical guides for school leaders and administrators.`,
    alternates: { canonical: page > 1 ? `${path}?page=${page}` : path },
  }
}

export default async function BlogCategoryPage({ params, searchParams }: Props) {
  const { key } = await params
  const category = BLOG_CATEGORIES.find((c) => c.key === key)
  if (!category) notFound()
  const page = pageNumber((await searchParams).page)
  return (
    <>
      {breadcrumbJsonLd([
        { name: 'Blog', path: '/blog' },
        { name: category.label, path: `/blog/category/${category.key}` },
      ])}
      <BlogListing category={category} page={page} />
    </>
  )
}
