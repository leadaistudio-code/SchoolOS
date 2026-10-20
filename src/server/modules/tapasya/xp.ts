import type { Prisma, TapasyaRestrictionLevel, TapasyaXpStatus } from '@prisma/client'
import { applyCaps, scoreInterval, type ScoringRules } from '@/lib/tapasya/scoring'
import { addDays, currentStreak, isoWeekKey, localDate, startOfLocalDay, weekStart } from '@/lib/tapasya/periods'
import { ACHIEVEMENTS, earnedAchievementKeys, type AchievementStats } from '@/lib/tapasya/achievements'

/**
 * The XP ledger. Every point a student holds is a row here, written only by
 * the server from facts it recorded itself (intervals, task completions) —
 * there is no endpoint that accepts a points value from a client.
 *
 * Idempotency: each award has a deterministic key (`interval:<id>`,
 * `frog:<taskId>`, …) that is unique per school, and rows are inserted with
 * ON CONFLICT DO NOTHING, so a retried request or a replayed offline event
 * can never award twice.
 */

type Tx = Prisma.TransactionClient

export type XpWrite = {
  tenantId: string
  userId: string
  studentId: string
  eventType: 'FOCUS_INTERVAL' | 'ALL_CYCLES_BONUS' | 'FROG_BONUS' | 'ACHIEVEMENT' | 'CORRECTION'
  sourceType: string
  sourceId: string
  idempotencyKey: string
  points: number
  scoringVersion: number
  occurredAt: Date
  status?: TapasyaXpStatus
  rejectionReason?: string | null
  restrictionLevel?: TapasyaRestrictionLevel | null
  flags?: string[]
  /** Daily/weekly caps apply (everything but one-time achievements and corrections). */
  capped?: boolean
}

export type XpResult = { created: boolean; points: number; status: TapasyaXpStatus; capped: boolean }

/** Validated XP earned (excluding corrections) in [from, to). */
export async function earnedBetween(tx: Tx, userId: string, from: Date, to: Date): Promise<number> {
  const agg = await tx.tapasyaXpEvent.aggregate({
    where: { userId, status: 'VALIDATED', eventType: { not: 'CORRECTION' }, occurredAt: { gte: from, lt: to } },
    _sum: { points: true },
  })
  return agg._sum.points ?? 0
}

/** Start of the day and ISO week containing `at`, in the leaderboard timezone. */
export function capWindows(at: Date, tz: string): { dayStart: Date; dayEnd: Date; weekStart: Date; weekEnd: Date } {
  const day = localDate(at, tz)
  const monday = weekStart(day)
  return {
    dayStart: startOfLocalDay(day, tz),
    dayEnd: startOfLocalDay(addDays(day, 1), tz),
    weekStart: startOfLocalDay(monday, tz),
    weekEnd: startOfLocalDay(addDays(monday, 7), tz),
  }
}

export async function writeXp(tx: Tx, input: XpWrite, rules: ScoringRules, tz: string): Promise<XpResult> {
  const existing = await tx.tapasyaXpEvent.findFirst({ where: { idempotencyKey: input.idempotencyKey }, select: { points: true, status: true } })
  if (existing) return { created: false, points: existing.points, status: existing.status, capped: false }

  const status: TapasyaXpStatus = input.status ?? 'VALIDATED'
  const flags = [...(input.flags ?? [])]
  let points = input.points
  let capped = false
  if (status === 'VALIDATED' && input.capped !== false && points > 0) {
    const w = capWindows(input.occurredAt, tz)
    const [today, week] = await Promise.all([
      earnedBetween(tx, input.userId, w.dayStart, w.dayEnd),
      earnedBetween(tx, input.userId, w.weekStart, w.weekEnd),
    ])
    const c = applyCaps(points, today, week, rules)
    points = c.points
    capped = c.capped
    if (capped) flags.push('CAPPED')
  }

  const res = await tx.tapasyaXpEvent.createMany({
    data: [{
      tenantId: input.tenantId,
      userId: input.userId,
      studentId: input.studentId,
      eventType: input.eventType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      points: status === 'REJECTED' ? 0 : points,
      scoringVersion: input.scoringVersion,
      status,
      rejectionReason: input.rejectionReason ?? null,
      restrictionLevel: input.restrictionLevel ?? null,
      flags,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
    }],
    skipDuplicates: true,
  })
  return { created: res.count === 1, points, status, capped }
}

