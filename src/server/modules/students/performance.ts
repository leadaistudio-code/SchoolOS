import type { AppContext } from '@/server/context'
import { assertStudentAccess } from '@/server/scope'
import { resultsToTrend, type ResultTrendPoint } from '@/lib/three-sixty'

/**
 * Per-student readers behind the 360° dashboard.
 *
 * These answer two questions the health score cannot: how the marks are moving
 * exam to exam, and what teachers have actually written about the child. Both
 * go through `assertStudentAccess` so a parent reaches only their own child,
 * and both are additionally gated on the reading permission so the function is
 * safe wherever it is reused, not only from the one dashboard that guards the
 * call.
 */

/**
 * Published exam results as a RAG-banded trend, oldest first.
 *
 * Ordered newest-first from the database and reversed for display, so a student
 * with more than a term's worth of exams shows the most recent twelve rather
 * than the first twelve ever sat — a trend that dropped the latest results
 * would be the one worth reading and the one we hid. The band mapping lives in
 * `resultsToTrend` so the 85/70/55 boundaries are exercised by unit tests
 * without a database.
 */
export async function studentResultsTrend(
  ctx: AppContext,
  studentId: string,
): Promise<ResultTrendPoint[]> {
  ctx.require('results.view')
  await assertStudentAccess(ctx, studentId)

  const rows = await ctx.db.result.findMany({
    where: { studentId, publishedAt: { not: null } },
    orderBy: { exam: { startsOn: 'desc' } },
    take: 12,
    select: {
      percentage: true,
      grade: true,
      exam: { select: { name: true } },
    },
  })

  return resultsToTrend(
    rows
      .reverse()
      .map((row) => ({ examName: row.exam.name, percentage: row.percentage, grade: row.grade })),
  )
}

export type StudentFeedbackItem = {
  id: string
  createdAt: Date
  teacherName: string
  subjectName: string | null
  comment: string | null
  strengths: string | null
  improvement: string | null
  performance: string | null
  participation: string | null
  homework: string | null
  behaviour: string | null
}

/**
 * Teacher-authored feedback that may surface on the child's profile.
 *
 * `TEACHER_ONLY` notes are filtered out at the database, so a teacher's private
 * note to themselves never reaches this list at all. The subject is stored as a
 * bare id with no relation on the row, so names are resolved in one batched
 * lookup rather than a join per feedback item.
 */
export async function listStudentFeedback(
  ctx: AppContext,
  studentId: string,
): Promise<StudentFeedbackItem[]> {
  ctx.require('feedback.view')
  await assertStudentAccess(ctx, studentId)

  const rows = await ctx.db.teacherStudentFeedback.findMany({
    where: { studentId, visibility: { not: 'TEACHER_ONLY' } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      subjectId: true,
      comment: true,
      strengths: true,
      improvement: true,
      performance: true,
      participation: true,
      homework: true,
      behaviour: true,
      teacher: { select: { firstName: true, lastName: true } },
    },
  })

  const subjectIds = [...new Set(rows.map((r) => r.subjectId).filter((id): id is string => !!id))]
  const subjects = subjectIds.length
    ? await ctx.db.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, name: true },
      })
    : []
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    teacherName: `${row.teacher.firstName} ${row.teacher.lastName}`.trim(),
    subjectName: row.subjectId ? (subjectName.get(row.subjectId) ?? null) : null,
    comment: row.comment,
    strengths: row.strengths,
    improvement: row.improvement,
    performance: row.performance,
    participation: row.participation,
    homework: row.homework,
    behaviour: row.behaviour,
  }))
}
