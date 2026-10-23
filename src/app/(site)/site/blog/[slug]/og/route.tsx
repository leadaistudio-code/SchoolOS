import { ImageResponse } from 'next/og'
import { blogCategory } from '@/lib/blog'
import { getPublishedPost } from '@/server/modules/blog/queries'

export const dynamic = 'force-dynamic'

/** The social card for one article: 1200×630, drawn from its title and category. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const post = await getPublishedPost((await params).slug)
  if (!post) return new Response('Not found', { status: 404 })
  const category = blogCategory(post.category)
  const titleSize = post.title.length > 70 ? 54 : post.title.length > 48 ? 62 : 70

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          backgroundColor: category.tint,
          backgroundImage: `radial-gradient(${category.accent}2e 1.6px, transparent 1.6px)`,
          backgroundSize: '26px 26px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              padding: '10px 22px',
              borderRadius: 999,
              backgroundColor: 'white',
              color: category.accent,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            {category.label}
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: '#4a5468' }}>{post.readingMinutes} min read</div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            color: '#0a1024',
            maxWidth: 1000,
          }}
        >
          {post.title}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: '#0a1024',
              color: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            M
          </div>
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: '#0a1024' }}>MyCampusView</div>
          <div style={{ display: 'flex', fontSize: 24, color: '#4a5468', marginLeft: 8 }}>· Blog</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
    },
  )
}
