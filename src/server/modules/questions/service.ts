import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, notFound } from '@/server/api/response'
import { sha256 } from '@/server/crypto'
import { assertClassSubjectAccess, teachingClassSubjectIds } from '@/server/scope'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'
import {
  BLOOM_LEVELS,
  DIFFICULTIES,
  OBJECTIVE_TYPES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
} from '@/lib/questions'

export { QUESTION_TYPE_LABEL, OBJECTIVE_TYPES } from '@/lib/questions'
export type { QuestionTypeKey } from '@/lib/questions'

/**
 * The question bank.
 *
 * A question belongs to a class-subject, not to a curriculum: the syllabus is
 * revised each session and a question that outlives the revision should not have to
 * be re-entered. Topic tags carry the syllabus link, and they are many-to-many
 * because a case study legitimately spans topics — a paper set from "chapters
 * 1-3" still has to find it.
 */

const optionSchema = z.object({
  text: z.string().trim().min(1, 'An option cannot be empty').max(500),
  isCorrect: z.boolean().default(false),
  matchWith: z.string().trim().max(500).optional(),
})

const questionBase = z.object({
  classSubjectId: z.string().min(1, 'Select a class and subject'),
  text: z.string().trim().min(5, 'Write the question').max(6000),
  type: z.enum(QUESTION_TYPES),
  difficulty: z.enum(DIFFICULTIES).default('MEDIUM'),
  marks: z.coerce.number().min(0.5, 'Marks must be at least 0.5').max(100),
  bloomLevel: z
    .enum(BLOOM_LEVELS)
    .optional(),
  solution: z.string().trim().max(6000).optional(),
  explanation: z.string().trim().max(6000).optional(),
  source: z.string().trim().max(200).optional(),
  isShared: z.boolean().default(false),
  topicIds: z.array(z.string().min(1)).max(20).default([]),
  options: z.array(optionSchema).max(12).default([]),
})

/**
 * Type-specific rules.
 *
 * An MCQ with no correct option is not a question, it is a trap — and it would
 * mark every student wrong once auto-scoring exists in Phase F. Validating here
 * rather than at scoring time means the bad question cannot be saved at all.
 */
function refineForType(value: z.infer<typeof questionBase>, ctx: z.RefinementCtx) {
  const optionCount = value.options.length
  const correct = value.options.filter((o) => o.isCorrect).length

  if (value.type === 'MCQ' || value.type === 'ASSERTION_REASON') {
    if (optionCount < 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least two options' })
    }
    if (correct < 1) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Mark the correct option' })
    }
  }

  if (value.type === 'TRUE_FALSE' && optionCount !== 0 && optionCount !== 2) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: 'A true or false question has exactly two options',
    })
  }

  if (value.type === 'MATCH') {
    if (optionCount < 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least two pairs' })
    }
    if (value.options.some((o) => !o.matchWith)) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Every left-hand item needs its match',
      })
    }
  }

  // Anything marked by reading an answer needs the marking scheme recorded, or
  // the evaluator in Phase F has nothing to show the teacher.
  const subjective = !OBJECTIVE_TYPES.includes(value.type) && value.type !== 'FILL_BLANK'
  if (subjective && value.marks >= 3 && !value.solution) {
    ctx.addIssue({
      code: 'custom',
      path: ['solution'],
      message: 'Add the expected answer points for a question worth 3 marks or more',
    })
  }
}

export const questionCreateSchema = questionBase.superRefine(refineForType)
export const questionUpdateSchema = questionBase.partial().omit({ classSubjectId: true })

export const questionFilterSchema = z.object({
  classSubjectId: z.string().optional(),
  classLevelId: z.string().optional(),
  subjectId: z.string().optional(),
  topicId: z.string().optional(),
  chapterId: z.string().optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  bloomLevel: z
    .enum(BLOOM_LEVELS)
    .optional(),
  origin: z.enum(['MANUAL', 'AI', 'IMPORTED']).optional(),
  status: z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']).optional(),
  mine: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(120).optional(),
})

