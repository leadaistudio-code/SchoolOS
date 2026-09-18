import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { ApiException, notFound } from '@/server/api/response'
import { audit } from '@/server/audit'
import { assertClassSubjectAccess } from '@/server/scope'
import { transformQuestion } from '@/server/modules/questions/generate'
import { setQuestionStatus } from '@/server/modules/questions/service'

export const placementAiActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep') }),
  z.object({ action: z.literal('regenerate') }),
  z.object({
    action: z.literal('replace'),
    questionId: z.string().min(8),
  }),
])

/**
 * Keep / Regenerate / Replace for AI-origin placements on a paper.
 * Teacher remains the authority — regenerate creates a new bank draft and swaps the snapshot.
 */
export async function applyPlacementAiAction(
  ctx: AppContext,
  placementId: string,
  input: z.infer<typeof placementAiActionSchema>,
) {
  ctx.require('assessments.edit')

  const placement = await ctx.db.assessmentQuestion.findFirst({
    where: { id: placementId },
    select: {
      id: true,
      assessmentId: true,
      sectionId: true,
      questionId: true,
      marks: true,
      assessment: {
        select: {
          status: true,
          classSubjectId: true,
          deletedAt: true,
        },
      },
      question: {
        select: {
          id: true,
          origin: true,
          status: true,
          classSubjectId: true,
        },
      },
    },
  })
  if (!placement || placement.assessment.deletedAt) throw notFound('Placement')
  if (placement.assessment.status === 'ASSIGNED' || placement.assessment.status === 'CLOSED') {
    throw new ApiException(409, 'PAPER_LOCKED', 'This paper can no longer be edited')
  }
  await assertClassSubjectAccess(ctx, placement.assessment.classSubjectId)

  if (input.action === 'keep') {
    if (!placement.questionId || !placement.question) {
      throw new ApiException(409, 'NO_BANK_LINK', 'This placement is not linked to a bank question')
    }
    if (placement.question.status === 'APPROVED') {
      return { placementId, questionId: placement.questionId, status: 'APPROVED' as const }
    }
    ctx.require('questionbank.approve')
    await setQuestionStatus(ctx, placement.questionId, 'APPROVED')
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      module: 'assessments',
      action: 'assessment.placement.keep',
      entityType: 'AssessmentQuestion',
      entityId: placementId,
      summary: 'Approved AI draft used on the paper',
    })
    return { placementId, questionId: placement.questionId, status: 'APPROVED' as const }
  }

  if (input.action === 'regenerate') {
    if (!placement.questionId) {
      throw new ApiException(409, 'NO_BANK_LINK', 'Regenerate needs a linked bank question')
    }
    ctx.require('questionbank.generate')
    const variant = await transformQuestion(ctx, placement.questionId, 'SIMILAR')
    const full = await ctx.db.question.findFirst({
      where: { id: variant.id },
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
    if (!full) throw notFound('Generated variant')

    await ctx.db.assessmentQuestion.update({
      where: { id: placementId },
      data: {
        questionId: full.id,
        textSnapshot: full.text,
        typeSnapshot: full.type,
        difficultySnapshot: full.difficulty,
        marks: full.marks || placement.marks,
        answerSnapshot: full.solution,
        optionsSnapshot: full.options.map((o) => ({
          text: o.text,
          isCorrect: o.isCorrect,
          matchWith: o.matchWith,
        })),
      },
    })

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      module: 'assessments',
      action: 'assessment.placement.regenerate',
      entityType: 'AssessmentQuestion',
      entityId: placementId,
      summary: 'Replaced placement with AI similar variant',
      after: { questionId: full.id },
    })

    return { placementId, questionId: full.id, status: 'DRAFT' as const }
  }

  // replace
  const replacement = await ctx.db.question.findFirst({
    where: {
      id: input.questionId,
      classSubjectId: placement.assessment.classSubjectId,
      deletedAt: null,
      status: { in: ['APPROVED', 'DRAFT'] },
    },
    select: {
      id: true,
      text: true,
      type: true,
      difficulty: true,
      marks: true,
      solution: true,
      status: true,
      options: {
        orderBy: { position: 'asc' },
        select: { text: true, isCorrect: true, matchWith: true },
      },
    },
  })
  if (!replacement) throw notFound('Replacement question')

  await ctx.db.assessmentQuestion.update({
    where: { id: placementId },
    data: {
      questionId: replacement.id,
      textSnapshot: replacement.text,
      typeSnapshot: replacement.type,
      difficultySnapshot: replacement.difficulty,
      marks: replacement.marks || placement.marks,
      answerSnapshot: replacement.solution,
      optionsSnapshot: replacement.options.map((o) => ({
        text: o.text,
        isCorrect: o.isCorrect,
        matchWith: o.matchWith,
      })),
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    module: 'assessments',
    action: 'assessment.placement.replace',
    entityType: 'AssessmentQuestion',
    entityId: placementId,
    summary: 'Replaced placement from question bank',
    after: { questionId: replacement.id },
  })

  return { placementId, questionId: replacement.id, status: replacement.status }
}
