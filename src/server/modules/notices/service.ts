import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound } from '@/server/api/response'
import { accessibleStudentIds } from '@/server/scope'
import { notify } from '@/server/notifications'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'

export const noticeCreateSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the notice a title').max(200),
    body: z.string().trim().min(3, 'Write the notice').max(8000),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
    publishOn: z.string().optional(),
    expiresOn: z.string().optional(),
    isPublished: z.coerce.boolean().default(true),
    pinned: z.coerce.boolean().default(false),
    /** Empty audience means everyone in the school. */
    audienceKind: z.enum(['ALL', 'ROLE', 'CLASS', 'SECTION']).default('ALL'),
    roleKey: z.string().optional(),
    classLevelId: z.string().optional(),
    sectionId: z.string().optional(),
    notifyNow: z.coerce.boolean().default(false),
  })
  .refine((v) => v.audienceKind !== 'CLASS' || !!v.classLevelId, {
    path: ['classLevelId'],
    message: 'Choose the class this notice is for',
  })
  .refine((v) => v.audienceKind !== 'SECTION' || !!v.sectionId, {
    path: ['sectionId'],
    message: 'Choose the section this notice is for',
  })
  .refine((v) => v.audienceKind !== 'ROLE' || !!v.roleKey, {
    path: ['roleKey'],
    message: 'Choose the role this notice is for',
  })

export type NoticeCreateInput = z.infer<typeof noticeCreateSchema>

/**
 * Update accepts a subset of the create fields. Declared separately rather
 * than derived, because the create schema carries cross-field refinements that
 * cannot be meaningfully applied to a partial payload.
 */
export const noticeUpdateSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  body: z.string().trim().min(3).max(8000).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  publishOn: z.string().optional(),
  expiresOn: z.string().nullable().optional(),
  isPublished: z.coerce.boolean().optional(),
  pinned: z.coerce.boolean().optional(),
})

export type NoticeUpdateInput = z.infer<typeof noticeUpdateSchema>

export const NOTICE_SORT_FIELDS = ['publishOn', 'priority', 'title'] as const

/**
 * Builds the visibility filter for the acting user.
 *
 * A notice aimed at Class 7 must reach a Class 7 parent and nobody else. This
 * is the whole point of targeting, so it is computed on the server from the
 * reader's own children and roles — never from a query parameter.
 *
 * Staff who can publish notices see everything, including drafts and expired
 * ones, because they are administering the board rather than reading it.
 */
async function visibilityWhere(ctx: AppContext): Promise<Prisma.NoticeWhereInput> {
  if (ctx.can('notices.publish')) return { deletedAt: null }

  const now = new Date()
  const base: Prisma.NoticeWhereInput = {
    deletedAt: null,
    isPublished: true,
    publishOn: { lte: now },
    OR: [{ expiresOn: null }, { expiresOn: { gte: now } }],
  }

  const studentIds = await accessibleStudentIds(ctx)

  // Staff without publishing rights: everything published, plus role-targeted
  // notices for a role they hold.
  if (studentIds === null) {
    return {
      ...base,
      targets: {
        some: {
          OR: [
            { kind: 'ALL' },
            { kind: 'STAFF' },
            { kind: 'ROLE', roleKey: { in: ctx.user.roleKeys } },
          ],
        },
      },
    }
  }

  if (studentIds.length === 0) {
    return { ...base, targets: { some: { kind: 'ALL' } } }
  }

  const enrollments = await ctx.db.enrollment.findMany({
    where: { studentId: { in: studentIds }, isCurrent: true },
    select: { classLevelId: true, sectionId: true },
  })

  return {
    ...base,
    targets: {
      some: {
        OR: [
          { kind: 'ALL' },
          { kind: 'ROLE', roleKey: { in: ctx.user.roleKeys } },
          { kind: 'CLASS', classLevelId: { in: enrollments.map((e) => e.classLevelId) } },
          { kind: 'SECTION', sectionId: { in: enrollments.map((e) => e.sectionId) } },
        ],
      },
    },
  }
}

export type NoticeRow = {
  id: string
  title: string
  body: string
  priority: string
  publishOn: Date
  expiresOn: Date | null
  isPublished: boolean
  pinned: boolean
  audience: string
  attachmentCount: number
  isExpired: boolean
}

export async function listNotices(
  ctx: AppContext,
  query: ListQuery,
  filter: { priority?: string } = {},
): Promise<{ rows: NoticeRow[]; total: number }> {
  ctx.require('notices.view')

  const where: Prisma.NoticeWhereInput = {
    ...(await visibilityWhere(ctx)),
    ...(filter.priority ? { priority: filter.priority as never } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { body: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const orderBy = orderByFrom(query.sort, query.dir, NOTICE_SORT_FIELDS, { publishOn: 'desc' })

  const [rows, total] = await Promise.all([
    ctx.db.notice.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, orderBy],
      ...skipTake(query),
      select: {
        id: true,
        title: true,
        body: true,
        priority: true,
        publishOn: true,
        expiresOn: true,
        isPublished: true,
        pinned: true,
        _count: { select: { attachments: true } },
        targets: {
          select: {
            kind: true,
            roleKey: true,
            classLevel: { select: { name: true } },
          },
        },
      },
    }),
    ctx.db.notice.count({ where }),
  ])

  const now = new Date()
  return {
    total,
    rows: rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      priority: n.priority,
      publishOn: n.publishOn,
      expiresOn: n.expiresOn,
      isPublished: n.isPublished,
      pinned: n.pinned,
      audience: describeAudience(n.targets),
      attachmentCount: n._count.attachments,
      isExpired: !!n.expiresOn && n.expiresOn < now,
    })),
  }
}