export const similarSchema = z.object({
  classSubjectId: z.string().min(1),
  text: z.string().trim().min(5).max(6000),
  excludeId: z.string().optional(),
})

export type QuestionCreateInput = z.infer<typeof questionCreateSchema>
export type QuestionFilter = z.infer<typeof questionFilterSchema>

/**
 * Normalised form for duplicate detection.
 *
 * Lowercased, punctuation stripped, whitespace collapsed. "State Newton's
 * second law." and "state newtons second law" then land on the same
 * fingerprint, which is the overwhelming majority of accidental repeats —
 * someone retyping a question they already entered last term.
 */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function fingerprintOf(text: string): string {
  return sha256(normalizeQuestion(text))
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'is', 'are', 'and', 'or', 'to', 'in', 'on', 'for',
  'what', 'which', 'write', 'state', 'give', 'explain', 'describe', 'define',
  'following', 'with', 'from', 'by', 'that', 'this', 'it', 'as', 'at', 'be',
])

function tokens(text: string): Set<string> {
  return new Set(
    normalizeQuestion(text)
      .split(' ')
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  )
}

/** Jaccard overlap of content words, 0–1. */
export function similarity(a: string, b: string): number {
  const left = tokens(a)
  const right = tokens(b)
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / (left.size + right.size - shared)
}

/** Anything at or above this reads as "you have already asked this". */
export const SIMILARITY_THRESHOLD = 0.6

/**
 * Questions in the same class-subject that look like this one.
 *
 * Exact fingerprint matches first, then token overlap over the rest. The
 * candidate set is one class-subject, so this stays a bounded scan rather than
 * a comparison against the whole bank.
 */
export async function findSimilar(ctx: AppContext, input: z.infer<typeof similarSchema>) {
  await assertClassSubjectAccess(ctx, input.classSubjectId)

  const candidates = await ctx.db.question.findMany({
    where: {
      classSubjectId: input.classSubjectId,
      deletedAt: null,
      status: { not: 'ARCHIVED' },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true, text: true, type: true, marks: true, difficulty: true, fingerprint: true },
    take: 1000,
  })

  const fingerprint = fingerprintOf(input.text)

  return candidates
    .map((candidate) => ({
      question: candidate,
      score: candidate.fingerprint === fingerprint ? 1 : similarity(input.text, candidate.text),
    }))
    .filter((row) => row.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => ({
      id: row.question.id,
      text: row.question.text,
      type: row.question.type,
      marks: row.question.marks,
      difficulty: row.question.difficulty,
      score: Math.round(row.score * 100) / 100,
      exact: row.score === 1,
    }))
}

function actor(ctx: AppContext) {
  return {
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    module: 'questionbank',
  }
}

const SORTABLE = ['createdAt', 'marks', 'difficulty', 'type'] as const

export async function listQuestions(ctx: AppContext, query: ListQuery, filter: QuestionFilter) {
  const allowed = await teachingClassSubjectIds(ctx)
  if (allowed !== null && allowed.length === 0) return { rows: [], total: 0 }

  const where = {
    deletedAt: null,
    ...(allowed === null ? {} : { classSubjectId: { in: allowed } }),
    ...(filter.classSubjectId ? { classSubjectId: filter.classSubjectId } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.difficulty ? { difficulty: filter.difficulty } : {}),
    ...(filter.bloomLevel ? { bloomLevel: filter.bloomLevel } : {}),
    ...(filter.origin ? { origin: filter.origin } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.mine === 'true' ? { createdById: ctx.user.userId } : {}),
    ...(filter.q ? { text: { contains: filter.q, mode: 'insensitive' as const } } : {}),
    ...(filter.classLevelId || filter.subjectId
      ? {
          classSubject: {
            ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
            ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
          },
        }
      : {}),
    ...(filter.topicId ? { topics: { some: { topicId: filter.topicId } } } : {}),
    ...(filter.chapterId
      ? { topics: { some: { topic: { chapterId: filter.chapterId } } } }
      : {}),
  }

  const [rows, total] = await Promise.all([
    ctx.db.question.findMany({
      where,
      ...skipTake(query),
      orderBy: orderByFrom(query.sort, query.dir, SORTABLE, { createdAt: 'desc' }),
      select: {
        id: true,
        text: true,
        type: true,
        difficulty: true,
        marks: true,
        bloomLevel: true,
        origin: true,
        status: true,
        isShared: true,
        createdAt: true,
        classSubject: {
          select: {
            classLevel: { select: { name: true } },
            subject: { select: { name: true } },
          },
        },
        topics: { select: { topic: { select: { id: true, name: true } } } },
        _count: { select: { options: true } },
      },
    }),
    ctx.db.question.count({ where }),
  ])

  return { rows, total }
}

