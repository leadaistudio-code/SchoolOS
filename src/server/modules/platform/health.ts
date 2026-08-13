import type { PlatformContext } from '@/server/context'

export async function getSystemHealth(ctx: PlatformContext) {
  const dbStart = Date.now()
  let dbOk = true
  let dbLatencyMs = 0
  try {
    await ctx.db.$queryRaw`SELECT 1`
    dbLatencyMs = Date.now() - dbStart
  } catch {
    dbOk = false
    dbLatencyMs = Date.now() - dbStart
  }

  const [
    tenantCounts,
    openTickets,
    failedDeliveries,
    failedJobs,
    recentAudit,
  ] = await Promise.all([
    ctx.db.tenant.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    ctx.db.supportTicket.count({
      where: { status: { in: ['OPEN', 'PENDING'] } },
    }),
    ctx.db.notificationDelivery.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        tenantId: true,
        channel: true,
        lastError: true,
        attempts: true,
        createdAt: true,
      },
    }),
    ctx.db.job.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        tenantId: true,
        name: true,
        queue: true,
        lastError: true,
        attempts: true,
        createdAt: true,
      },
    }),
    ctx.db.auditLog.findMany({
      where: {
        action: { in: ['impersonation.start', 'tenant.suspend', 'invoice.overdue.scan'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        summary: true,
        tenantId: true,
        createdAt: true,
      },
    }),
  ])

  const tenantsByStatus = Object.fromEntries(
    tenantCounts.map((r) => [r.status, r._count._all]),
  )

  return {
    database: { ok: dbOk, latencyMs: dbLatencyMs },
    tenants: tenantsByStatus,
    openTickets,
    failedDeliveries,
    failedJobs,
    recentAudit,
    checkedAt: new Date().toISOString(),
  }
}
