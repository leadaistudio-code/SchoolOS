import { z } from 'zod'

export const cmsPageSchema = z.object({
  title: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lower-case letters, numbers and hyphens'),
  seoTitle: z.string().trim().max(120).optional().or(z.literal('')).transform((v) => v || undefined),
  seoDescription: z
    .string()
    .trim()
    .max(300)
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  showInNav: z.coerce.boolean().default(true),
  isPublished: z.coerce.boolean().default(false),
})

export type CmsPageInput = z.infer<typeof cmsPageSchema>

export const cmsBlockSchema = z.object({
  kind: z.enum(['HERO', 'TEXT', 'CTA', 'ENQUIRE']),
  heading: z.string().trim().max(200).optional().or(z.literal('')).transform((v) => v || undefined),
  body: z.string().trim().max(8000).optional().or(z.literal('')).transform((v) => v || undefined),
  sortOrder: z.coerce.number().int().min(0).default(0),
})

export type CmsBlockInput = z.infer<typeof cmsBlockSchema>

export const cmsPostSchema = z.object({
  title: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lower-case letters, numbers and hyphens'),
  excerpt: z.string().trim().max(400).optional().or(z.literal('')).transform((v) => v || undefined),
  body: z.string().trim().min(1).max(20000),
  category: z.string().trim().max(40).default('NEWS'),
  isPublished: z.coerce.boolean().default(false),
})

export type CmsPostInput = z.infer<typeof cmsPostSchema>
