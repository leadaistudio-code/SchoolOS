import type { AppContext } from '@/server/context'
import { guardianChildIds } from './people'
import { xpSummary, devicesFor } from './dashboard'
import { sessionHistory } from './sessions'
import { guardianConsentList } from './profiles'
import { guardianUnlocks } from './unlock'
import { todayView } from './tasks'

/** Everything a guardian sees for each linked child, in one call. */
export async function guardianOverview(ctx: AppContext) {
  const ids = await guardianChildIds(ctx)
  if (!ids.length) return { children: [], unlocks: [] }
  const [students, consent, unlocks] = await Promise.all([
    ctx.db.student.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, userId: true, firstName: true, lastName: true } }),
    guardianConsentList(ctx),
    guardianUnlocks(ctx),
  ])
  const children = await Promise.all(students.map(async (s) => {
    const [summary, history, devices, today] = await Promise.all([
      s.userId ? xpSummary(ctx, s.userId) : null,
      sessionHistory(ctx, s.id, 1, 5),
      s.userId ? devicesFor(ctx, s.userId) : [],
      todayView(ctx, s.id),
    ])
    return {
      studentId: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
      hasAccount: Boolean(s.userId),
      summary,
      recentSessions: history.items,
      devices,
      primaryFrog: today.primaryFrog,
      openTasks: today.open.length,
      leaderboard: consent.find((c) => c.studentId === s.id)?.profile ?? null,
    }
  }))
  return { children, unlocks }
}
