import type { AppContext } from '@/server/context'
import { skipTake, type ListQuery } from '@/lib/query'
import { attendanceDate } from '@/lib/dates'

export type AuditFilter = {
  module?: string
  action?: string
  actorId?: string
  entityType?: string
  from?: string
  to?: string
}

/**
 * The audit log.
 *
 * Append-only by construction — nothing in the product updates or deletes a
 * row — so this reader is the whole feature. It is ordered newest first
 * because the question that brings somebody here is almost always "what just
 * happened", and filtered by module rather than by free text because the
 * summaries are written for humans and do not search well.
 */
export async function listAuditLog(ctx: AppContext, query: ListQuery, filter: AuditFilter = {}) {
  ctx.require('audit.view')

  const to = filter.to ? attendanceDate(filter.to) : null
  if (to) to.setUTCDate(to.getUTCDate() + 1)

  const where = {
    ...(filter.module ? { module: filter.module } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.from || to
      ? {
          createdAt: {
            ...(filter.from ? { gte: attendanceDate(filter.from) } : {}),
            ...(to ? { lt: to } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { summary: { contains: query.q, mode: 'insensitive' as const } },
            { actorLabel: { contains: query.q, mode: 'insensitive' as const } },
            { entityId: query.q },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    ctx.db.auditLog.findMany({
      where,
      ...skipTake(query),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        module: true,
        entityType: true,
        entityId: true,
        summary: true,
        actorLabel: true,
        actorId: true,
        ip: true,
        createdAt: true,
      },
    }),
    ctx.db.auditLog.count({ where }),
  ])

  return { rows, total }
}

/** The modules that actually appear in this tenant's log, for the filter. */
export async function auditModules(ctx: AppContext) {
  ctx.require('audit.view')
  const rows = await ctx.db.auditLog.groupBy({ by: ['module'], _count: { _all: true } })
  return rows
    .map((r) => ({ module: r.module, count: r._count._all }))
    .sort((a, b) => b.count - a.count)
}

/** Activity in the last day and week, for the strip above the table. */
export async function auditActivity(ctx: AppContext) {
  ctx.require('audit.view')

  const now = new Date()
  const dayAgo = new Date(now.getTime() - 86_400_000)
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000)

  const [today, week, total, actors] = await Promise.all([
    ctx.db.auditLog.count({ where: { createdAt: { gte: dayAgo } } }),
    ctx.db.auditLog.count({ where: { createdAt: { gte: weekAgo } } }),
    ctx.db.auditLog.count(),
    ctx.db.auditLog.findMany({
      where: { createdAt: { gte: weekAgo }, actorId: { not: null } },
      distinct: ['actorId'],
      select: { actorId: true },
    }),
  ])

  return { today, week, total, activeActors: actors.length }
}
