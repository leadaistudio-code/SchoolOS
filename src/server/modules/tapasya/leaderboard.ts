import type { GlobalLeaderboardPeriod, GlobalProfileStatus } from '@prisma/client'
import { prisma } from '@/server/db/prisma'
import { addDays, localDate, periodKeys, startOfLocalDay, weekStart } from '@/lib/tapasya/periods'
import { getGlobalSettings } from './config'

/**
 * The global leaderboard projection.
 *
 * This is the one deliberately cross-school path in Tapasya, and it is narrow:
 *
 *  - It reads exactly two things from school data: the validated XP ledger of
 *    a user who has an ACTIVE global profile, and that user's achievement keys.
 *    Every such read is pinned to the profile's own (tenantId, userId).
 *  - It writes only to platform-owned tables (entries, snapshots) that
 *    `tenantDb` refuses to open, so no school-context code can read them.
 *  - What leaves it is an alias, an avatar key, XP and badge keys. Never a
 *    name, school, class, user id or tenant id.
 *
 * Entries are recomputed from the ledger rather than incremented, so the
 * projection is idempotent: running it twice, or after a correction, yields
 * the same numbers.
 */

export const RANKED_PERIODS: GlobalLeaderboardPeriod[] = ['ALL_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'SEASON']

type Range = { period: GlobalLeaderboardPeriod; key: string; from: Date | null; to: Date | null }

function monthRange(key: string, tz: string): { from: Date; to: Date } {
  const y = Number(key.slice(0, 4))
  const m = Number(key.slice(5, 7))
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { from: startOfLocalDay(`${key}-01`, tz), to: startOfLocalDay(next, tz) }
}

/** The period windows touched by activity at the given instants. */
async function rangesFor(instants: Date[], tz: string): Promise<Range[]> {
  const out = new Map<string, Range>()
  out.set('ALL_TIME:all', { period: 'ALL_TIME', key: 'all', from: null, to: null })
  for (const at of instants) {
    const keys = periodKeys(at, tz)
    const day = localDate(at, tz)
    out.set(`DAILY:${keys.DAILY}`, { period: 'DAILY', key: keys.DAILY, from: startOfLocalDay(day, tz), to: startOfLocalDay(addDays(day, 1), tz) })
    const monday = weekStart(day)
    out.set(`WEEKLY:${keys.WEEKLY}`, { period: 'WEEKLY', key: keys.WEEKLY, from: startOfLocalDay(monday, tz), to: startOfLocalDay(addDays(monday, 7), tz) })
    const month = monthRange(keys.MONTHLY, tz)
    out.set(`MONTHLY:${keys.MONTHLY}`, { period: 'MONTHLY', key: keys.MONTHLY, ...month })
  }
  const seasons = await prisma.globalLeaderboardSeason.findMany({
    where: { OR: instants.map((at) => ({ startsAt: { lte: at }, endsAt: { gt: at } })) },
  })
  for (const s of seasons) out.set(`SEASON:${s.id}`, { period: 'SEASON', key: s.id, from: s.startsAt, to: s.endsAt })
  return [...out.values()]
}

/**
 * Recomputes a user's entries for every period touched by `instants` (plus
 * now and all-time). A no-op unless the user has an ACTIVE profile.
 */
export async function refreshProjection(userId: string, instants: Date[] = []): Promise<void> {
  const profile = await prisma.globalLeaderboardProfile.findUnique({ where: { userId } })
  if (!profile || profile.status !== 'ACTIVE') return
  const settings = await getGlobalSettings()
  const ranges = await rangesFor([new Date(), ...instants], settings.timezone)

  for (const r of ranges) {
    const where = {
      tenantId: profile.tenantId,
      userId: profile.userId,
      status: 'VALIDATED' as const,
      ...(r.from && r.to ? { occurredAt: { gte: r.from, lt: r.to } } : {}),
    }
    const [sum, intervals, last] = await Promise.all([
      prisma.tapasyaXpEvent.aggregate({ where, _sum: { points: true } }),
      prisma.tapasyaXpEvent.count({ where: { ...where, eventType: 'FOCUS_INTERVAL', points: { gt: 0 } } }),
      prisma.tapasyaXpEvent.findFirst({ where: { ...where, points: { gt: 0 } }, orderBy: { occurredAt: 'desc' }, select: { occurredAt: true } }),
    ])
    const xp = Math.max(0, sum._sum.points ?? 0)
    if (xp === 0) {
      await prisma.globalLeaderboardEntry.deleteMany({ where: { profileId: profile.id, period: r.period, periodKey: r.key } })
      continue
    }
    const reachedAt = last?.occurredAt ?? new Date()
    await prisma.globalLeaderboardEntry.upsert({
      where: { profileId_period_periodKey: { profileId: profile.id, period: r.period, periodKey: r.key } },
      create: { profileId: profile.id, period: r.period, periodKey: r.key, xp, intervals, reachedAt },
      update: { xp, intervals, reachedAt },
    })
  }
}

/** Never lets a projection failure fail the request that earned the XP. */
export async function refreshProjectionSafely(userId: string, instants: Date[] = []): Promise<void> {
  try {
    await refreshProjection(userId, instants)
  } catch (err) {
    console.error('[tapasya] leaderboard projection refresh failed; the scheduled rebuild will repair it', err)
  }
}

/** Rebuilds every active profile. Safe to run repeatedly (cron). */
export async function rebuildProjection(): Promise<{ profiles: number }> {
  const profiles = await prisma.globalLeaderboardProfile.findMany({ where: { status: 'ACTIVE' }, select: { userId: true } })
  for (const p of profiles) await refreshProjection(p.userId)
  return { profiles: profiles.length }
}

/** Removes a profile's public footprint (entries and snapshots). The XP ledger is untouched. */
export async function removeFromBoard(profileId: string): Promise<void> {
  await prisma.$transaction([
    prisma.globalLeaderboardEntry.deleteMany({ where: { profileId } }),
    prisma.globalLeaderboardSnapshot.deleteMany({ where: { profileId } }),
  ])
}

export async function currentKey(period: GlobalLeaderboardPeriod, at = new Date()): Promise<string | null> {
  const settings = await getGlobalSettings()
  if (period === 'SEASON') {
    const season = await prisma.globalLeaderboardSeason.findFirst({ where: { startsAt: { lte: at }, endsAt: { gt: at } }, orderBy: { startsAt: 'desc' } })
    return season?.id ?? null
  }
  return periodKeys(at, settings.timezone)[period]
}

export type BoardRow = {
  rank: number
  alias: string
  avatarKey: string
  xp: number
  badges: string[]
  movement: number | null
  isYou: boolean
}

export type Board = {
  period: GlobalLeaderboardPeriod
  periodKey: string | null
  rows: BoardRow[]
  total: number
  page: number
  pageSize: number
  you: (BoardRow & { status: GlobalProfileStatus }) | null
  demo: false
}

async function badgesFor(profiles: { id: string; userId: string; tenantId: string; showBadges: boolean }[]): Promise<Map<string, string[]>> {
  const visible = profiles.filter((p) => p.showBadges)
  const out = new Map<string, string[]>()
  if (!visible.length) return out
  const rows = await prisma.tapasyaUserAchievement.findMany({
    where: { OR: visible.map((p) => ({ tenantId: p.tenantId, userId: p.userId })) },
    select: { userId: true, achievementKey: true },
  })
  const byUser = new Map<string, string[]>()
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r.achievementKey])
  for (const p of visible) out.set(p.id, byUser.get(p.userId) ?? [])
  return out
}

