import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import {
  accessibleClassLevelIds,
  assertClassSubjectAccess,
  isPortalOnlyRole,
  teachingClassSubjectIds,
} from '@/server/scope'

/**
 * The syllabus, as structure.
 *
 * `Classwork.topic` already records what was taught on a given day, as free
 * text. That is the right shape for a lesson log and the wrong shape for
 * anything that has to reason about coverage: it cannot answer "which topics
 * belong to chapter 2", so it cannot scope a question paper, a revision plan or
 * a gap report either.
 *
 * One curriculum per class-subject per academic session. The session is part of
 * the key because the same subject in the same class changes between years, and
 * a paper set last year must still resolve to the syllabus it was set from.
 */

const trimmed = (max: number) => z.string().trim().min(1).max(max)

export const curriculumCreateSchema = z.object({
  classSubjectId: z.string().min(1, 'Select a class and subject'),
  title: z.string().trim().max(120).optional(),
  board: z.string().trim().max(40).optional(),
  description: z.string().trim().max(2000).optional(),
})

export const curriculumUpdateSchema = z.object({
  title: z.string().trim().max(120).nullish(),
  board: z.string().trim().max(40).nullish(),
  description: z.string().trim().max(2000).nullish(),
  isPublished: z.boolean().optional(),
})

export const chapterCreateSchema = z.object({
  curriculumId: z.string().min(1),
  name: trimmed(160),
  code: z.string().trim().max(20).optional(),
  periods: z.coerce.number().int().min(0).max(500).optional(),
  description: z.string().trim().max(2000).optional(),
})

export const chapterUpdateSchema = chapterCreateSchema.omit({ curriculumId: true }).partial()

export const topicCreateSchema = z.object({
  chapterId: z.string().min(1),
  name: trimmed(160),
  summary: z.string().trim().max(4000).optional(),
  weightage: z.coerce.number().min(0).max(100).optional(),
})

export const topicUpdateSchema = topicCreateSchema.omit({ chapterId: true }).partial()

export const outcomeCreateSchema = z.object({
  topicId: z.string().min(1),
  statement: trimmed(400),
  bloomLevel: z
    .enum(['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE'])
    .optional(),
})

export const outcomeUpdateSchema = outcomeCreateSchema.omit({ topicId: true }).partial()

/** Reordering sends the whole sibling list, so positions can never collide. */
export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
})

export const curriculumFilterSchema = z.object({
  classLevelId: z.string().optional(),
  subjectId: z.string().optional(),
  published: z.enum(['true', 'false']).optional(),
})

export type CurriculumCreateInput = z.infer<typeof curriculumCreateSchema>
export type CurriculumFilter = z.infer<typeof curriculumFilterSchema>

function actor(ctx: AppContext) {
  return {
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    module: 'curriculum',
  }
}

async function currentSessionId(ctx: AppContext): Promise<string> {
  const session = await ctx.db.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  })
  if (!session) {
    throw new ApiException(
      409,
      'NO_ACTIVE_SESSION',
      'No active academic session. Create one in Settings before building a syllabus.',
    )
  }
  return session.id
}

/**
 * Every class-subject with its syllabus state for the current session.
 *
 * Deliberately class-subject-first rather than curriculum-first: the useful
 * question is "which of my subjects still have no syllabus", and a list of the
 * ones already entered cannot answer it.
 */
