import OpenAI from 'openai'
import { env } from '@/lib/env'
import { blogCategory, type BlogCategoryKey } from '@/lib/blog'
import { prisma } from '@/server/db/prisma'
import { storageProvider } from '@/server/providers'

/** Public marketing URL for a post's stored cover (same on Website and WebApp). */
export function blogCoverPublicPath(slug: string) {
  return `/blog/cover/${slug}`
}

const SCENE: Record<BlogCategoryKey, string> = {
  fees: 'a neat fee ledger spreadsheet on a laptop beside a calculator and stacked receipt folders',
  admissions: 'an admissions enquiry dashboard on a tablet with a funnel chart and calendar on the desk',
  attendance: 'a classroom attendance register beside a barcode scanner and a wall clock, morning light',
  academics: 'exam mark sheets, a graded answer booklet and a bar chart printout on a teacher desk',
  parents: 'a school notice board mock-up on a phone screen next to printed circulars and a mailbox slot',
  leadership: 'a strategic planning whiteboard with sticky notes and a simple KPI line chart, no writing legible',
  operations: 'a school front-office counter with organised file trays, ID cards and a queue ticket printer',
  transport: 'a bus route map pinned to a cork board with safety checklist clipboard and GPS tracker device',
  technology: 'a modern school ERP dashboard on a monitor showing charts and module icons, blurred UI text',
  data: 'a locked filing cabinet drawer slightly open with anonymised student record folders and a shield icon sticker',
  staff: 'a staff leave roster printout, payroll summary chart and HR folder on a wooden desk',
}

/**
 * Photorealistic hero photos for the blog.
 *
 * OpenAI image models only; text generation may use another driver. Failures are
 * non-fatal — the vector cover art is the fallback.
 */
export function buildCoverImagePrompt(input: {
  title: string
  categoryKey: string
  excerpt: string
}): string {
  const category = blogCategory(input.categoryKey)
  const scene = SCENE[category.key as BlogCategoryKey] ?? SCENE.operations
  return [
    'Professional editorial photograph for a school management blog, photorealistic, shot on a full-frame camera.',
    'Absolutely no people, no faces, no hands, no silhouettes, no human figures of any kind.',
    `Topic: ${input.title}.`,
    `Category: ${category.label}.`,
    `Scene: ${scene}.`,
    input.excerpt.slice(0, 200),
    'Soft natural window light, shallow depth of field, clean modern Indian private-school office aesthetic.',
    'Realistic materials and textures; looks like a stock photo from a corporate education shoot.',
    'No text, no logos, no watermarks, no cartoon, no 3D render, no illustration, no clipart.',
  ].join(' ')
}

function openAiImageClient() {
  const { AI_API_KEY, BLOG_IMAGE_API_KEY, BLOG_IMAGE_BASE_URL } = env()
  const apiKey = BLOG_IMAGE_API_KEY?.trim() || AI_API_KEY
  if (!apiKey) throw new Error('Set BLOG_IMAGE_API_KEY or AI_API_KEY for blog covers')
  // Chat gateways on AI_BASE_URL usually do not expose /images/generations.
  const baseURL = BLOG_IMAGE_BASE_URL?.trim() || undefined
  return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) })
}

export async function generateCoverImageBuffer(prompt: string): Promise<{ buffer: Buffer; mimeType: 'image/png' }> {
  const models = [env().BLOG_IMAGE_MODEL?.trim(), 'gpt-image-1', 'dall-e-3', 'dall-e-2'].filter(
    (m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i,
  )
  const client = openAiImageClient()
  let lastError: unknown

  for (const model of models) {
    try {
      const size = model.startsWith('dall-e-2')
        ? ('1024x1024' as const)
        : model.startsWith('dall-e')
          ? ('1792x1024' as const)
          : ('1536x1024' as const)
      const response = await client.images.generate({
        model,
        prompt,
        size,
        ...(model.startsWith('dall-e-3') ? { quality: 'standard' as const } : {}),
        ...(model === 'gpt-image-1' ? { quality: 'medium' as const } : {}),
        n: 1,
      })
      const b64 = response.data?.[0]?.b64_json
      if (!b64) throw new Error('Image model returned no image data')
      return { buffer: Buffer.from(b64, 'base64'), mimeType: 'image/png' }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Blog cover image generation failed')
}

export async function storeBlogCover(slug: string, buffer: Buffer, mimeType: string): Promise<string> {
  const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png'
  const key = `platform/blog-covers/${slug}.${ext}`
  await storageProvider().put(key, buffer, mimeType)
  return key
}

export async function attachCoverToPost(post: {
  id: string
  slug: string
  title: string
  category: string
  excerpt: string
}): Promise<string | null> {
  try {
    const prompt = buildCoverImagePrompt({
      title: post.title,
      categoryKey: post.category,
      excerpt: post.excerpt,
    })
    const { buffer, mimeType } = await generateCoverImageBuffer(prompt)
    const key = await storeBlogCover(post.slug, buffer, mimeType)
    const alt = `${post.title} — photorealistic scene about ${blogCategory(post.category).label.toLowerCase()} for schools`
    await prisma.blogPost.update({
      where: { id: post.id },
      data: { coverImageKey: key, coverImageAlt: alt },
    })
    return key
  } catch (error) {
    console.warn('[blog] cover image generation failed:', error instanceof Error ? error.message : error)
    return null
  }
}

export async function readBlogCover(key: string): Promise<{ body: Buffer; mimeType: string }> {
  const body = await storageProvider().get(key)
  const mimeType = key.endsWith('.jpg') || key.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'
  return { body, mimeType }
}
