import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { attendanceDate } from '@/lib/dates'
import { scoreSchool } from './service'

/**
 * Score history.
 *
 * Scores are recomputed live everywhere they are shown, so this table answers
 * exactly one question that live computation cannot: is the number moving?
 *
 * Two deliberate limits:
 *
 *  - **The school, its classes and its sections only — never per student.** A
 *    thousand children checkpointed daily is a million rows a year to answer a
 *    question nobody asks of an individual child; the trend that matters is the
 *    school's, and a child's own record already shows their history in full.
 *  - **Captured on request, not on view.** A trend assembled from whenever
 *    somebody happened to open a page is an artefact of browsing habits. Taken
 *    deliberately, each point is the school's own checkpoint.
 */

export type TrendPoint = {
  capturedOn: Date
  score: number
  band: string
  coverage: number
}

/**
 * Records today's score for the school and every class and section.
 *
 * Re-running on the same day overwrites that day rather than adding a second
 * point, so a double-click cannot put a kink in the line.
 */
export async function captureSnapshot(ctx: AppContext) {
  ctx.require('score.manage')

  const summary = await scoreSchool(ctx)
  if (summary.score === null) {
    throw new Error('There is not enough recorded yet to score the school')
  }

  const capturedOn = attendanceDate(new Date().toISOString().slice(0, 10))

  const rows: Prisma.ScoreSnapshotCreateManyInput[] = [
    {
      tenantId: ctx.tenant.id,
      subjectType: 'SCHOOL',
      subjectId: '',
      subjectName: ctx.tenant.name,
      score: summary.score,
      band: summary.band ?? 'AT_RISK',
      coverage: summary.coverage,
      breakdown: summary.metricAverages as unknown as Prisma.InputJsonValue,
      capturedOn,
      capturedById: ctx.user.userId,
    },
    ...summary.classes
      .filter((c) => c.score !== null)
      .map((c) => ({
        tenantId: ctx.tenant.id,
        subjectType: 'CLASS' as const,
        subjectId: c.id,
        subjectName: c.name,
        score: c.score!,
        band: c.band ?? 'AT_RISK',
        coverage: summary.coverage,
        breakdown: c.metricAverages as unknown as Prisma.InputJsonValue,
        capturedOn,
        capturedById: ctx.user.userId,
      })),
    ...summary.sections
      .filter((s) => s.score !== null)
      .map((s) => ({
        tenantId: ctx.tenant.id,
        subjectType: 'SECTION' as const,
        subjectId: s.id,
        subjectName: s.name,
        score: s.score!,
        band: s.band ?? 'AT_RISK',
        coverage: summary.coverage,
        breakdown: s.metricAverages as unknown as Prisma.InputJsonValue,
        capturedOn,
        capturedById: ctx.user.userId,
      })),
  ]

  await ctx.db.$transaction(async (tx) => {
    // Delete-then-insert for one day only. The alternative, an upsert per row,
    // is dozens of round trips to achieve the same thing, and the window this
    // opens is a single day's history inside one transaction.
    await tx.scoreSnapshot.deleteMany({ where: { capturedOn } })
    await tx.scoreSnapshot.createMany({ data: rows })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'score.snapshot',
    module: 'score',
    entityType: 'ScoreSnapshot',
    summary: `Recorded a school score of ${summary.score} across ${rows.length - 1} classes and sections`,
  })

  return { captured: rows.length, score: summary.score }
}

/** The school's own trend line, oldest first. */
export async function schoolTrend(ctx: AppContext, limit = 30): Promise<TrendPoint[]> {
  ctx.require('score.view')

  const rows = await ctx.db.scoreSnapshot.findMany({
    where: { subjectType: 'SCHOOL' },
    orderBy: { capturedOn: 'desc' },
    take: limit,
    select: { capturedOn: true, score: true, band: true, coverage: true },
  })

  return rows.reverse()
}

/** The most recent checkpoint, for the "since last time" comparison. */
export async function previousSchoolScore(ctx: AppContext): Promise<TrendPoint | null> {
  ctx.require('score.view')

  const rows = await ctx.db.scoreSnapshot.findMany({
    where: { subjectType: 'SCHOOL' },
    orderBy: { capturedOn: 'desc' },
    take: 1,
    select: { capturedOn: true, score: true, band: true, coverage: true },
  })

  return rows[0] ?? null
}
