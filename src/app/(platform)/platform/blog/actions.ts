'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { attachCoverToPost } from '@/server/modules/blog/cover-image'
import { runDailyBlog } from '@/server/modules/blog/generate'

export type BlogActionResult = { ok: boolean; message: string }

export async function generatePostAction(): Promise<BlogActionResult> {
  await requirePlatformContext('platform.crm')
  try {
    const result = await runDailyBlog({ force: true })
    revalidatePath('/platform/blog')
    if (result.status === 'published') return { ok: true, message: `Published “${result.title}”.` }
    if (result.status === 'held') return { ok: true, message: `Saved “${result.title}” as a draft for review.` }
    return { ok: false, message: result.reason ?? 'Nothing was generated' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Generation failed' }
  }
}

export async function setPostStatusAction(
  id: string,
  status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED',
): Promise<BlogActionResult> {
  await requirePlatformContext('platform.crm')
  const post = await prisma.blogPost.findUnique({ where: { id }, select: { publishedAt: true } })
  if (!post) return { ok: false, message: 'Post not found' }
  await prisma.blogPost.update({
    where: { id },
    data: {
      status,
      ...(status === 'PUBLISHED' && !post.publishedAt ? { publishedAt: new Date() } : {}),
      ...(status === 'PUBLISHED' ? { reviewNote: null } : {}),
    },
  })
  revalidatePath('/platform/blog')
  const label = status === 'PUBLISHED' ? 'Published' : status === 'ARCHIVED' ? 'Archived' : 'Moved to drafts'
  return { ok: true, message: label }
}

export async function regenerateCoverAction(id: string): Promise<BlogActionResult> {
  await requirePlatformContext('platform.crm')
  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, category: true, excerpt: true },
  })
  if (!post) return { ok: false, message: 'Post not found' }
  const key = await attachCoverToPost(post)
  revalidatePath('/platform/blog')
  return key
    ? { ok: true, message: 'Cover photo generated.' }
    : { ok: false, message: 'Cover generation failed — check WebApp logs (Gemini: gemini-2.5-flash-image + AI_API_KEY).' }
}

export async function deletePostAction(id: string): Promise<BlogActionResult> {
  await requirePlatformContext('platform.crm')
  await prisma.blogPost.delete({ where: { id } }).catch(() => null)
  revalidatePath('/platform/blog')
  return { ok: true, message: 'Deleted' }
}
