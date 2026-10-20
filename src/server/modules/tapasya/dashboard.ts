import type { Prisma } from '@prisma/client'
import type { z } from 'zod'
import type { AppContext } from '@/server/context'
import { badRequest } from '@/server/api/response'
import { ACHIEVEMENTS, levelFor } from '@/lib/tapasya/achievements'
import { CAPABILITY_STATES, type CapabilityState } from '@/lib/tapasya/device'
import { localDate } from '@/lib/tapasya/periods'
import { getGlobalSettings, getSchoolPolicy, scoringAt } from './config'
import { achievementStats, capWindows } from './xp'
import { todayView } from './tasks'
import { getActiveSession } from './sessions'
import type { deviceReportSchema } from './schema'

/** XP totals, level, streak and achievements for one student user. */
export async function xpSummary(ctx: AppContext, userId: string) {
  const settings = await getGlobalSettings()
  const tz = settings.timezone
  const now = new Date()
  const w = capWindows(now, tz)
  const scoring = await scoringAt(now)
  const base = { userId, status: 'VALIDATED' as const }
  const [total, today, week, pending, earned] = await Promise.all([
    ctx.db.tapasyaXpEvent.aggregate({ where: base, _sum: { points: true } }),
    ctx.db.tapasyaXpEvent.aggregate({ where: { ...base, occurredAt: { gte: w.dayStart, lt: w.dayEnd } }, _sum: { points: true } }),
    ctx.db.tapasyaXpEvent.aggregate({ where: { ...base, occurredAt: { gte: w.weekStart, lt: w.weekEnd } }, _sum: { points: true } }),
    ctx.db.tapasyaXpEvent.aggregate({ where: { userId, status: 'PENDING' }, _sum: { points: true } }),
    ctx.db.tapasyaUserAchievement.findMany({ where: { userId }, select: { achievementKey: true, awardedAt: true } }),
  ])
  const stats = await achievementStats(ctx.db as unknown as Prisma.TransactionClient, userId, tz, now)
  const totalXp = Math.max(0, total._sum.points ?? 0)
  const earnedMap = new Map(earned.map((e) => [e.achievementKey, e.awardedAt.toISOString()]))
  return {
    totalXp,
    todayXp: today._sum.points ?? 0,
    weekXp: week._sum.points ?? 0,
    pendingXp: pending._sum.points ?? 0,
    level: levelFor(totalXp),
    streakDays: stats.streakDays,
    focusMinutes: stats.focusMinutes,
    completedIntervals: stats.completedIntervals,
    intervalsThisWeek: stats.intervalsThisWeek,
    caps: { daily: scoring.rules.dailyCap, weekly: scoring.rules.weeklyCap },
    scoringVersion: scoring.version,
    achievements: ACHIEVEMENTS.map((a) => ({ key: a.key, title: a.title, description: a.description, awardedAt: earnedMap.get(a.key) ?? null })),
  }
}

/** The ledger itself, newest first: what earned what, and what did not and why. */
export async function xpLedger(ctx: AppContext, userId: string, page: number, pageSize: number) {
  const where = { userId }
  const [total, rows] = await Promise.all([
    ctx.db.tapasyaXpEvent.count({ where }),
    ctx.db.tapasyaXpEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, eventType: true, points: true, status: true, rejectionReason: true, flags: true, scoringVersion: true, occurredAt: true, correctionReason: true },
    }),
  ])
  return { total, items: rows.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() })) }
}

export async function studentDashboard(ctx: AppContext, student: { id: string; userId: string }) {
  const [summary, today, active, policy, profile] = await Promise.all([
    xpSummary(ctx, student.userId),
    todayView(ctx, student.id),
    getActiveSession(ctx),
    getSchoolPolicy(ctx),
    ctx.db.globalLeaderboardProfile.findFirst({ where: { userId: student.userId }, select: { alias: true, avatarKey: true, status: true } }),
  ])
  const settings = await getGlobalSettings()
  return {
    summary,
    today,
    activeSession: active,
    policy: { enabled: policy.enabled, globalLeaderboardAllowed: policy.globalLeaderboardAllowed && settings.leaderboardEnabled },
    globalProfile: profile,
    leaderboardDate: localDate(new Date(), settings.timezone),
  }
}

/**
 * Records what a device says it can do. Informational only — it changes what
 * the app may attempt and what the guardian sees, never XP.
 */
export async function reportDevice(ctx: AppContext, input: z.infer<typeof deviceReportSchema>) {
  if (!CAPABILITY_STATES.includes(input.capabilityState as CapabilityState)) throw badRequest('Unknown capability state.')
  const json = JSON.stringify(input.capabilities)
  if (json.length > 4000) throw badRequest('Capability report is too large.')
  const data = {
    platform: input.platform,
    osVersion: input.osVersion ?? null,
    appVersion: input.appVersion ?? null,
    capabilityState: input.capabilityState,
    capabilities: input.capabilities as never,
    managed: input.managed,
    lastReportedAt: new Date(),
  }
  const existing = await ctx.db.tapasyaDevice.findFirst({ where: { userId: ctx.user.userId, installationId: input.installationId } })
  const row = existing
    ? await ctx.db.tapasyaDevice.update({ where: { id: existing.id }, data })
    : await ctx.db.tapasyaDevice.create({ data: { tenantId: ctx.tenant.id, userId: ctx.user.userId, installationId: input.installationId, ...data } })
  return { id: row.id, capabilityState: row.capabilityState, lastReportedAt: row.lastReportedAt.toISOString() }
}

export async function devicesFor(ctx: AppContext, userId: string) {
  const rows = await ctx.db.tapasyaDevice.findMany({ where: { userId }, orderBy: { lastReportedAt: 'desc' }, take: 10 })
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    osVersion: r.osVersion,
    appVersion: r.appVersion,
    capabilityState: r.capabilityState,
    capabilities: r.capabilities,
    managed: r.managed,
    lastReportedAt: r.lastReportedAt.toISOString(),
  }))
}
