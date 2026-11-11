import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { badRequest, notFound } from '@/server/api/response'
import { isHttpsUrl } from '@/lib/lms/live'
import { assertLms, actorOf, auditLms } from './access'
import { finishIfDone, openCourseFor, requireLearner } from './learning'

/**
 * Project lessons: the student hands in a note and a link to their work, a
 * teacher approves it or asks for changes. Approval is what completes the
 * lesson, so a course with projects is only finished once they are reviewed.
 */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined))

export const submissionSchema = z
  .object({
    note: optionalText(4000),
    linkUrl: optionalText(500).refine((v) => !v || isHttpsUrl(v), { message: 'Paste the full https:// link to your work' }),
  })
  .refine((v) => v.note || v.linkUrl, { message: 'Describe what you built or add a link to it' })

export const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  feedback: optionalText(4000),
  score: z.coerce.number().int().min(0).max(100).optional().or(z.literal('').transform(() => undefined)),
})

export async function mySubmission(ctx: AppContext, courseId: string, lessonId: string) {
  const learner = await requireLearner(ctx)
  const enrollment = await ctx.db.lmsEnrollment.findFirst({ where: { courseId, studentId: learner.id }, select: { id: true } })
  if (!enrollment) return null
  return ctx.db.lmsProjectSubmission.findFirst({ where: { enrollmentId: enrollment.id, lessonId } })
}

export async function submitProject(ctx: AppContext, courseId: string, lessonId: string, input: z.input<typeof submissionSchema>) {
  const learner = await requireLearner(ctx)
  const { enrollment } = await openCourseFor(ctx, learner, courseId)
  const lesson = await ctx.db.lmsLesson.findFirst({ where: { id: lessonId, courseId }, select: { id: true, kind: true } })
  if (!lesson || lesson.kind !== 'PROJECT') throw notFound('Project')
  const data = submissionSchema.parse(input)

  const existing = await ctx.db.lmsProjectSubmission.findFirst({ where: { enrollmentId: enrollment.id, lessonId } })
  if (existing?.status === 'APPROVED') throw badRequest('This project is already approved')
  const values = { note: data.note ?? null, linkUrl: data.linkUrl ?? null, status: 'SUBMITTED' as const, submittedAt: new Date() }
  const saved = existing
    ? await ctx.db.lmsProjectSubmission.update({ where: { id: existing.id }, data: { ...values, version: existing.version + 1 } })
    : await ctx.db.lmsProjectSubmission.create({
        data: { ...values, tenantId: ctx.tenant.id, enrollmentId: enrollment.id, lessonId, studentId: learner.id },
      })
  await ctx.db.lmsEnrollment.update({ where: { id: enrollment.id }, data: { lastActivityAt: new Date() } })
  return saved
}

export type ReviewFilter = 'SUBMITTED' | 'CHANGES_REQUESTED' | 'APPROVED'

export async function reviewQueue(ctx: AppContext, status: ReviewFilter) {
  ctx.require('lms.teach')
  await assertLms(ctx)
  const [rows, counts] = await Promise.all([
    ctx.db.lmsProjectSubmission.findMany({
      where: { status },
      orderBy: { submittedAt: status === 'SUBMITTED' ? 'asc' : 'desc' },
      take: 200,
    }),
    ctx.db.lmsProjectSubmission.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  const [students, lessons] = await Promise.all([
    ctx.db.student.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.studentId))] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
        enrollments: { where: { isCurrent: true }, take: 1, select: { classLevel: { select: { name: true } }, section: { select: { name: true } } } },
      },
    }),
    ctx.db.lmsLesson.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.lessonId))] } },
      select: { id: true, title: true, course: { select: { id: true, title: true } } },
    }),
  ])
  const studentById = new Map(students.map((s) => [s.id, s]))
  const lessonById = new Map(lessons.map((l) => [l.id, l]))
  return {
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<ReviewFilter, number>>,
    rows: rows.map((r) => {
      const s = studentById.get(r.studentId)
      const placement = s?.enrollments[0]
      const l = lessonById.get(r.lessonId)
      return {
        ...r,
        studentName: s ? `${s.firstName} ${s.lastName}`.trim() : 'Student',
        admissionNo: s?.admissionNo ?? '',
        className: placement ? `${placement.classLevel.name}${placement.section ? ` – ${placement.section.name}` : ''}` : '',
        lessonTitle: l?.title ?? 'Project',
        courseTitle: l?.course.title ?? '',
        courseId: l?.course.id ?? '',
      }
    }),
  }
}

export async function getSubmission(ctx: AppContext, id: string) {
  ctx.require('lms.teach')
  await assertLms(ctx)
  const row = await ctx.db.lmsProjectSubmission.findFirst({ where: { id } })
  if (!row) throw notFound('Submission')
  const [student, lesson] = await Promise.all([
    ctx.db.student.findFirst({
      where: { id: row.studentId },
      select: {
        firstName: true,
        lastName: true,
        admissionNo: true,
        enrollments: { where: { isCurrent: true }, take: 1, select: { classLevel: { select: { name: true } }, section: { select: { name: true } } } },
      },
    }),
    ctx.db.lmsLesson.findFirst({
      where: { id: row.lessonId },
      select: { id: true, title: true, body: true, course: { select: { id: true, title: true } } },
    }),
  ])
  const placement = student?.enrollments[0]
  return {
    submission: row,
    studentName: student ? `${student.firstName} ${student.lastName}`.trim() : 'Student',
    admissionNo: student?.admissionNo ?? '',
    className: placement ? `${placement.classLevel.name}${placement.section ? ` – ${placement.section.name}` : ''}` : '',
    lesson,
  }
}

export async function reviewProject(ctx: AppContext, id: string, input: z.input<typeof reviewSchema>) {
  ctx.require('lms.teach')
  await assertLms(ctx)
  const row = await ctx.db.lmsProjectSubmission.findFirst({ where: { id }, include: { enrollment: { select: { courseId: true } } } })
  if (!row) throw notFound('Submission')
  const data = reviewSchema.parse(input)
  if (data.decision === 'CHANGES_REQUESTED' && !data.feedback) throw badRequest('Tell the student what to change')
  const actor = actorOf(ctx)
  const now = new Date()

  await ctx.db.lmsProjectSubmission.update({
    where: { id },
    data: {
      status: data.decision,
      feedback: data.feedback ?? null,
      score: data.score ?? null,
      reviewedById: actor.id,
      reviewedByLabel: actor.label,
      reviewedAt: now,
    },
  })
  const progress = await ctx.db.lmsLessonProgress.findFirst({ where: { enrollmentId: row.enrollmentId, lessonId: row.lessonId } })
  const completedAt = data.decision === 'APPROVED' ? (progress?.completedAt ?? now) : null
  if (progress) {
    await ctx.db.lmsLessonProgress.update({ where: { id: progress.id }, data: { completedAt, bestScorePercent: data.score ?? null } })
  } else {
    await ctx.db.lmsLessonProgress.create({
      data: {
        tenantId: ctx.tenant.id,
        enrollmentId: row.enrollmentId,
        lessonId: row.lessonId,
        studentId: row.studentId,
        completedAt,
        bestScorePercent: data.score ?? null,
      },
    })
  }
  await finishIfDone(ctx, row.enrollmentId, row.enrollment.courseId, false)
  await auditLms(
    ctx,
    data.decision === 'APPROVED' ? 'lms.project.approve' : 'lms.project.changes',
    'LmsProjectSubmission',
    id,
    data.decision === 'APPROVED' ? 'Approved a project' : 'Asked for changes to a project',
  )
  return data.decision
}
