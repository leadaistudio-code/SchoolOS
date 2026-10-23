import { env } from '@/lib/env'
import { blogCategory } from '@/lib/blog'
import { publishedForFeeds } from '@/server/modules/blog/queries'

export const dynamic = 'force-dynamic'

function escape(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET() {
  const base = env().APP_URL.replace(/\/$/, '')
  const posts = await publishedForFeeds(50)
  const items = posts
    .map((post) => {
      const url = `${base}/blog/${post.slug}`
      return [
        '<item>',
        `<title>${escape(post.title)}</title>`,
        `<link>${url}</link>`,
        `<guid isPermaLink="true">${url}</guid>`,
        `<description>${escape(post.excerpt)}</description>`,
        `<category>${escape(blogCategory(post.category).label)}</category>`,
        post.publishedAt ? `<pubDate>${post.publishedAt.toUTCString()}</pubDate>` : '',
        '</item>',
      ].join('')
    })
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>The MyCampusView blog</title><link>${base}/blog</link><description>Practical guides for school leaders and administrators.</description><language>en-in</language><atom:link href="${base}/blog/rss.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=900',
    },
  })
}
