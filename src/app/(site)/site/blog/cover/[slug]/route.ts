import { readBlogCover } from '@/server/modules/blog/cover-image'
import { getPublishedPost } from '@/server/modules/blog/queries'

export const dynamic = 'force-dynamic'

/** Serves the stored AI hero photo for a published article. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const post = await getPublishedPost((await params).slug)
  if (!post?.coverImageKey) return new Response('Not found', { status: 404 })

  const { body, mimeType } = await readBlogCover(post.coverImageKey)
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
    },
  })
}