export async function listCoverage(ctx: AppContext, filter: CurriculumFilter = {}) {
  const sessionId = await currentSessionId(ctx)
  const allowed = await teachingClassSubjectIds(ctx)
  if (allowed !== null && allowed.length === 0) return []

  const portalClassLevels = allowed === null ? await accessibleClassLevelIds(ctx) : null
  if (portalClassLevels !== null && portalClassLevels.length === 0) return []

  const portalOnly = isPortalOnlyRole(ctx.user.roleKeys)

  const rows = await ctx.db.classSubject.findMany({
    where: {
      ...(allowed === null ? {} : { id: { in: allowed } }),
      ...(portalClassLevels === null ? {} : { classLevelId: { in: portalClassLevels } }),
      ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
      ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
      classLevel: { sessionId, deletedAt: null },
    },
    select: {
      id: true,
      classLevel: { select: { id: true, name: true, numeric: true } },
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
      curricula: {
        where: {
          sessionId,
          deletedAt: null,
          ...(portalOnly ? { isPublished: true } : {}),
        },
        select: {
          id: true,
          title: true,
          board: true,
          isPublished: true,
          updatedAt: true,
          _count: { select: { chapters: true } },
        },
        take: 1,
      },
    },
    orderBy: [{ classLevel: { numeric: 'asc' } }, { subject: { name: 'asc' } }],
  })

  // Portal users only see subjects that already have a published syllabus.
  const visible = portalOnly ? rows.filter((r) => r.curricula.length > 0) : rows

  // Topic counts in one grouped query rather than one per chapter.
  const curriculumIds = visible.flatMap((r) => r.curricula.map((c) => c.id))
  const topicCounts = new Map<string, number>()
  if (curriculumIds.length > 0) {
    const chapters = await ctx.db.chapter.findMany({
      where: { curriculumId: { in: curriculumIds }, deletedAt: null },
      select: { curriculumId: true, _count: { select: { topics: true } } },
    })
    for (const chapter of chapters) {
      topicCounts.set(
        chapter.curriculumId,
        (topicCounts.get(chapter.curriculumId) ?? 0) + chapter._count.topics,
      )
    }
  }

  return visible.map((row) => {
    const curriculum = row.curricula[0] ?? null
    return {
      classSubjectId: row.id,
      classLevel: row.classLevel,
      subject: row.subject,
      teacher: row.teacher
        ? { id: row.teacher.id, name: `${row.teacher.firstName} ${row.teacher.lastName}` }
        : null,
      curriculum: curriculum
        ? {
            id: curriculum.id,
            title: curriculum.title,
            board: curriculum.board,
            isPublished: curriculum.isPublished,
            updatedAt: curriculum.updatedAt,
            chapterCount: curriculum._count.chapters,
            topicCount: topicCounts.get(curriculum.id) ?? 0,
          }
        : null,
    }
  })
}

/** The full tree for one syllabus. One query, not one per chapter. */
export async function getCurriculum(ctx: AppContext, id: string) {
  const curriculum = await ctx.db.curriculum.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      title: true,
      board: true,
      description: true,
      isPublished: true,
      classSubjectId: true,
      updatedAt: true,
      classSubject: {
        select: {
          id: true,
          classLevel: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, code: true } },
        },
      },
      chapters: {
        where: { deletedAt: null },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          code: true,
          periods: true,
          description: true,
          position: true,
          topics: {
            where: { deletedAt: null },
            orderBy: [{ position: 'asc' }, { name: 'asc' }],
            select: {
              id: true,
              name: true,
              summary: true,
              weightage: true,
              position: true,
              outcomes: {
                where: { deletedAt: null },
                orderBy: [{ position: 'asc' }],
                select: { id: true, statement: true, bloomLevel: true, position: true },
              },
            },
          },
        },
      },
    },
  })

  if (!curriculum) throw notFound('Syllabus')
  await assertClassSubjectAccess(ctx, curriculum.classSubjectId)
  if (isPortalOnlyRole(ctx.user.roleKeys) && !curriculum.isPublished) {
    throw notFound('Syllabus')
  }
  return curriculum
}

export async function createCurriculum(ctx: AppContext, input: CurriculumCreateInput) {
  await assertClassSubjectAccess(ctx, input.classSubjectId)
  const sessionId = await currentSessionId(ctx)

  const classSubject = await ctx.db.classSubject.findFirst({
    where: { id: input.classSubjectId },
    select: {
      subject: { select: { name: true } },
      classLevel: { select: { name: true } },
    },
  })
  if (!classSubject) throw notFound('Class subject')

  const existing = await ctx.db.curriculum.findFirst({
    where: { sessionId, classSubjectId: input.classSubjectId, deletedAt: null },
    select: { id: true },
  })
  if (existing) {
    throw conflict('This subject already has a syllabus for the current session')
  }

  const created = await ctx.db.curriculum.create({
    data: {
      tenantId: ctx.tenant.id,
      sessionId,
      classSubjectId: input.classSubjectId,
      title: input.title ?? `${classSubject.subject.name} — ${classSubject.classLevel.name}`,
      board: input.board ?? null,
      description: input.description ?? null,
      createdById: ctx.user.userId,
    },
    select: { id: true, title: true },
  })

  await audit({
    ...actor(ctx),
    action: 'curriculum.create',
    entityType: 'Curriculum',
    entityId: created.id,
    summary: `Created syllabus ${created.title ?? created.id}`,
  })

  return created
}