export type IntervalForXp = {
  id: string
  sessionId: string
  cycleIndex: number
  plannedMinutes: number
  focusMs: number
  pauseCount: number
  outcome: string
  endedAt: Date
  restrictionLevel: TapasyaRestrictionLevel
  offlineSynced: boolean
}

/**
 * XP for one recorded focus interval. Offline-synced intervals are written
 * PENDING and only count once reconciliation has validated them.
 */
export async function awardInterval(
  tx: Tx,
  who: { tenantId: string; userId: string; studentId: string },
  interval: IntervalForXp,
  scoring: { version: number; rules: ScoringRules },
  tz: string,
): Promise<XpResult> {
  const score = scoreInterval(scoring.rules, {
    plannedMinutes: interval.plannedMinutes,
    focusMs: interval.focusMs,
    pauseCount: interval.pauseCount,
    outcome: interval.outcome === 'COMPLETED' ? 'COMPLETED' : 'ABANDONED',
  })
  const status: TapasyaXpStatus = !score.eligible ? 'REJECTED' : interval.offlineSynced ? 'PENDING' : 'VALIDATED'
  return writeXp(tx, {
    ...who,
    eventType: 'FOCUS_INTERVAL',
    sourceType: 'INTERVAL',
    sourceId: interval.id,
    idempotencyKey: `interval:${interval.id}`,
    points: score.points,
    scoringVersion: scoring.version,
    occurredAt: interval.endedAt,
    status,
    rejectionReason: score.reason,
    restrictionLevel: interval.restrictionLevel,
    flags: interval.offlineSynced ? ['OFFLINE'] : [],
  }, scoring.rules, tz)
}

/**
 * Completion bonus for a session that ran every planned cycle. Requires the
 * cycles to have earned interval XP themselves, so a string of 5-minute
 * cycles (ineligible) cannot collect it.
 */
export async function awardAllCycles(
  tx: Tx,
  who: { tenantId: string; userId: string; studentId: string },
  session: { id: string; plannedCycles: number; restrictionLevel: TapasyaRestrictionLevel; offlineSynced: boolean; endedAt: Date },
  scoring: { version: number; rules: ScoringRules },
  tz: string,
): Promise<XpResult | null> {
  const { rules } = scoring
  if (rules.allCyclesBonus <= 0 || session.plannedCycles < rules.allCyclesMinCycles) return null
  const intervals = await tx.tapasyaFocusInterval.findMany({ where: { sessionId: session.id, outcome: 'COMPLETED' }, select: { id: true } })
  if (intervals.length < session.plannedCycles) return null
  const eligible = await tx.tapasyaXpEvent.count({
    where: { sourceType: 'INTERVAL', sourceId: { in: intervals.map((i) => i.id) }, status: { in: ['VALIDATED', 'PENDING'] } },
  })
  if (eligible < session.plannedCycles) return null
  return writeXp(tx, {
    ...who,
    eventType: 'ALL_CYCLES_BONUS',
    sourceType: 'SESSION',
    sourceId: session.id,
    idempotencyKey: `allcycles:${session.id}`,
    points: rules.allCyclesBonus,
    scoringVersion: scoring.version,
    occurredAt: session.endedAt,
    status: session.offlineSynced ? 'PENDING' : 'VALIDATED',
    restrictionLevel: session.restrictionLevel,
    flags: session.offlineSynced ? ['OFFLINE'] : [],
  }, rules, tz)
}

/**
 * Frog bonus: the primary frog finished on its frog day, with at least one
 * validated focus interval on that task. Ticking a box alone earns nothing.
 * One bonus per task, ever, and at most one per day.
 */
