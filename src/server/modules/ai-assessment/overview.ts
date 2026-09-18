import type { AppContext } from '@/server/context'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { assistantConfigured } from '@/server/assistant/providers'
import { teachingClassSubjectIds } from '@/server/scope'

/** Lightweight hub stats for Academic Intelligence — reuses existing tables. */
export async function intelligenceOverview(ctx: AppContext) {
  ctx.require('assessments.view')

  const [aiLicensed, aiConfigured] = await Promise.all([
    hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST),
    Promise.resolve(assistantConfigured()),
  ])

  const teachingIds = await teachingClassSubjectIds(ctx)
  const classSubjectFilter =
    teachingIds === null ? {} : { classSubjectId: { in: teachingIds } }

  const since = new Date()
  since.setDate(1)
  since.setHours(0, 0, 0, 0)

  const [
    papersThisMonth,
    draftPapers,
    approvedPapers,
    assignmentsOpen,
    evaluationQueued,
    evaluationReview,
    usagePages,
  ] = await Promise.all([
    ctx.db.assessment.count({
      where: { deletedAt: null, createdAt: { gte: since }, ...classSubjectFilter },
    }),
    ctx.db.assessment.count({
      where: { deletedAt: null, status: 'DRAFT', ...classSubjectFilter },
    }),
    ctx.db.assessment.count({
      where: { deletedAt: null, status: 'APPROVED', ...classSubjectFilter },
    }),
    ctx.db.assessmentAssignment.count({
      where: {
        deletedAt: null,
        dueAt: { gte: new Date() },
        assessment: { deletedAt: null, ...classSubjectFilter },
      },
    }),
    ctx.db.evaluationJob.count({ where: { status: { in: ['QUEUED', 'PROCESSING'] } } }),
    ctx.db.evaluationJob.count({ where: { status: 'REVIEW_REQUIRED' } }),
    ctx.db.aiUsageEvent.aggregate({
      where: { kind: 'evaluation.pages', createdAt: { gte: since } },
      _sum: { units: true },
    }),
  ])

  return {
    aiLicensed,
    aiConfigured,
    papersThisMonth,
    draftPapers,
    approvedPapers,
    assignmentsOpen,
    evaluationQueued,
    evaluationReview,
    pagesProcessedThisMonth: usagePages._sum.units ?? 0,
  }
}