export async function updateCurriculum(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof curriculumUpdateSchema>,
) {
  const existing = await ctx.db.curriculum.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, classSubjectId: true, isPublished: true, title: true },
  })
  if (!existing) throw notFound('Syllabus')
  await assertClassSubjectAccess(ctx, existing.classSubjectId)

  // Publishing is what makes a syllabus visible to paper generation, so an
  // empty one must not be publishable: it would silently narrow every paper set
  // from it to nothing.
  if (input.isPublished === true && !existing.isPublished) {
    const topics = await ctx.db.topic.count({
      where: { chapter: { curriculumId: id, deletedAt: null }, deletedAt: null },
    })
    if (topics === 0) {
      throw new ApiException(
        409,
        'EMPTY_CURRICULUM',
        'Add at least one topic before publishing this syllabus.',
      )
    }
  }

  const updated = await ctx.db.curriculum.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.board !== undefined ? { board: input.board } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
    },
    select: { id: true, title: true, isPublished: true },
  })

  await audit({
    ...actor(ctx),
    action: input.isPublished === undefined ? 'curriculum.update' : 'curriculum.publish',
    entityType: 'Curriculum',
    entityId: id,
    summary:
      input.isPublished === undefined
        ? `Updated syllabus ${updated.title ?? id}`
        : `${updated.isPublished ? 'Published' : 'Unpublished'} syllabus ${updated.title ?? id}`,
    before: { isPublished: existing.isPublished },
    after: { isPublished: updated.isPublished },
  })

  return updated
}

export async function deleteCurriculum(ctx: AppContext, id: string) {
  const existing = await ctx.db.curriculum.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, classSubjectId: true, title: true },
  })
  if (!existing) throw notFound('Syllabus')
  await assertClassSubjectAccess(ctx, existing.classSubjectId)

  await ctx.db.curriculum.update({ where: { id }, data: { deletedAt: new Date() } })
  await audit({
    ...actor(ctx),
    action: 'curriculum.delete',
    entityType: 'Curriculum',
    entityId: id,
    summary: `Deleted syllabus ${existing.title ?? id}`,
  })
}

/** Resolves the owning curriculum of a chapter and checks access in one step. */
async function chapterGuard(ctx: AppContext, chapterId: string) {
  const chapter = await ctx.db.chapter.findFirst({
    where: { id: chapterId, deletedAt: null },
    select: { id: true, name: true, curriculumId: true, curriculum: { select: { classSubjectId: true } } },
  })
  if (!chapter) throw notFound('Chapter')
  await assertClassSubjectAccess(ctx, chapter.curriculum.classSubjectId)
  return chapter
}

async function curriculumGuard(ctx: AppContext, curriculumId: string) {
  const curriculum = await ctx.db.curriculum.findFirst({
    where: { id: curriculumId, deletedAt: null },
    select: { id: true, classSubjectId: true },
  })
  if (!curriculum) throw notFound('Syllabus')
  await assertClassSubjectAccess(ctx, curriculum.classSubjectId)
  return curriculum
}

async function nextPosition(
  ctx: AppContext,
  model: 'chapter' | 'topic' | 'learningOutcome',
  where: Record<string, unknown>,
): Promise<number> {
  const last = await (ctx.db[model] as { findFirst: (args: unknown) => Promise<{ position: number } | null> }).findFirst({
    where: { ...where, deletedAt: null },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  return (last?.position ?? -1) + 1
}

export async function createChapter(ctx: AppContext, input: z.infer<typeof chapterCreateSchema>) {
  await curriculumGuard(ctx, input.curriculumId)

  const created = await ctx.db.chapter.create({
    data: {
      tenantId: ctx.tenant.id,
      curriculumId: input.curriculumId,
      name: input.name,
      code: input.code ?? null,
      periods: input.periods ?? null,
      description: input.description ?? null,
      position: await nextPosition(ctx, 'chapter', { curriculumId: input.curriculumId }),
    },
    select: { id: true, name: true, position: true },
  })

  await audit({
    ...actor(ctx),
    action: 'curriculum.chapter.create',
    entityType: 'Chapter',
    entityId: created.id,
    summary: `Added chapter ${created.name}`,
  })
  return created
}

export async function updateChapter(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof chapterUpdateSchema>,
) {
  const chapter = await chapterGuard(ctx, id)
  const updated = await ctx.db.chapter.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code ?? null } : {}),
      ...(input.periods !== undefined ? { periods: input.periods ?? null } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    },
    select: { id: true, name: true },
  })
  await audit({
    ...actor(ctx),
    action: 'curriculum.chapter.update',
    entityType: 'Chapter',
    entityId: id,
    summary: `Updated chapter ${chapter.name}`,
  })
  return updated
}

