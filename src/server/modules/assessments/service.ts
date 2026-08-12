import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { assertClassSubjectAccess, teachingClassSubjectIds } from '@/server/scope'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'
import { DEFAULT_ASSESSMENT_TYPES } from '@/lib/assessments'

/**
 * Question papers.
 *
 * Deliberately not `Exam`. An exam is the formal instrument a report card is
 * computed from; an assessment is any paper a teacher sets, most of which
 * should never reach a parent. Keeping them apart is what lets a fortnightly
 * practice test be used freely — and it is why a result is promoted into the
 * gradebook by an explicit act rather than by existing.
 */

export const assessmentCreateSchema = z.object({
  classSubjectId: z.string().min(1, 'Select a class and subject'),
  sectionId: z.string().optional(),
  assessmentTypeId: z.string().min(1, 'Choose the kind of test'),
  title: z.string().trim().min(3, 'Give the paper a title').max(160),
  totalMarks: z.coerce.number().min(1, 'Total marks must be at least 1').max(500),
  durationMinutes: z.coerce.number().int().min(5, 'At least five minutes').max(360),
  instructions: z.string().trim().max(4000).optional(),
  templateId: z.string().optional(),
})

export const assessmentUpdateSchema = assessmentCreateSchema
  .omit({ classSubjectId: true })
  .partial()
  .extend({ answerKeyNotes: z.string().trim().max(4000).nullish() })

export const sectionCreateSchema = z.object({
  assessmentId: z.string().min(1),
  title: z.string().trim().min(1, 'Name the section').max(80),
  instructions: z.string().trim().max(1000).optional(),
})

export const sectionUpdateSchema = sectionCreateSchema.omit({ assessmentId: true }).partial()

export const placeSchema = z.object({
  sectionId: z.string().min(1),
  questionIds: z.array(z.string().min(1)).min(1).max(100),
})

export const placementUpdateSchema = z.object({
  marks: z.coerce.number().min(0.5).max(100).optional(),
  answerSnapshot: z.string().trim().max(6000).nullish(),
  textSnapshot: z.string().trim().min(5).max(6000).optional(),
})

export const reorderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(300) })

export const assessmentFilterSchema = z.object({
  classSubjectId: z.string().optional(),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'ASSIGNED', 'CLOSED']).optional(),
  assessmentTypeId: z.string().optional(),
  mine: z.enum(['true', 'false']).optional(),
})

export type AssessmentCreateInput = z.infer<typeof assessmentCreateSchema>
export type AssessmentFilter = z.infer<typeof assessmentFilterSchema>

function actor(ctx: AppContext) {
  return {
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    module: 'assessments',
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
      'No active academic session. Create one in Settings before setting a paper.',
    )
  }
  return session.id
}

/**
 * The test types a school can choose from.
 *
 * Seeded on first read rather than by a migration, because they are per-tenant
 * rows and a migration that writes tenant data has to be re-run for every
 * school created afterwards. Idempotent: a school that has renamed or
 * deactivated one keeps its version.
 */
export async function listAssessmentTypes(ctx: AppContext, includeInactive = false) {
  const existing = await ctx.db.assessmentType.findMany({
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
  })

  if (existing.length === 0) {
    await ctx.db.assessmentType.createMany({
      data: DEFAULT_ASSESSMENT_TYPES.map((type, position) => ({
        tenantId: ctx.tenant.id,
        key: type.key,
        name: type.name,
        marks: type.marks ?? null,
        minutes: type.minutes ?? null,
        isSystem: true,
        position,
      })),
      skipDuplicates: true,
    })
    return ctx.db.assessmentType.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] })
  }

  return includeInactive ? existing : existing.filter((type) => type.isActive)
}

const SORTABLE = ['createdAt', 'title', 'totalMarks'] as const

