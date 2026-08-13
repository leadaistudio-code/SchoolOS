import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { prisma } from '@/server/db/prisma'
import {
  cmsBlockSchema,
  cmsPageSchema,
  cmsPostSchema,
  type CmsBlockInput,
  type CmsPageInput,
  type CmsPostInput,
} from './schema'

export async function listPages(ctx: AppContext) {
  ctx.require('website.view')
  return ctx.db.cmsPage.findMany({
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    include: { _count: { select: { blocks: true } } },
  })
}

export async function getPage(ctx: AppContext, id: string) {
  ctx.require('website.view')
  const page = await ctx.db.cmsPage.findFirst({
    where: { id },
    include: { blocks: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!page) throw notFound('Page not found')
  return page
}

export async function createPage(ctx: AppContext, raw: CmsPageInput) {
  ctx.require('website.manage')
  const input = cmsPageSchema.parse(raw)
  const dup = await ctx.db.cmsPage.findFirst({ where: { slug: input.slug } })
  if (dup) throw conflict(`A page with slug "${input.slug}" already exists`)

  const count = await ctx.db.cmsPage.count()
  const page = await ctx.db.cmsPage.create({
    data: {
      tenantId: ctx.tenant.id,
      title: input.title,
      slug: input.slug,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      showInNav: input.showInNav,
      isPublished: input.isPublished,
      sortOrder: count,
    },
  })

  await ctx.db.cmsBlock.create({
    data: {
      tenantId: ctx.tenant.id,
      pageId: page.id,
      kind: 'HERO',
      heading: input.title,
      body: 'Welcome to our school.',
      sortOrder: 0,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'website.page.create',
    module: 'website',
    entityType: 'CmsPage',
    entityId: page.id,
    summary: `Created page /${page.slug}`,
  })

  return page
}

export async function updatePage(ctx: AppContext, id: string, raw: CmsPageInput) {
  ctx.require('website.manage')
  const input = cmsPageSchema.parse(raw)
  const existing = await ctx.db.cmsPage.findFirst({ where: { id } })
  if (!existing) throw notFound('Page not found')

  const dup = await ctx.db.cmsPage.findFirst({
    where: { slug: input.slug, NOT: { id } },
  })
  if (dup) throw conflict(`A page with slug "${input.slug}" already exists`)

  return ctx.db.cmsPage.update({
    where: { id },
    data: {
      title: input.title,
      slug: input.slug,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      showInNav: input.showInNav,
      isPublished: input.isPublished,
    },
  })
}

export async function addBlock(ctx: AppContext, pageId: string, raw: CmsBlockInput) {
  ctx.require('website.manage')
  const input = cmsBlockSchema.parse(raw)
  const page = await ctx.db.cmsPage.findFirst({ where: { id: pageId } })
  if (!page) throw notFound('Page not found')

  const count = await ctx.db.cmsBlock.count({ where: { pageId } })
  return ctx.db.cmsBlock.create({
    data: {
      tenantId: ctx.tenant.id,
      pageId,
      kind: input.kind,
      heading: input.heading ?? null,
      body: input.body ?? null,
      sortOrder: input.sortOrder || count,
    },
  })
}

export async function updateBlock(ctx: AppContext, blockId: string, raw: CmsBlockInput) {
  ctx.require('website.manage')
  const input = cmsBlockSchema.parse(raw)
  const block = await ctx.db.cmsBlock.findFirst({ where: { id: blockId } })
  if (!block) throw notFound('Block not found')

  return ctx.db.cmsBlock.update({
    where: { id: blockId },
    data: {
      kind: input.kind,
      heading: input.heading ?? null,
      body: input.body ?? null,
      sortOrder: input.sortOrder,
    },
  })
}

export async function deleteBlock(ctx: AppContext, blockId: string) {
  ctx.require('website.manage')
  const block = await ctx.db.cmsBlock.findFirst({ where: { id: blockId } })
  if (!block) throw notFound('Block not found')
  await ctx.db.cmsBlock.delete({ where: { id: blockId } })
}

export async function listPosts(ctx: AppContext) {
  ctx.require('website.view')
  return ctx.db.cmsPost.findMany({
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  })
}

export async function createPost(ctx: AppContext, raw: CmsPostInput) {
  ctx.require('website.manage')
  const input = cmsPostSchema.parse(raw)
  const dup = await ctx.db.cmsPost.findFirst({ where: { slug: input.slug } })
  if (dup) throw conflict(`A post with slug "${input.slug}" already exists`)

  return ctx.db.cmsPost.create({
    data: {
      tenantId: ctx.tenant.id,
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt ?? null,
      body: input.body,
      category: input.category,
      isPublished: input.isPublished,
      publishedAt: input.isPublished ? new Date() : null,
    },
  })
}

/** Public site — tenant already resolved by host. */
export async function getPublicSite(tenantId: string) {
  const [pages, posts, school] = await Promise.all([
    prisma.cmsPage.findMany({
      where: { tenantId, isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.cmsPost.findMany({
      where: { tenantId, isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    }),
    prisma.school.findFirst({
      where: { tenantId },
      select: { name: true, branding: { select: { primaryHex: true, logoUrl: true } } },
    }),
  ])
  return { pages, posts, school }
}

export async function getPublicPage(tenantId: string, slug: string) {
  return prisma.cmsPage.findFirst({
    where: { tenantId, slug, isPublished: true },
    include: { blocks: { orderBy: { sortOrder: 'asc' } } },
  })
}

export async function ensureDefaultHomePage(ctx: AppContext) {
  ctx.require('website.manage')
  const existing = await ctx.db.cmsPage.findFirst({ where: { slug: 'home' } })
  if (existing) return existing
  return createPage(ctx, {
    title: 'Home',
    slug: 'home',
    showInNav: true,
    isPublished: true,
    seoTitle: `${ctx.tenant.name}`,
    seoDescription: `Welcome to ${ctx.tenant.name}`,
  })
}