export async function deleteChapter(ctx: AppContext, id: string) {
  const chapter = await chapterGuard(ctx, id)
  // Soft delete cascades by hand: topics and outcomes stay queryable for any
  // paper already set from them, but disappear from the syllabus.
  await ctx.db.$transaction([
    ctx.db.chapter.update({ where: { id }, data: { deletedAt: new Date() } }),
    ctx.db.topic.updateMany({ where: { chapterId: id }, data: { deletedAt: new Date() } }),
  ])
  await audit({
    ...actor(ctx),
    action: 'curriculum.chapter.delete',
    entityType: 'Chapter',
    entityId: id,
    summary: `Deleted chapter ${chapter.name}`,
  })
}

export async function createTopic(ctx: AppContext, input: z.infer<typeof topicCreateSchema>) {
  await chapterGuard(ctx, input.chapterId)

  const created = await ctx.db.topic.create({
    data: {
      tenantId: ctx.tenant.id,
      chapterId: input.chapterId,
      name: input.name,
      summary: input.summary ?? null,
      weightage: input.weightage ?? null,
      position: await nextPosition(ctx, 'topic', { chapterId: input.chapterId }),
    },
    select: { id: true, name: true, position: true },
  })

  await audit({
    ...actor(ctx),
    action: 'curriculum.topic.create',
    entityType: 'Topic',
    entityId: created.id,
    summary: `Added topic ${created.name}`,
  })
  return created
}

async function topicGuard(ctx: AppContext, topicId: string) {
  const topic = await ctx.db.topic.findFirst({
    where: { id: topicId, deletedAt: null },
    select: {
      id: true,
      name: true,
      chapter: { select: { curriculum: { select: { classSubjectId: true } } } },
    },
  })
  if (!topic) throw notFound('Topic')
  await assertClassSubjectAccess(ctx, topic.chapter.curriculum.classSubjectId)
  return topic
}

export async function updateTopic(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof topicUpdateSchema>,
) {
  const topic = await topicGuard(ctx, id)
  const updated = await ctx.db.topic.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.summary !== undefined ? { summary: input.summary ?? null } : {}),
      ...(input.weightage !== undefined ? { weightage: input.weightage ?? null } : {}),
    },
    select: { id: true, name: true },
  })
  await audit({
    ...actor(ctx),
    action: 'curriculum.topic.update',
    entityType: 'Topic',
    entityId: id,
    summary: `Updated topic ${topic.name}`,
  })
  return updated
}

export async function deleteTopic(ctx: AppContext, id: string) {
  const topic = await topicGuard(ctx, id)
  await ctx.db.topic.update({ where: { id }, data: { deletedAt: new Date() } })
  await audit({
    ...actor(ctx),
    action: 'curriculum.topic.delete',
    entityType: 'Topic',
    entityId: id,
    summary: `Deleted topic ${topic.name}`,
  })
}

export async function createOutcome(ctx: AppContext, input: z.infer<typeof outcomeCreateSchema>) {
  await topicGuard(ctx, input.topicId)
  const created = await ctx.db.learningOutcome.create({
    data: {
      tenantId: ctx.tenant.id,
      topicId: input.topicId,
      statement: input.statement,
      bloomLevel: input.bloomLevel ?? null,
      position: await nextPosition(ctx, 'learningOutcome', { topicId: input.topicId }),
    },
    select: { id: true, statement: true },
  })
  await audit({
    ...actor(ctx),
    action: 'curriculum.outcome.create',
    entityType: 'LearningOutcome',
    entityId: created.id,
    summary: 'Added learning outcome',
  })
  return created
}