export async function listAssessments(
  ctx: AppContext,
  query: ListQuery,
  filter: AssessmentFilter,
) {
  const allowed = await teachingClassSubjectIds(ctx)
  if (allowed !== null && allowed.length === 0) return { rows: [], total: 0 }

  const where: Prisma.AssessmentWhereInput = {
    deletedAt: null,
    ...(allowed === null ? {} : { classSubjectId: { in: allowed } }),
    ...(filter.classSubjectId ? { classSubjectId: filter.classSubjectId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.assessmentTypeId ? { assessmentTypeId: filter.assessmentTypeId } : {}),
    ...(filter.mine === 'true' ? { createdById: ctx.user.userId } : {}),
  }

  const [rows, total] = await Promise.all([
    ctx.db.assessment.findMany({
      where,
      ...skipTake(query),
      orderBy: orderByFrom(query.sort, query.dir, SORTABLE, { createdAt: 'desc' }),
      select: {
        id: true,
        title: true,
        totalMarks: true,
        durationMinutes: true,
        status: true,
        setLabel: true,
        parentId: true,
        createdAt: true,
        type: { select: { name: true } },
        classSubject: {
          select: {
            classLevel: { select: { name: true } },
            subject: { select: { name: true } },
          },
        },
        section: { select: { name: true } },
        _count: { select: { questions: true } },
      },
    }),
    ctx.db.assessment.count({ where }),
  ])

  return { rows, total }
}

const FULL_SELECT = {
  id: true,
  title: true,
  totalMarks: true,
  durationMinutes: true,
  instructions: true,
  answerKeyNotes: true,
  status: true,
  setLabel: true,
  parentId: true,
  classSubjectId: true,
  templateId: true,
  approvedAt: true,
  createdAt: true,
  type: { select: { id: true, name: true } },
  classSubject: {
    select: {
      id: true,
      classLevel: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
    },
  },
  section: { select: { id: true, name: true } },
  template: {
    select: {
      id: true,
      name: true,
      headingOverride: true,
      showLogo: true,
      showStudentName: true,
      showRollNumber: true,
      showDate: true,
      generalInstructions: true,
      footerNote: true,
    },
  },
  sections: {
    orderBy: { position: 'asc' as const },
    select: {
      id: true,
      title: true,
      instructions: true,
      position: true,
      questions: {
        orderBy: { position: 'asc' as const },
        select: {
          id: true,
          position: true,
          marks: true,
          textSnapshot: true,
          optionsSnapshot: true,
          answerSnapshot: true,
          typeSnapshot: true,
          difficultySnapshot: true,
          questionId: true,
        },
      },
    },
  },
}

export async function getAssessment(ctx: AppContext, id: string) {
  const assessment = await ctx.db.assessment.findFirst({
    where: { id, deletedAt: null },
    select: FULL_SELECT,
  })
  if (!assessment) throw notFound('Paper')
  await assertClassSubjectAccess(ctx, assessment.classSubjectId)
  return assessment
}

/**
 * Declared marks against placed marks.
 *
 * The teacher declares a total up front — "this is a 40-mark unit test" — and
 * then places questions. Those two numbers drift constantly while a paper is
 * being built, which is fine; what is not fine is printing a paper headed
 * "Maximum Marks: 40" that adds up to 38. This is the number the builder shows
 * and the check that approval refuses to skip.
 */
export function blueprintOf(assessment: {
  totalMarks: number
  sections: { questions: { marks: number; typeSnapshot: string; difficultySnapshot: string }[] }[]
}) {
  const questions = assessment.sections.flatMap((section) => section.questions)
  const placed = questions.reduce((sum, question) => sum + question.marks, 0)

  const byType: Record<string, number> = {}
  const byDifficulty: Record<string, number> = {}
  for (const question of questions) {
    byType[question.typeSnapshot] = (byType[question.typeSnapshot] ?? 0) + 1
    byDifficulty[question.difficultySnapshot] =
      (byDifficulty[question.difficultySnapshot] ?? 0) + 1
  }

  return {
    declared: assessment.totalMarks,
    placed: Math.round(placed * 100) / 100,
    difference: Math.round((placed - assessment.totalMarks) * 100) / 100,
    balanced: Math.abs(placed - assessment.totalMarks) < 0.001,
    questionCount: questions.length,
    byType,
    byDifficulty,
  }
}

export async function createAssessment(ctx: AppContext, input: AssessmentCreateInput) {
  await assertClassSubjectAccess(ctx, input.classSubjectId)
  const sessionId = await currentSessionId(ctx)

  const template =
    input.templateId ??
    (await ctx.db.paperTemplate.findFirst({
      where: { isDefault: true, deletedAt: null },
      select: { id: true },
    }))?.id

  const created = await ctx.db.assessment.create({
    data: {
      tenantId: ctx.tenant.id,
      sessionId,
      classSubjectId: input.classSubjectId,
      sectionId: input.sectionId ?? null,
      assessmentTypeId: input.assessmentTypeId,
      templateId: template ?? null,
      title: input.title,
      totalMarks: input.totalMarks,
      durationMinutes: input.durationMinutes,
      instructions: input.instructions ?? null,
      createdById: ctx.user.userId,
      // One section to start. A paper with no section has nowhere to put a
      // question, and making the teacher create one before they can begin is
      // ceremony rather than a choice.
      sections: {
        create: [{ tenantId: ctx.tenant.id, title: 'Section A', position: 0 }],
      },
    },
    select: { id: true, title: true },
  })

  await audit({
    ...actor(ctx),
    action: 'assessment.create',
    entityType: 'Assessment',
    entityId: created.id,
    summary: `Started paper ${created.title}`,
  })

  return created
}

/** Papers that have been sat must not be edited; approval is the line. */
async function assertEditable(ctx: AppContext, id: string) {
  const assessment = await ctx.db.assessment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, classSubjectId: true, status: true, title: true },
  })
  if (!assessment) throw notFound('Paper')
  await assertClassSubjectAccess(ctx, assessment.classSubjectId)

  if (assessment.status === 'ASSIGNED' || assessment.status === 'CLOSED') {
    throw conflict('This paper has already been assigned and can no longer be changed')
  }
  return assessment
}