export async function getQuestion(ctx: AppContext, id: string) {
  const question = await ctx.db.question.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      text: true,
      type: true,
      difficulty: true,
      marks: true,
      bloomLevel: true,
      solution: true,
      explanation: true,
      source: true,
      origin: true,
      status: true,
      isShared: true,
      classSubjectId: true,
      options: {
        orderBy: { position: 'asc' },
        select: { id: true, text: true, isCorrect: true, matchWith: true, position: true },
      },
      topics: { select: { topic: { select: { id: true, name: true } } } },
    },
  })
  if (!question) throw notFound('Question')
  await assertClassSubjectAccess(ctx, question.classSubjectId)
  return question
}

/** Topics must belong to the same class-subject, or a tag would cross subjects. */
async function assertTopicsBelong(ctx: AppContext, classSubjectId: string, topicIds: string[]) {
  if (topicIds.length === 0) return
  const valid = await ctx.db.topic.count({
    where: {
      id: { in: topicIds },
      deletedAt: null,
      chapter: { deletedAt: null, curriculum: { classSubjectId, deletedAt: null } },
    },
  })
  if (valid !== topicIds.length) {
    throw new ApiException(
      400,
      'BAD_TOPICS',
      'One or more topics do not belong to this subject’s syllabus',
    )
  }
}

export async function createQuestion(ctx: AppContext, input: QuestionCreateInput) {
  await assertClassSubjectAccess(ctx, input.classSubjectId)
  await assertTopicsBelong(ctx, input.classSubjectId, input.topicIds)

  const created = await ctx.db.question.create({
    data: {
      tenantId: ctx.tenant.id,
      classSubjectId: input.classSubjectId,
      text: input.text,
      type: input.type,
      difficulty: input.difficulty,
      marks: input.marks,
      bloomLevel: input.bloomLevel ?? null,
      solution: input.solution ?? null,
      explanation: input.explanation ?? null,
      source: input.source ?? null,
      isShared: input.isShared,
      fingerprint: fingerprintOf(input.text),
      createdById: ctx.user.userId,
      options: {
        create: input.options.map((option, position) => ({
          tenantId: ctx.tenant.id,
          text: option.text,
          isCorrect: option.isCorrect,
          matchWith: option.matchWith ?? null,
          position,
        })),
      },
      topics: {
        create: input.topicIds.map((topicId) => ({ tenantId: ctx.tenant.id, topicId })),
      },
    },
    select: { id: true, text: true },
  })

  await audit({
    ...actor(ctx),
    action: 'question.create',
    entityType: 'Question',
    entityId: created.id,
    summary: `Added a ${QUESTION_TYPE_LABEL[input.type].toLowerCase()} question`,
  })

  return created
}

