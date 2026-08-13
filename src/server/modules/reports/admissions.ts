import type { AppContext } from '@/server/context'
import { monthLabel, monthsBetween, ratio, type ReportRange } from './range'

export type AdmissionsReport = Awaited<ReturnType<typeof admissionsReport>>

/** The funnel in the order an enquiry actually travels it. */
const STAGE_ORDER = [
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'CAMPUS_VISIT',
  'APPLICATION',
  'DOCUMENT_VERIFICATION',
  'APPROVED',
  'ENROLLED',
  'LOST',
] as const

/**
 * The admissions funnel.
 *
 * Counted by when the enquiry arrived, not by where it stands today, so a
 * month's intake keeps its own conversion figure as those enquiries mature.
 * The alternative — bucketing live leads by current stage only — flatters a
 * quiet month and hides a slow one.
 *
 * LOST sits in the stage list because a funnel that only shows progress
 * cannot tell you where enquiries are leaking.
 */
export async function admissionsReport(ctx: AppContext, range: ReportRange) {
  ctx.require('reports.view')

  const db = ctx.db
  const tenantId = ctx.tenant.id
  const inRange = { createdAt: { gte: range.from, lt: range.toExclusive }, deletedAt: null }

  const [total, byStage, bySource, byMonth, byOwner, overdueFollowUps, upcoming, lostReasons] =
    await Promise.all([
      db.admissionLead.count({ where: inRange }),
      db.admissionLead.groupBy({ by: ['stage'], where: inRange, _count: { _all: true } }),
      db.$queryRaw<{ source: string | null; leads: number; enrolled: number; lost: number }[]>`
        SELECT l.source,
               COUNT(*)::int AS leads,
               (COUNT(*) FILTER (WHERE l.stage = 'ENROLLED'))::int AS enrolled,
               (COUNT(*) FILTER (WHERE l.stage = 'LOST'))::int AS lost
        FROM "AdmissionLead" l
        WHERE l."tenantId" = ${tenantId}
          AND l."deletedAt" IS NULL
          AND l."createdAt" >= ${range.from}
          AND l."createdAt" < ${range.toExclusive}
        GROUP BY l.source
        ORDER BY leads DESC`,
      db.$queryRaw<{ month: string; leads: number; enrolled: number }[]>`
        SELECT to_char(date_trunc('month', l."createdAt"), 'YYYY-MM') AS month,
               COUNT(*)::int AS leads,
               (COUNT(*) FILTER (WHERE l.stage = 'ENROLLED'))::int AS enrolled
        FROM "AdmissionLead" l
        WHERE l."tenantId" = ${tenantId}
          AND l."deletedAt" IS NULL
          AND l."createdAt" >= ${range.from}
          AND l."createdAt" < ${range.toExclusive}
        GROUP BY 1
        ORDER BY 1`,
      db.$queryRaw<{ ownerId: string | null; leads: number; enrolled: number }[]>`
        SELECT l."assignedToId" AS "ownerId",
               COUNT(*)::int AS leads,
               (COUNT(*) FILTER (WHERE l.stage = 'ENROLLED'))::int AS enrolled
        FROM "AdmissionLead" l
        WHERE l."tenantId" = ${tenantId}
          AND l."deletedAt" IS NULL
          AND l."createdAt" >= ${range.from}
          AND l."createdAt" < ${range.toExclusive}
        GROUP BY l."assignedToId"
        ORDER BY leads DESC`,
      // Not range-bound: an overdue follow-up is a thing to do today,
      // whatever window the rest of the page is showing.
      db.leadFollowUp.count({ where: { doneAt: null, dueOn: { lt: new Date() } } }),
      db.admissionLead.findMany({
        where: {
          deletedAt: null,
          stage: { notIn: ['ENROLLED', 'LOST'] },
          nextFollowUpOn: { not: null },
        },
        orderBy: { nextFollowUpOn: 'asc' },
        take: 12,
        select: {
          id: true,
          reference: true,
          studentName: true,
          parentName: true,
          phone: true,
          stage: true,
          source: true,
          nextFollowUpOn: true,
        },
      }),
      db.admissionLead.groupBy({
        by: ['lostReason'],
        where: { ...inRange, stage: 'LOST' },
        _count: { _all: true },
      }),
    ])

  const ownerIds = byOwner.map((o) => o.ownerId).filter((id): id is string => !!id)
  const owners = ownerIds.length
    ? await db.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const ownerById = new Map(owners.map((o) => [o.id, `${o.firstName} ${o.lastName}`.trim()]))

  const stageCount = new Map(byStage.map((s) => [s.stage as string, s._count._all]))
  const enrolled = stageCount.get('ENROLLED') ?? 0
  const lost = stageCount.get('LOST') ?? 0
  const monthIndex = new Map(byMonth.map((m) => [m.month, m]))

  return {
    range,
    summary: {
      leads: total,
      enrolled,
      lost,
      open: total - enrolled - lost,
      conversion: ratio(enrolled, total),
      lossRate: ratio(lost, total),
      overdueFollowUps,
    },
    funnel: STAGE_ORDER.map((stage) => ({
      stage,
      count: stageCount.get(stage) ?? 0,
      /** Share of the intake that reached this stage — the funnel's width. */
      share: ratio(stageCount.get(stage) ?? 0, total),
    })),
    bySource: bySource.map((s) => ({
      source: s.source || 'Not recorded',
      leads: s.leads,
      enrolled: s.enrolled,
      lost: s.lost,
      conversion: ratio(s.enrolled, s.leads),
    })),
    byOwner: byOwner.map((o) => ({
      ownerId: o.ownerId,
      name: o.ownerId ? (ownerById.get(o.ownerId) ?? 'Removed user') : 'Unassigned',
      leads: o.leads,
      enrolled: o.enrolled,
      conversion: ratio(o.enrolled, o.leads),
    })),
    trend: monthsBetween(range.from, range.to).map((month) => ({
      month,
      label: monthLabel(month),
      leads: monthIndex.get(month)?.leads ?? 0,
      enrolled: monthIndex.get(month)?.enrolled ?? 0,
    })),
    lostReasons: lostReasons
      .map((r) => ({ reason: r.lostReason || 'Not recorded', count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    upcoming,
  }
}