export async function updateAssessment(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof assessmentUpdateSchema>,
) {
  await assertEditable(ctx, id)

  const updated = await ctx.db.assessment.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.totalMarks !== undefined ? { totalMarks: input.totalMarks } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions ?? null } : {}),
      ...(input.answerKeyNotes !== undefined ? { answerKeyNotes: input.answerKeyNotes ?? null } : {}),
      ...(input.assessmentTypeId !== undefined ? { assessmentTypeId: input.assessmentTypeId } : {}),
      ...(input.templateId !== undefined ? { templateId: input.templateId ?? null } : {}),
      ...(input.sectionId !== undefined ? { sectionId: input.sectionId ?? null } : {}),
    },
    select: { id: true, title: true },
  })

  await audit({
    ...actor(ctx),
    action: 'assessment.update',
    entityType: 'Assessment',
    entityId: id,
    summary: `Updated paper ${updated.title}`,
  })

  return updated
}

export async function deleteAssessment(ctx: AppContext, id: string) {
  const assessment = await assertEditable(ctx, id)
  await ctx.db.assessment.update({ where: { id }, data: { deletedAt: new Date() } })
  await audit({
    ...actor(ctx),
    action: 'assessment.delete',
    entityType: 'Assessment',
    entityId: id,
    summary: `Deleted paper ${assessment.title}`,
  })
}

export async function createSection(ctx: AppContext, input: z.infer<typeof sectionCreateSchema>) {
  await assertEditable(ctx, input.assessmentId)

  const last = await ctx.db.assessmentSection.findFirst({
    where: { assessmentId: input.assessmentId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })

  const created = await ctx.db.assessmentSection.create({
    data: {
      tenantId: ctx.tenant.id,
      assessmentId: input.assessmentId,
      title: input.title,
      instructions: input.instructions ?? null,
      position: (last?.position ?? -1) + 1,
    },
    select: { id: true, title: true },
  })

  await audit({
    ...actor(ctx),
    action: 'assessment.section.create',
    entityType: 'AssessmentSection',
    entityId: created.id,
    summary: `Added ${created.title}`,
  })
  return created
}

async function sectionGuard(ctx: AppContext, sectionId: string) {
  const section = await ctx.db.assessmentSection.findFirst({
    where: { id: sectionId },
    select: { id: true, assessmentId: true, title: true },
  })
  if (!section) throw notFound('Section')
  await assertEditable(ctx, section.assessmentId)
  return section
}

export async function updateSection(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof sectionUpdateSchema>,
) {
  await sectionGuard(ctx, id)
  return ctx.db.assessmentSection.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions ?? null } : {}),
    },
    select: { id: true, title: true },
  })
}

export async function deleteSection(ctx: AppContext, id: string) {
  const section = await sectionGuard(ctx, id)
  await ctx.db.assessmentSection.delete({ where: { id } })
  await audit({
    ...actor(ctx),
    action: 'assessment.section.delete',
    entityType: 'AssessmentSection',
    entityId: id,
    summary: `Removed ${section.title}`,
  })
}

