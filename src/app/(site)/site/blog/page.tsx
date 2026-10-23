import type { Metadata } from 'next'
import { BlogListing } from '@/components/site/blog-listing'
import { breadcrumbJsonLd } from '@/components/site/seo'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ page?: string }> }

function pageNumber(value?: string) {
  const n = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = pageNumber((await searchParams).page)
  return {
    title: page > 1 ? `School management blog — page ${page}` : 'School management blog: practical guides for schools',
    description:
      'Practical, no-nonsense guides for principals and school administrators on fees, admissions, attendance, parent communication, exams and school operations.',
    alternates: {
      canonical: page > 1 ? `/blog?page=${page}` : '/blog',
      types: { 'application/rss+xml': '/blog/rss.xml' },
    },
    openGraph: { type: 'website', title: 'The MyCampusView blog', url: '/blog' },
  }
}

export default async function BlogIndexPage({ searchParams }: Props) {
  const page = pageNumber((await searchParams).page)
  return (
    <>
      {breadcrumbJsonLd([{ name: 'Blog', path: '/blog' }])}
      <BlogListing page={page} />
    </>
  )
}