export async function updateQuestion(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof questionUpdateSchema>,
) {
  const existing = await ctx.db.question.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, classSubjectId: true, status: true },
  })
  if (!existing) throw notFound('Question')
  await assertClassSubjectAccess(ctx, existing.classSubjectId)

  if (input.topicIds) {
    await assertTopicsBelong(ctx, existing.classSubjectId, input.topicIds)
  }

  const updated = await ctx.db.$transaction(async (tx) => {
    if (input.options) {
      await tx.questionOption.deleteMany({ where: { questionId: id } })
      await tx.questionOption.createMany({
        data: input.options.map((option, position) => ({
          tenantId: ctx.tenant.id,
          questionId: id,
          text: option.text,
          isCorrect: option.isCorrect ?? false,
          matchWith: option.matchWith ?? null,
          position,
        })),
      })
    }

    if (input.topicIds) {
      await tx.questionTopic.deleteMany({ where: { questionId: id } })
      await tx.questionTopic.createMany({
        data: input.topicIds.map((topicId) => ({
          tenantId: ctx.tenant.id,
          questionId: id,
          topicId,
        })),
      })
    }

    return tx.question.update({
      where: { id },
      data: {
        ...(input.text !== undefined
          ? { text: input.text, fingerprint: fingerprintOf(input.text) }
          : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
        ...(input.marks !== undefined ? { marks: input.marks } : {}),
        ...(input.bloomLevel !== undefined ? { bloomLevel: input.bloomLevel ?? null } : {}),
        ...(input.solution !== undefined ? { solution: input.solution ?? null } : {}),
        ...(input.explanation !== undefined ? { explanation: input.explanation ?? null } : {}),
        ...(input.source !== undefined ? { source: input.source ?? null } : {}),
        ...(input.isShared !== undefined ? { isShared: input.isShared } : {}),
      },
      select: { id: true, text: true },
    })
  })

  await audit({
    ...actor(ctx),
    action: 'question.update',
    entityType: 'Question',
    entityId: id,
    summary: 'Updated a question',
  })

  return updated
}

/**
 * Approving a draft. Separate from update because it is the gate AI output has
 * to pass, and a gate that shares an endpoint with ordinary editing is a gate
 * that gets opened by accident.
 */
export async function setQuestionStatus(
  ctx: AppContext,
  id: string,
  status: 'DRAFT' | 'APPROVED' | 'ARCHIVED',
) {
  const existing = await ctx.db.question.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, classSubjectId: true, status: true, origin: true },
  })
  if (!existing) throw notFound('Question')
  await assertClassSubjectAccess(ctx, existing.classSubjectId)

  const updated = await ctx.db.question.update({
    where: { id },
    data: { status },
    select: { id: true, status: true },
  })

  await audit({
    ...actor(ctx),
    action: 'question.status',
    entityType: 'Question',
    entityId: id,
    summary: `Question moved to ${status.toLowerCase()}`,
    before: { status: existing.status },
    after: { status },
  })

  return updated
}

export async function deleteQuestion(ctx: AppContext, id: string) {
  const existing = await ctx.db.question.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, classSubjectId: true },
  })
  if (!existing) throw notFound('Question')
  await assertClassSubjectAccess(ctx, existing.classSubjectId)

  await ctx.db.question.update({ where: { id }, data: { deletedAt: new Date() } })
  await audit({
    ...actor(ctx),
    action: 'question.delete',
    entityType: 'Question',
    entityId: id,
    summary: 'Deleted a question',
  })
}

/** Counts by type and difficulty, for the bank header and later for blueprints. */
export async function bankSummary(ctx: AppContext, classSubjectId?: string) {
  const allowed = await teachingClassSubjectIds(ctx)
  if (allowed !== null && allowed.length === 0) {
    return { total: 0, byDifficulty: {}, byType: {} }
  }

  const where = {
    deletedAt: null,
    status: 'APPROVED' as const,
    ...(allowed === null ? {} : { classSubjectId: { in: allowed } }),
    ...(classSubjectId ? { classSubjectId } : {}),
  }

  const [total, byDifficulty, byType] = await Promise.all([
    ctx.db.question.count({ where }),
    ctx.db.question.groupBy({ by: ['difficulty'], where, _count: { _all: true } }),
    ctx.db.question.groupBy({ by: ['type'], where, _count: { _all: true } }),
  ])

  return {
    total,
    byDifficulty: Object.fromEntries(byDifficulty.map((r) => [r.difficulty, r._count._all])),
    byType: Object.fromEntries(byType.map((r) => [r.type, r._count._all])),
  }
}