/**
 * Places bank questions into a section.
 *
 * The text, options and answer are copied at this moment. A paper that has been
 * sat is a record: if a colleague later fixes a typo in the bank or archives
 * the question, last term's paper and the answers marked against it must not
 * change underneath it.
 */
export async function placeQuestions(ctx: AppContext, input: z.infer<typeof placeSchema>) {
  const section = await sectionGuard(ctx, input.sectionId)

  const assessment = await ctx.db.assessment.findFirst({
    where: { id: section.assessmentId },
    select: { classSubjectId: true },
  })

  const questions = await ctx.db.question.findMany({
    where: {
      id: { in: input.questionIds },
      deletedAt: null,
      status: 'APPROVED',
      classSubjectId: assessment!.classSubjectId,
    },
    select: {
      id: true,
      text: true,
      type: true,
      difficulty: true,
      marks: true,
      solution: true,
      options: {
        orderBy: { position: 'asc' },
        select: { text: true, isCorrect: true, matchWith: true },
      },
    },
  })

  if (questions.length === 0) {
    throw new ApiException(
      400,
      'NO_QUESTIONS',
      'None of those questions are approved for this subject',
    )
  }

  const last = await ctx.db.assessmentQuestion.findFirst({
    where: { sectionId: input.sectionId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  let position = (last?.position ?? -1) + 1

  await ctx.db.assessmentQuestion.createMany({
    data: questions.map((question) => ({
      tenantId: ctx.tenant.id,
      assessmentId: section.assessmentId,
      sectionId: input.sectionId,
      questionId: question.id,
      position: position++,
      marks: question.marks,
      textSnapshot: question.text,
      optionsSnapshot: question.options.length > 0 ? question.options : undefined,
      answerSnapshot: question.solution,
      typeSnapshot: question.type,
      difficultySnapshot: question.difficulty,
    })),
  })

  await audit({
    ...actor(ctx),
    action: 'assessment.questions.place',
    entityType: 'Assessment',
    entityId: section.assessmentId,
    summary: `Placed ${questions.length} questions in ${section.title}`,
  })

  return { placed: questions.length }
}

async function placementGuard(ctx: AppContext, placementId: string) {
  const placement = await ctx.db.assessmentQuestion.findFirst({
    where: { id: placementId },
    select: { id: true, assessmentId: true, sectionId: true },
  })
  if (!placement) throw notFound('Question')
  await assertEditable(ctx, placement.assessmentId)
  return placement
}

export async function updatePlacement(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof placementUpdateSchema>,
) {
  await placementGuard(ctx, id)
  return ctx.db.assessmentQuestion.update({
    where: { id },
    data: {
      ...(input.marks !== undefined ? { marks: input.marks } : {}),
      ...(input.answerSnapshot !== undefined ? { answerSnapshot: input.answerSnapshot ?? null } : {}),
      ...(input.textSnapshot !== undefined ? { textSnapshot: input.textSnapshot } : {}),
    },
    select: { id: true, marks: true },
  })
}

export async function removePlacement(ctx: AppContext, id: string) {
  const placement = await placementGuard(ctx, id)
  await ctx.db.assessmentQuestion.delete({ where: { id } })
  await audit({
    ...actor(ctx),
    action: 'assessment.questions.remove',
    entityType: 'Assessment',
    entityId: placement.assessmentId,
    summary: 'Removed a question from the paper',
  })
}

export async function reorderPlacements(ctx: AppContext, sectionId: string, ids: string[]) {
  await sectionGuard(ctx, sectionId)
  const owned = await ctx.db.assessmentQuestion.findMany({
    where: { sectionId },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((row) => row.id))
  if (ids.length !== ownedIds.size || ids.some((id) => !ownedIds.has(id))) {
    throw new ApiException(400, 'BAD_ORDER', 'The question list does not match this section')
  }

  await ctx.db.$transaction(
    ids.map((id, position) =>
      ctx.db.assessmentQuestion.update({ where: { id }, data: { position } }),
    ),
  )
}

export async function reorderSections(ctx: AppContext, assessmentId: string, ids: string[]) {
  await assertEditable(ctx, assessmentId)
  const owned = await ctx.db.assessmentSection.findMany({
    where: { assessmentId },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((row) => row.id))
  if (ids.length !== ownedIds.size || ids.some((id) => !ownedIds.has(id))) {
    throw new ApiException(400, 'BAD_ORDER', 'The section list does not match this paper')
  }

  await ctx.db.$transaction(
    ids.map((id, position) =>
      ctx.db.assessmentSection.update({ where: { id }, data: { position } }),
    ),
  )
}

/**
 * Approval.
 *
 * Refuses an unbalanced paper, because "Maximum Marks: 40" on a paper worth 38
 * is discovered by a child in an exam hall. Usage is recorded here rather than
 * at placement: a question dragged into a draft and then removed was never
 * asked, and counting it would make the repetition warnings lie.
 */
export async function approveAssessment(ctx: AppContext, id: string) {
  const assessment = await ctx.db.assessment.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      classSubjectId: true,
      totalMarks: true,
      sections: {
        select: {
          questions: {
            select: {
              marks: true,
              typeSnapshot: true,
              difficultySnapshot: true,
              questionId: true,
            },
          },
        },
      },
    },
  })
  if (!assessment) throw notFound('Paper')
  await assertClassSubjectAccess(ctx, assessment.classSubjectId)

  const blueprint = blueprintOf(assessment)
  if (blueprint.questionCount === 0) {
    throw conflict('Add at least one question before approving this paper')
  }
  if (!blueprint.balanced) {
    throw new ApiException(
      409,
      'UNBALANCED',
      `The questions add up to ${blueprint.placed} marks but the paper is set to ${blueprint.declared}. Fix one of the two before approving.`,
    )
  }

  const questionIds = assessment.sections
    .flatMap((section) => section.questions)
    .map((question) => question.questionId)
    .filter((questionId): questionId is string => Boolean(questionId))

  await ctx.db.$transaction([
    ctx.db.assessment.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: ctx.user.userId, approvedAt: new Date() },
    }),
    ctx.db.questionUsage.createMany({
      data: [...new Set(questionIds)].map((questionId) => ({
        tenantId: ctx.tenant.id,
        questionId,
        assessmentId: id,
      })),
      skipDuplicates: true,
    }),
  ])

  await audit({
    ...actor(ctx),
    action: 'assessment.approve',
    entityType: 'Assessment',
    entityId: id,
    summary: `Approved ${assessment.title} (${blueprint.placed} marks, ${blueprint.questionCount} questions)`,
  })

  return { id, status: 'APPROVED' as const }
}