function describeAudience(
  targets: { kind: string; roleKey: string | null; classLevel: { name: string } | null }[],
): string {
  if (targets.length === 0) return 'Everyone'
  const parts = targets.map((t) => {
    switch (t.kind) {
      case 'ALL':
        return 'Everyone'
      case 'ROLE':
        return (t.roleKey ?? 'Role').replace('_', ' ').toLowerCase()
      case 'CLASS':
        return t.classLevel?.name ?? 'A class'
      case 'SECTION':
        return 'One section'
      case 'STAFF':
        return 'Staff'
      case 'PARENT':
        return 'Parents'
      default:
        return t.kind.toLowerCase()
    }
  })
  return [...new Set(parts)].join(', ')
}

export async function getNotice(ctx: AppContext, id: string) {
  ctx.require('notices.view')

  // The visibility filter is applied to the single-record read too, so a
  // guessed id does not bypass targeting.
  const notice = await ctx.db.notice.findFirst({
    where: { id, ...(await visibilityWhere(ctx)) },
    include: {
      attachments: true,
      targets: {
        include: { classLevel: { select: { id: true, name: true } } },
      },
    },
  })
  if (!notice) throw notFound('Notice')
  return notice
}

export async function createNotice(ctx: AppContext, input: NoticeCreateInput) {
  ctx.require('notices.create')

  const created = await ctx.db.$transaction(async (tx) => {
    const notice = await tx.notice.create({
      data: {
        tenantId: ctx.tenant.id,
        title: input.title,
        body: input.body,
        priority: input.priority,
        publishOn: input.publishOn ? new Date(input.publishOn) : new Date(),
        expiresOn: input.expiresOn ? new Date(input.expiresOn) : null,
        isPublished: input.isPublished,
        pinned: input.pinned,
        createdById: ctx.user.userId,
      },
    })

    await tx.noticeTarget.create({
      data: {
        tenantId: ctx.tenant.id,
        noticeId: notice.id,
        kind: input.audienceKind,
        roleKey: input.audienceKind === 'ROLE' ? (input.roleKey ?? null) : null,
        classLevelId: input.audienceKind === 'CLASS' ? (input.classLevelId ?? null) : null,
        sectionId: input.audienceKind === 'SECTION' ? (input.sectionId ?? null) : null,
      },
    })

    return notice
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'notice.create',
    module: 'notices',
    entityType: 'Notice',
    entityId: created.id,
    summary: `Posted "${created.title}" to ${input.audienceKind.toLowerCase()}`,
    after: created,
  })

  if (input.isPublished && input.notifyNow) {
    await notifyAudience(ctx, created.id, input)
  }

  return created
}

/** Resolves the audience to actual user ids and sends an in-app notification. */
async function notifyAudience(ctx: AppContext, noticeId: string, input: NoticeCreateInput) {
  const notice = await ctx.db.notice.findFirst({
    where: { id: noticeId },
    select: { title: true, body: true },
  })
  if (!notice) return

  let userIds: string[] = []

  if (input.audienceKind === 'ALL') {
    const users = await ctx.db.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true },
      take: 2000,
    })
    userIds = users.map((u) => u.id)
  } else if (input.audienceKind === 'ROLE') {
    const users = await ctx.db.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        roles: { some: { role: { key: input.roleKey } } },
      },
      select: { id: true },
      take: 2000,
    })
    userIds = users.map((u) => u.id)
  } else {
    const enrollments = await ctx.db.enrollment.findMany({
      where: {
        isCurrent: true,
        ...(input.audienceKind === 'CLASS'
          ? { classLevelId: input.classLevelId }
          : { sectionId: input.sectionId }),
      },
      select: {
        student: {
          select: {
            userId: true,
            guardians: { select: { parent: { select: { userId: true } } } },
          },
        },
      },
    })
    userIds = enrollments
      .flatMap((e) => [e.student.userId, ...e.student.guardians.map((g) => g.parent.userId)])
      .filter((id): id is string => !!id)
  }

  await notify(ctx, {
    userIds,
    eventKey: 'notice.published',
    title: notice.title,
    body: notice.body.slice(0, 240),
    linkUrl: `/communication/notices/${noticeId}`,
  })
}

export async function updateNotice(ctx: AppContext, id: string, input: NoticeUpdateInput) {
  ctx.require('notices.edit')

  const before = await ctx.db.notice.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Notice')

  const updated = await ctx.db.notice.update({
    where: { id },
    data: {
      title: input.title,
      body: input.body,
      priority: input.priority,
      isPublished: input.isPublished,
      pinned: input.pinned,
      ...(input.publishOn ? { publishOn: new Date(input.publishOn) } : {}),
      ...(input.expiresOn !== undefined
        ? { expiresOn: input.expiresOn ? new Date(input.expiresOn) : null }
        : {}),
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'notice.update',
    module: 'notices',
    entityType: 'Notice',
    entityId: id,
    summary: `Updated notice "${updated.title}"`,
    before,
    after: updated,
  })
  return updated
}

export async function deleteNotice(ctx: AppContext, id: string) {
  ctx.require('notices.delete')

  const before = await ctx.db.notice.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Notice')

  await ctx.db.notice.update({ where: { id }, data: { deletedAt: new Date() } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'notice.delete',
    module: 'notices',
    entityType: 'Notice',
    entityId: id,
    summary: `Deleted notice "${before.title}"`,
    before,
  })
  return { ok: true }
}