async function movementFor(period: GlobalLeaderboardPeriod, key: string, profileIds: string[], today: string): Promise<Map<string, number>> {
  if (!profileIds.length) return new Map()
  const yesterday = new Date(`${addDays(today, -1)}T00:00:00.000Z`)
  const snaps = await prisma.globalLeaderboardSnapshot.findMany({
    where: { period, periodKey: key, takenOn: yesterday, profileId: { in: profileIds } },
    select: { profileId: true, rank: true },
  })
  return new Map(snaps.map((s) => [s.profileId, s.rank]))
}

/** Ranked page of the live board. Ties go to whoever reached the score first. */
export async function getBoard(input: {
  period: GlobalLeaderboardPeriod
  page: number
  pageSize: number
  viewerUserId: string | null
  division?: string | null
}): Promise<Board> {
  const settings = await getGlobalSettings()
  const key = await currentKey(input.period)
  const empty: Board = { period: input.period, periodKey: key, rows: [], total: 0, page: input.page, pageSize: input.pageSize, you: null, demo: false }
  if (!key || !settings.leaderboardEnabled) return empty

  const where = {
    period: input.period,
    periodKey: key,
    xp: { gt: 0 },
    profile: { status: 'ACTIVE' as const, ...(input.division ? { division: input.division } : {}) },
  }
  const [total, entries] = await Promise.all([
    prisma.globalLeaderboardEntry.count({ where }),
    prisma.globalLeaderboardEntry.findMany({
      where,
      orderBy: [{ xp: 'desc' }, { reachedAt: 'asc' }, { id: 'asc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { profile: { select: { id: true, userId: true, tenantId: true, alias: true, avatarKey: true, showBadges: true } } },
    }),
  ])

  const today = localDate(new Date(), settings.timezone)
  const viewer = input.viewerUserId
    ? await prisma.globalLeaderboardProfile.findUnique({ where: { userId: input.viewerUserId } })
    : null
  const mine = viewer?.status === 'ACTIVE'
    ? await prisma.globalLeaderboardEntry.findUnique({ where: { profileId_period_periodKey: { profileId: viewer.id, period: input.period, periodKey: key } } })
    : null

  const profileIds = [...entries.map((e) => e.profile.id), ...(viewer ? [viewer.id] : [])]
  const [badges, previous] = await Promise.all([
    badgesFor([...entries.map((e) => e.profile), ...(viewer ? [viewer] : [])]),
    movementFor(input.period, key, profileIds, today),
  ])

  const rows: BoardRow[] = entries.map((e, i) => {
    const rank = (input.page - 1) * input.pageSize + i + 1
    const prev = previous.get(e.profile.id)
    return {
      rank,
      alias: e.profile.alias,
      avatarKey: e.profile.avatarKey,
      xp: e.xp,
      badges: badges.get(e.profile.id) ?? [],
      movement: prev === undefined ? null : prev - rank,
      isYou: e.profile.userId === input.viewerUserId,
    }
  })

  let you: Board['you'] = null
  if (viewer) {
    let rank = 0
    if (mine && mine.xp > 0 && viewer.status === 'ACTIVE') {
      const ahead = await prisma.globalLeaderboardEntry.count({
        where: {
          period: input.period,
          periodKey: key,
          profile: { status: 'ACTIVE', ...(input.division ? { division: input.division } : {}) },
          OR: [{ xp: { gt: mine.xp } }, { xp: mine.xp, reachedAt: { lt: mine.reachedAt } }],
        },
      })
      rank = ahead + 1
    }
    const prev = previous.get(viewer.id)
    you = {
      rank,
      alias: viewer.alias,
      avatarKey: viewer.avatarKey,
      xp: mine?.xp ?? 0,
      badges: badges.get(viewer.id) ?? [],
      movement: prev === undefined || rank === 0 ? null : prev - rank,
      isYou: true,
      status: viewer.status,
    }
  }

  return { ...empty, rows, total, you }
}

/** Daily rank snapshots for movement arrows. Idempotent per day. */
export async function takeSnapshots(at = new Date()): Promise<{ written: number }> {
  const settings = await getGlobalSettings()
  const takenOn = new Date(`${localDate(at, settings.timezone)}T00:00:00.000Z`)
  let written = 0
  for (const period of RANKED_PERIODS) {
    const key = await currentKey(period, at)
    if (!key) continue
    const entries = await prisma.globalLeaderboardEntry.findMany({
      where: { period, periodKey: key, xp: { gt: 0 }, profile: { status: 'ACTIVE' } },
      orderBy: [{ xp: 'desc' }, { reachedAt: 'asc' }, { id: 'asc' }],
      select: { profileId: true, xp: true },
    })
    await prisma.globalLeaderboardSnapshot.deleteMany({ where: { period, periodKey: key, takenOn } })
    if (entries.length) {
      const res = await prisma.globalLeaderboardSnapshot.createMany({
        data: entries.map((e, i) => ({ profileId: e.profileId, period, periodKey: key, rank: i + 1, xp: e.xp, takenOn })),
        skipDuplicates: true,
      })
      written += res.count
    }
  }
  return { written }
}
