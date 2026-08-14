import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'

/**
 * The competencies every appraisal is scored against.
 *
 * Fixed rather than school-configurable on purpose: a rating is only
 * comparable between two teachers, or between this year and last, if both
 * were scored on the same things. A school that needs its own set can say so
 * in the written sections.
 */
export const COMPETENCIES = [
  { key: 'teaching', label: 'Teaching and subject knowledge' },
  { key: 'planning', label: 'Lesson planning and syllabus coverage' },
  { key: 'engagement', label: 'Student engagement and classroom management' },
  { key: 'assessment', label: 'Assessment and feedback to students' },
  { key: 'communication', label: 'Communication with parents and colleagues' },
  { key: 'punctuality', label: 'Punctuality and reliability' },
  { key: 'development', label: 'Professional development' },
] as const

export const appraisalCreateSchema = z
  .object({
    staffId: z.string().min(1, 'Choose a member of staff'),
    cycleName: z.string().trim().min(2, 'Name the cycle, e.g. 2026-27 Annual').max(60),
    periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date'),
    periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date'),
    reviewerStaffId: z.string().optional(),
  })
  .refine((v) => v.periodTo > v.periodFrom, {
    path: ['periodTo'],
    message: 'The period must end after it starts',
  })

export const appraisalReviewSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['DRAFT', 'SELF_REVIEW', 'MANAGER_REVIEW', 'COMPLETED']),
  selfComment: z.string().trim().max(4000).optional(),
  reviewerComment: z.string().trim().max(4000).optional(),
  strengths: z.string().trim().max(2000).optional(),
  improvements: z.string().trim().max(2000).optional(),
  goals: z.string().trim().max(2000).optional(),
  outcome: z.enum(['PROMOTION', 'INCREMENT', 'SUSTAIN', 'IMPROVEMENT_PLAN']).optional(),
  increment: z.coerce.number().min(0).max(100_000_000).optional(),
  ratings: z
    .array(
      z.object({
        competency: z.string().min(1).max(40),
        rating: z.coerce.number().int().min(1).max(5),
        comment: z.string().trim().max(500).optional(),
      }),
    )
    .max(20)
    .default([]),
})

export const OUTCOMES: Record<string, string> = {
  PROMOTION: 'Promotion',
  INCREMENT: 'Increment',
  SUSTAIN: 'Sustain',
  IMPROVEMENT_PLAN: 'Improvement plan',
}

export async function listAppraisals(
  ctx: AppContext,
  filter: { staffId?: string; status?: string } = {},
) {
  ctx.require('staff.view')
  return ctx.db.staffAppraisal.findMany({
    where: {
      ...(filter.staffId ? { staffId: filter.staffId } : {}),
      ...(filter.status
        ? { status: filter.status as 'DRAFT' | 'SELF_REVIEW' | 'MANAGER_REVIEW' | 'COMPLETED' }
        : {}),
    },
    orderBy: [{ periodTo: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      staff: {
        select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true },
      },
      reviewer: { select: { id: true, firstName: true, lastName: true } },
      ratings: true,
    },
  })
}

export async function getAppraisal(ctx: AppContext, id: string) {
  ctx.require('staff.view')
  const appraisal = await ctx.db.staffAppraisal.findFirst({
    where: { id },
    include: {
      staff: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      reviewer: { select: { id: true, firstName: true, lastName: true } },
      ratings: true,
    },
  })
  if (!appraisal) throw notFound('Appraisal')
  return appraisal
}