export async function reopenAssessment(ctx: AppContext, id: string) {
  const assessment = await ctx.db.assessment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, classSubjectId: true, status: true, title: true },
  })
  if (!assessment) throw notFound('Paper')
  await assertClassSubjectAccess(ctx, assessment.classSubjectId)
  if (assessment.status === 'ASSIGNED' || assessment.status === 'CLOSED') {
    throw conflict('This paper has been assigned to students and cannot be reopened')
  }

  await ctx.db.assessment.update({
    where: { id },
    data: { status: 'DRAFT', approvedById: null, approvedAt: null },
  })
  await audit({
    ...actor(ctx),
    action: 'assessment.reopen',
    entityType: 'Assessment',
    entityId: id,
    summary: `Reopened ${assessment.title}`,
  })
}

/**
 * Set B from Set A.
 *
 * Same structure, same marks, same topics — different questions where the bank
 * can supply them. Where it cannot, the original question is carried over
 * rather than leaving a hole, and the caller is told how many were reused so
 * "alternate set" never overstates itself.
 */
export async function generateAlternateSet(ctx: AppContext, id: string) {
  const source = await ctx.db.assessment.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      sessionId: true,
      classSubjectId: true,
      sectionId: true,
      assessmentTypeId: true,
      templateId: true,
      title: true,
      totalMarks: true,
      durationMinutes: true,
      instructions: true,
      setLabel: true,
      parentId: true,
      sections: {
        orderBy: { position: 'asc' },
        select: {
          title: true,
          instructions: true,
          position: true,
          questions: {
            orderBy: { position: 'asc' },
            select: {
              position: true,
              marks: true,
              textSnapshot: true,
              optionsSnapshot: true,
              answerSnapshot: true,
              typeSnapshot: true,
              difficultySnapshot: true,
              questionId: true,
            },
          },
        },
      },
    },
  })
  if (!source) throw notFound('Paper')
  await assertClassSubjectAccess(ctx, source.classSubjectId)

  const rootId = source.parentId ?? source.id
  const siblings = await ctx.db.assessment.count({ where: { parentId: rootId, deletedAt: null } })
  const nextLabel = String.fromCharCode(66 + siblings) // B, C, D…

  // Everything already used by this paper and its siblings, so a variant does
  // not simply re-ask what Set A asked.
  const used = await ctx.db.assessmentQuestion.findMany({
    where: { assessment: { OR: [{ id: rootId }, { parentId: rootId }] } },
    select: { questionId: true },
  })
  const usedIds = new Set(used.map((row) => row.questionId).filter(Boolean) as string[])

  const placedIds = source.sections
    .flatMap((section) => section.questions)
    .map((question) => question.questionId)
    .filter(Boolean) as string[]

  const originals = await ctx.db.question.findMany({
    where: { id: { in: placedIds } },
    select: { id: true, topics: { select: { topicId: true } } },
  })
  const topicsOf = new Map(originals.map((q) => [q.id, q.topics.map((t) => t.topicId)]))

  let reused = 0
  const created = await ctx.db.$transaction(async (tx) => {
    const copy = await tx.assessment.create({
      data: {
        tenantId: ctx.tenant.id,
        sessionId: source.sessionId,
        classSubjectId: source.classSubjectId,
        sectionId: source.sectionId,
        assessmentTypeId: source.assessmentTypeId,
        templateId: source.templateId,
        title: source.title,
        totalMarks: source.totalMarks,
        durationMinutes: source.durationMinutes,
        instructions: source.instructions,
        parentId: rootId,
        setLabel: nextLabel,
        createdById: ctx.user.userId,
      },
      select: { id: true },
    })

    for (const section of source.sections) {
      const newSection = await tx.assessmentSection.create({
        data: {
          tenantId: ctx.tenant.id,
          assessmentId: copy.id,
          title: section.title,
          instructions: section.instructions,
          position: section.position,
        },
        select: { id: true },
      })

      for (const question of section.questions) {
        const topicIds = question.questionId ? (topicsOf.get(question.questionId) ?? []) : []

        const replacement = question.questionId
          ? await tx.question.findFirst({
              where: {
                classSubjectId: source.classSubjectId,
                deletedAt: null,
                status: 'APPROVED',
                type: question.typeSnapshot,
                difficulty: question.difficultySnapshot,
                marks: question.marks,
                id: { notIn: [...usedIds] },
                ...(topicIds.length > 0 ? { topics: { some: { topicId: { in: topicIds } } } } : {}),
              },
              select: {
                id: true,
                text: true,
                solution: true,
                options: {
                  orderBy: { position: 'asc' },
                  select: { text: true, isCorrect: true, matchWith: true },
                },
              },
            })
          : null

        if (replacement) {
          usedIds.add(replacement.id)
        } else {
          reused += 1
        }

        await tx.assessmentQuestion.create({
          data: {
            tenantId: ctx.tenant.id,
            assessmentId: copy.id,
            sectionId: newSection.id,
            questionId: replacement?.id ?? question.questionId,
            position: question.position,
            marks: question.marks,
            textSnapshot: replacement?.text ?? question.textSnapshot,
            optionsSnapshot: replacement
              ? replacement.options.length > 0
                ? replacement.options
                : undefined
              : (question.optionsSnapshot ?? undefined),
            answerSnapshot: replacement ? replacement.solution : question.answerSnapshot,
            typeSnapshot: question.typeSnapshot,
            difficultySnapshot: question.difficultySnapshot,
          },
        })
      }
    }

    return copy
  })

  await audit({
    ...actor(ctx),
    action: 'assessment.set.create',
    entityType: 'Assessment',
    entityId: created.id,
    summary: `Generated Set ${nextLabel} of ${source.title} (${reused} questions reused)`,
  })

  return { id: created.id, setLabel: nextLabel, reused }
}

/** Papers a question already appears in, for the repetition warning. */
export async function usageFor(ctx: AppContext, questionIds: string[]) {
  if (questionIds.length === 0) return {}
  const rows = await ctx.db.questionUsage.findMany({
    where: { questionId: { in: questionIds } },
    orderBy: { usedOn: 'desc' },
    select: {
      questionId: true,
      usedOn: true,
      assessment: { select: { title: true } },
    },
  })

  const map: Record<string, { title: string; usedOn: Date }[]> = {}
  for (const row of rows) {
    ;(map[row.questionId] ??= []).push({ title: row.assessment.title, usedOn: row.usedOn })
  }
  return map
}
