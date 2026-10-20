import type { AppContext } from '@/server/context'
import type { SessionUser } from '@/server/auth/session'
import type { ResolvedTenant } from '@/server/tenant'
import { prisma } from '@/server/db/prisma'
import { tenantDb, tenantTx } from '@/server/db/tenant-client'
import { applyCaps } from '@/lib/tapasya/scoring'
import { getGlobalSettings, scoringAt } from './config'
import { capWindows, earnedBetween, evaluateAchievements } from './xp'
import { rebuildProjection, refreshProjectionSafely, takeSnapshots } from './leaderboard'
import { sweepStaleSessions } from './sessions'

/**
 * Unattended Tapasya work, triggered by POST /api/cron/tapasya:
 *
 *  - reconcile: decides offline-synced XP (PENDING → VALIDATED / REJECTED)
 *  - sweep:     ends sessions abandoned for hours so nobody stays locked out
 *  - rebuild:   recomputes the global projection from the ledger (repair)
 *  - snapshot:  records today's ranks for movement arrows
 */

function systemContext(tenant: { id: string; name: string; slug: string; status: string; timezone: string; currency: string; locale: string }): AppContext {
  const user = {
    sessionId: 'system',
    userId: 'system',
    tenantId: tenant.id,
    isSuperAdmin: false,
    firstName: 'System',
    lastName: '',
    displayName: null,
    email: null,
    phone: null,
    avatarUrl: null,
    mustChangePassword: false,
    roleKeys: [],
    permissions: new Set<string>(),
    impersonatedById: null,
  } satisfies SessionUser
  const resolvedTenant = { ...tenant } as unknown as ResolvedTenant
  const can = () => false
  return {
    user,
    tenant: resolvedTenant,
    db: tenantDb(tenant.id),
    can,
    canAny: () => false,
    require: (permission: string) => {
      throw new Error(`System context missing permission: ${permission}`)
    },
  }
}

const OVERLAP_REASON = 'Overlaps another focus session recorded for this student.'

/**
 * Validates offline-synced XP for one school. An interval is rejected if it
 * overlaps another recorded interval of the same student (two devices claiming
 * the same minutes) or reached the server later than the offline window;
 * otherwise it is validated with caps applied as of when it happened.
 */
export async function reconcileTenant(tenantId: string): Promise<{ validated: number; rejected: number; users: string[] }> {
  const settings = await getGlobalSettings()
  const tz = settings.timezone
  const db = tenantDb(tenantId)
  const pending = await db.tapasyaXpEvent.findMany({ where: { status: 'PENDING' }, orderBy: { occurredAt: 'asc' }, take: 500 })
  let validated = 0
  let rejected = 0
  const users = new Set<string>()

  for (const ev of pending) {
    await tenantTx(tenantId, async (tx) => {
      const fresh = await tx.tapasyaXpEvent.findFirst({ where: { id: ev.id, status: 'PENDING' } })
      if (!fresh) return
      const scoring = await scoringAt(fresh.occurredAt)
      let reason: string | null = null

      if (fresh.eventType === 'FOCUS_INTERVAL' && fresh.sourceId) {
        const iv = await tx.tapasyaFocusInterval.findFirst({ where: { id: fresh.sourceId } })
        if (!iv) reason = 'Interval no longer exists.'
        else {
          const overlap = await tx.tapasyaFocusInterval.findFirst({
            where: { userId: iv.userId, id: { not: iv.id }, sessionId: { not: iv.sessionId }, startedAt: { lt: iv.endedAt }, endedAt: { gt: iv.startedAt } },
            select: { id: true },
          })
          if (overlap) reason = OVERLAP_REASON
          else if (iv.createdAt.getTime() - iv.endedAt.getTime() > scoring.rules.offlineMaxAgeHours * 3_600_000) reason = 'Synced after the offline window closed.'
          else if (iv.endedAt.getTime() > iv.createdAt.getTime() + 60_000) reason = 'Interval ends after it was received.'
        }
      } else if (fresh.eventType === 'ALL_CYCLES_BONUS' && fresh.sourceId) {
        const ivs = await tx.tapasyaFocusInterval.findMany({ where: { sessionId: fresh.sourceId, outcome: 'COMPLETED' }, select: { id: true } })
        const statuses = await tx.tapasyaXpEvent.findMany({ where: { sourceId: { in: ivs.map((i) => i.id) } }, select: { status: true } })
        if (statuses.some((s) => s.status === 'PENDING')) return // decide after its intervals
        if (statuses.some((s) => s.status === 'REJECTED') || statuses.length === 0) reason = 'Not every cycle was validated.'
      }

      if (reason) {
        await tx.tapasyaXpEvent.update({ where: { id: fresh.id }, data: { status: 'REJECTED', rejectionReason: reason, points: 0 } })
        rejected += 1
        return
      }
      const w = capWindows(fresh.occurredAt, tz)
      const [today, week] = await Promise.all([
        earnedBetween(tx, fresh.userId, w.dayStart, w.dayEnd),
        earnedBetween(tx, fresh.userId, w.weekStart, w.weekEnd),
      ])
      const c = applyCaps(fresh.points, today, week, scoring.rules)
      await tx.tapasyaXpEvent.update({
        where: { id: fresh.id },
        data: { status: 'VALIDATED', points: c.points, flags: c.capped ? [...fresh.flags, 'CAPPED'] : fresh.flags },
      })
      validated += 1
      users.add(fresh.userId)
      await evaluateAchievements(tx, { tenantId, userId: fresh.userId, studentId: fresh.studentId }, scoring, tz)
    })
  }
  for (const u of users) await refreshProjectionSafely(u)
  return { validated, rejected, users: [...users] }
}

export type TapasyaJob = 'reconcile' | 'sweep' | 'rebuild' | 'snapshot' | 'all'

export async function runTapasyaJobs(job: TapasyaJob) {
  const report: Record<string, unknown> = {}
  const tenants = await prisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, slug: true, status: true, timezone: true, currency: true, locale: true },
  })
  if (job === 'reconcile' || job === 'all') {
    let validated = 0
    let rejected = 0
    for (const t of tenants) {
      const r = await reconcileTenant(t.id)
      validated += r.validated
      rejected += r.rejected
    }
    report.reconcile = { validated, rejected }
  }
  if (job === 'sweep' || job === 'all') {
    let swept = 0
    for (const t of tenants) swept += await sweepStaleSessions(systemContext(t))
    report.sweep = { swept }
  }
  if (job === 'rebuild' || job === 'all') report.rebuild = await rebuildProjection()
  if (job === 'snapshot' || job === 'all') report.snapshot = await takeSnapshots()
  return report
}