export async function createAppraisal(
  ctx: AppContext,
  input: z.infer<typeof appraisalCreateSchema>,
) {
  ctx.require('staff.appraise')

  const staff = await ctx.db.staff.findFirst({
    where: { id: input.staffId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!staff) throw notFound('Staff member')

  const clash = await ctx.db.staffAppraisal.findFirst({
    where: { staffId: input.staffId, cycleName: input.cycleName },
  })
  if (clash) throw conflict(`${staff.firstName} already has a ${input.cycleName} appraisal`)

  const created = await ctx.db.staffAppraisal.create({
    data: {
      tenantId: ctx.tenant.id,
      staffId: input.staffId,
      cycleName: input.cycleName,
      periodFrom: attendanceDate(input.periodFrom),
      periodTo: attendanceDate(input.periodTo),
      reviewerStaffId: input.reviewerStaffId || null,
      createdById: ctx.user.userId,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.appraisal.create',
    module: 'staff',
    entityType: 'StaffAppraisal',
    entityId: created.id,
    summary: `Opened ${input.cycleName} appraisal for ${staff.firstName} ${staff.lastName}`,
    after: created,
  })
  return created
}

/**
 * Saves a review, whatever stage it is at.
 *
 * The overall rating is the mean of the competency scores rather than a
 * separate field somebody types: a headline that can disagree with the
 * detail beneath it is the first thing an appraisee will challenge, and
 * rightly.
 */
export async function saveAppraisalReview(
  ctx: AppContext,
  input: z.infer<typeof appraisalReviewSchema>,
) {
  ctx.require('staff.appraise')

  const appraisal = await ctx.db.staffAppraisal.findFirst({
    where: { id: input.id },
    include: { staff: { select: { firstName: true, lastName: true } } },
  })
  if (!appraisal) throw notFound('Appraisal')
  if (appraisal.status === 'COMPLETED' && input.status === 'COMPLETED') {
    throw conflict('This appraisal is already completed')
  }

  const scored = input.ratings.filter((r) => r.rating > 0)
  const overallRating = scored.length
    ? Math.round((scored.reduce((sum, r) => sum + r.rating, 0) / scored.length) * 10) / 10
    : null

  const updated = await ctx.db.$transaction(async (tx) => {
    if (input.ratings.length > 0) {
      // Replaced wholesale so the stored set always matches what was saved.
      await tx.staffAppraisalRating.deleteMany({ where: { appraisalId: input.id } })
      await tx.staffAppraisalRating.createMany({
        data: input.ratings.map((r) => ({
          tenantId: ctx.tenant.id,
          appraisalId: input.id,
          competency: r.competency,
          rating: r.rating,
          comment: r.comment,
        })),
      })
    }

    return tx.staffAppraisal.update({
      where: { id: input.id },
      data: {
        status: input.status,
        selfComment: input.selfComment ?? appraisal.selfComment,
        reviewerComment: input.reviewerComment ?? appraisal.reviewerComment,
        strengths: input.strengths ?? appraisal.strengths,
        improvements: input.improvements ?? appraisal.improvements,
        goals: input.goals ?? appraisal.goals,
        outcome: input.outcome ?? appraisal.outcome,
        incrementMinor:
          input.increment === undefined
            ? appraisal.incrementMinor
            : Math.round(input.increment * 100),
        ...(overallRating !== null ? { overallRating } : {}),
        ...(input.status === 'SELF_REVIEW' && !appraisal.submittedAt
          ? { submittedAt: new Date() }
          : {}),
        ...(input.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.appraisal.review',
    module: 'staff',
    entityType: 'StaffAppraisal',
    entityId: input.id,
    summary: `${appraisal.staff.firstName} ${appraisal.staff.lastName} appraisal moved to ${input.status.toLowerCase().replace(/_/g, ' ')}`,
    before: { status: appraisal.status, overallRating: appraisal.overallRating },
    after: { status: updated.status, overallRating: updated.overallRating },
  })
  return updated
}

/** Counts for the strip above the appraisal list. */
export async function appraisalSummary(ctx: AppContext) {
  ctx.require('staff.view')

  const [rows, rated] = await Promise.all([
    ctx.db.staffAppraisal.groupBy({ by: ['status'], _count: { _all: true } }),
    ctx.db.staffAppraisal.aggregate({
      where: { status: 'COMPLETED', overallRating: { not: null } },
      _avg: { overallRating: true },
      _count: { _all: true },
    }),
  ])

  const at = (status: string) => rows.find((r) => r.status === status)?._count._all ?? 0
  return {
    open: at('DRAFT') + at('SELF_REVIEW') + at('MANAGER_REVIEW'),
    draft: at('DRAFT'),
    awaitingSelf: at('SELF_REVIEW'),
    awaitingReviewer: at('MANAGER_REVIEW'),
    completed: at('COMPLETED'),
    averageRating: rated._avg.overallRating
      ? Math.round(rated._avg.overallRating * 10) / 10
      : null,
    ratedCount: rated._count._all,
  }
}