export async function deleteOutcome(ctx: AppContext, id: string) {
  const outcome = await ctx.db.learningOutcome.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      topic: { select: { chapter: { select: { curriculum: { select: { classSubjectId: true } } } } } },
    },
  })
  if (!outcome) throw notFound('Learning outcome')
  await assertClassSubjectAccess(ctx, outcome.topic.chapter.curriculum.classSubjectId)

  await ctx.db.learningOutcome.update({ where: { id }, data: { deletedAt: new Date() } })
  await audit({
    ...actor(ctx),
    action: 'curriculum.outcome.delete',
    entityType: 'LearningOutcome',
    entityId: id,
    summary: 'Deleted learning outcome',
  })
}

/**
 * Reordering takes the complete sibling list and rewrites positions from it.
 *
 * Sending one moved id and a target index would need the server to reconcile
 * against positions the client may already have stale, and two teachers
 * dragging at once would interleave. Rewriting the whole list is one
 * transaction and the last writer simply wins, which is the correct outcome for
 * an ordering nobody else is reading mid-drag.
 */
export async function reorderChapters(ctx: AppContext, curriculumId: string, ids: string[]) {
  await curriculumGuard(ctx, curriculumId)
  const owned = await ctx.db.chapter.findMany({
    where: { curriculumId, deletedAt: null },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((c) => c.id))
  if (ids.length !== ownedIds.size || ids.some((id) => !ownedIds.has(id))) {
    throw new ApiException(400, 'BAD_ORDER', 'The chapter list does not match this syllabus')
  }

  await ctx.db.$transaction(
    ids.map((id, position) => ctx.db.chapter.update({ where: { id }, data: { position } })),
  )
  await audit({
    ...actor(ctx),
    action: 'curriculum.chapter.reorder',
    entityType: 'Curriculum',
    entityId: curriculumId,
    summary: `Reordered ${ids.length} chapters`,
  })
}

export async function reorderTopics(ctx: AppContext, chapterId: string, ids: string[]) {
  await chapterGuard(ctx, chapterId)
  const owned = await ctx.db.topic.findMany({
    where: { chapterId, deletedAt: null },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((t) => t.id))
  if (ids.length !== ownedIds.size || ids.some((id) => !ownedIds.has(id))) {
    throw new ApiException(400, 'BAD_ORDER', 'The topic list does not match this chapter')
  }

  await ctx.db.$transaction(
    ids.map((id, position) => ctx.db.topic.update({ where: { id }, data: { position } })),
  )
  await audit({
    ...actor(ctx),
    action: 'curriculum.topic.reorder',
    entityType: 'Chapter',
    entityId: chapterId,
    summary: `Reordered ${ids.length} topics`,
  })
}

/**
 * The published syllabus scope for paper generation.
 *
 * Phase B onwards calls this rather than reading chapters directly, so there is
 * one definition of "what may a question be set from" and it excludes drafts.
 */
export async function publishedTopics(ctx: AppContext, classSubjectId: string, chapterIds?: string[]) {
  const sessionId = await currentSessionId(ctx)
  return ctx.db.topic.findMany({
    where: {
      deletedAt: null,
      ...(chapterIds && chapterIds.length > 0 ? { chapterId: { in: chapterIds } } : {}),
      chapter: {
        deletedAt: null,
        curriculum: { classSubjectId, sessionId, isPublished: true, deletedAt: null },
      },
    },
    orderBy: [{ chapter: { position: 'asc' } }, { position: 'asc' }],
    select: {
      id: true,
      name: true,
      summary: true,
      chapter: { select: { id: true, name: true, code: true } },
      outcomes: { where: { deletedAt: null }, select: { statement: true, bloomLevel: true } },
    },
  })
}

/**
 * Every topic for a class-subject, chapter by chapter, published or not.
 *
 * Tagging a question is not setting a paper: a teacher writing questions while
 * the syllabus is still a draft must be able to file them correctly, and
 * `publishedTopics()` remains the stricter gate for generation.
 */
export async function listTopicsFor(ctx: AppContext, classSubjectId: string) {
  await assertClassSubjectAccess(ctx, classSubjectId)
  const sessionId = await currentSessionId(ctx)

  return ctx.db.chapter.findMany({
    where: {
      deletedAt: null,
      curriculum: { classSubjectId, sessionId, deletedAt: null },
    },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      code: true,
      topics: {
        where: { deletedAt: null },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      },
    },
  })
}