export async function awardFrog(
  tx: Tx,
  who: { tenantId: string; userId: string; studentId: string },
  task: { id: string; isPrimaryFrog: boolean; frogOn: Date | null; completedAt: Date | null },
  scoring: { version: number; rules: ScoringRules },
  tz: string,
  schoolTz: string,
): Promise<XpResult | null> {
  if (!task.isPrimaryFrog || !task.frogOn || !task.completedAt || scoring.rules.frogBonus <= 0) return null
  const frogDay = task.frogOn.toISOString().slice(0, 10)
  if (localDate(task.completedAt, schoolTz) !== frogDay) return null
  const intervals = await tx.tapasyaFocusInterval.findMany({
    where: { userId: who.userId, outcome: 'COMPLETED', session: { taskId: task.id } },
    select: { id: true },
  })
  if (intervals.length === 0) return null
  const validated = await tx.tapasyaXpEvent.count({
    where: { sourceType: 'INTERVAL', sourceId: { in: intervals.map((i) => i.id) }, status: 'VALIDATED' },
  })
  if (validated === 0) return null
  const w = capWindows(task.completedAt, tz)
  const frogsToday = await tx.tapasyaXpEvent.count({
    where: { userId: who.userId, eventType: 'FROG_BONUS', status: 'VALIDATED', occurredAt: { gte: w.dayStart, lt: w.dayEnd } },
  })
  if (frogsToday > 0) return null
  return writeXp(tx, {
    ...who,
    eventType: 'FROG_BONUS',
    sourceType: 'TASK',
    sourceId: task.id,
    idempotencyKey: `frog:${task.id}`,
    points: scoring.rules.frogBonus,
    scoringVersion: scoring.version,
    occurredAt: task.completedAt,
  }, scoring.rules, tz)
}

/** Facts for achievements, from validated history only. */
export async function achievementStats(tx: Tx, userId: string, tz: string, now = new Date()): Promise<AchievementStats> {
  const validated = await tx.tapasyaXpEvent.findMany({
    where: { userId, status: 'VALIDATED', eventType: { in: ['FOCUS_INTERVAL', 'FROG_BONUS'] } },
    select: { eventType: true, sourceId: true },
  })
  const intervalIds = validated.filter((v) => v.eventType === 'FOCUS_INTERVAL').map((v) => v.sourceId!).filter(Boolean)
  const intervals = intervalIds.length
    ? await tx.tapasyaFocusInterval.findMany({ where: { id: { in: intervalIds } }, select: { focusMs: true, endedAt: true } })
    : []
  const days = intervals.map((i) => localDate(i.endedAt, tz))
  const today = localDate(now, tz)
  const thisWeek = isoWeekKey(today)
  const weekDays = days.filter((d) => isoWeekKey(d) === thisWeek)
  return {
    completedIntervals: intervals.length,
    focusMinutes: Math.floor(intervals.reduce((s, i) => s + i.focusMs, 0) / 60_000),
    streakDays: currentStreak(days, today),
    primaryFrogsDone: validated.filter((v) => v.eventType === 'FROG_BONUS').length,
    activeDaysThisWeek: new Set(weekDays).size,
    intervalsThisWeek: weekDays.length,
  }
}

/** Awards any achievement newly earned, each once, with its one-time XP. */
export async function evaluateAchievements(
  tx: Tx,
  who: { tenantId: string; userId: string; studentId: string },
  scoring: { version: number; rules: ScoringRules },
  tz: string,
): Promise<string[]> {
  const stats = await achievementStats(tx, who.userId, tz)
  const earned = earnedAchievementKeys(stats)
  if (earned.length === 0) return []
  const have = new Set((await tx.tapasyaUserAchievement.findMany({ where: { userId: who.userId }, select: { achievementKey: true } })).map((a) => a.achievementKey))
  const fresh = earned.filter((k) => !have.has(k))
  const awarded: string[] = []
  for (const key of fresh) {
    const res = await tx.tapasyaUserAchievement.createMany({
      data: [{ tenantId: who.tenantId, userId: who.userId, achievementKey: key }],
      skipDuplicates: true,
    })
    if (res.count === 0) continue
    awarded.push(key)
    if (scoring.rules.achievementXp > 0) {
      await writeXp(tx, {
        ...who,
        eventType: 'ACHIEVEMENT',
        sourceType: 'ACHIEVEMENT',
        sourceId: key,
        idempotencyKey: `achievement:${who.userId}:${key}`,
        points: scoring.rules.achievementXp,
        scoringVersion: scoring.version,
        occurredAt: new Date(),
        capped: false,
      }, scoring.rules, tz)
    }
  }
  return awarded
}

export const ACHIEVEMENT_KEYS = ACHIEVEMENTS.map((a) => a.key)
