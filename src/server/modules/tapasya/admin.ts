import type { z } from 'zod'
import type { AppContext, PlatformContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { ApiException, badRequest, notFound } from '@/server/api/response'
import { audit } from '@/server/audit'
import { validateSchoolPolicy, type PlatformLimits } from '@/lib/tapasya/policy'
import { diffRules, normalizeRules, previewRules, validateRules, type ScoringRules } from '@/lib/tapasya/scoring'
import { getGlobalSettings, getSchoolPolicy, saveGlobalSettings, scoringAt, type GlobalSettings } from './config'
import { applySchoolParticipation } from './profiles'
import { refreshProjectionSafely, removeFromBoard } from './leaderboard'
import { capWindows } from './xp'
import type { schoolPolicySchema } from './schema'

// --- School administrator ---------------------------------------------------

export async function saveSchoolPolicy(ctx: AppContext, input: z.infer<typeof schoolPolicySchema>) {
  const settings = await getGlobalSettings()
  const issues = validateSchoolPolicy(input, settings.limits)
  if (input.maxUnlockMinutes > 120) issues.push({ field: 'maxUnlockMinutes', message: 'At most 120 minutes.' })
  if (issues.length) throw new ApiException(422, 'POLICY_INVALID', issues[0]!.message, issues)

  const before = await getSchoolPolicy(ctx)
  const existing = await ctx.db.tapasyaSchoolPolicy.findFirst({})
  if (existing) {
    await ctx.db.tapasyaSchoolPolicy.update({ where: { id: existing.id }, data: { ...input, updatedById: ctx.user.userId } })
  } else {
    await ctx.db.tapasyaSchoolPolicy.create({ data: { tenantId: ctx.tenant.id, ...input, updatedById: ctx.user.userId } })
  }
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    action: 'tapasya.policy.update',
    module: 'tapasya',
    entityType: 'TapasyaSchoolPolicy',
    summary: 'Updated Tapasya Mode school policy',
    before,
    after: input,
  })

  const wasIn = before.enabled && before.globalLeaderboardAllowed
  const isIn = input.enabled && input.globalLeaderboardAllowed
  if (wasIn !== isIn) await applySchoolParticipation(ctx.tenant.id, isIn)
  return getSchoolPolicy(ctx)
}

/** School-only leaderboard (names visible to schoolmates only), when the school enables it. */
export async function schoolBoard(ctx: AppContext, period: 'WEEKLY' | 'MONTHLY', sectionId: string | null) {
  const policy = await getSchoolPolicy(ctx)
  if (!policy.schoolLeaderboardEnabled) return { enabled: false as const, rows: [] }
  const settings = await getGlobalSettings()
  const w = capWindows(new Date(), settings.timezone)
  const from = period === 'WEEKLY' ? w.weekStart : new Date(new Date().getTime() - 30 * 86_400_000)

  const studentFilter = sectionId
    ? (await ctx.db.enrollment.findMany({ where: { sectionId, isCurrent: true }, select: { studentId: true } })).map((e) => e.studentId)
    : null
  const grouped = await ctx.db.tapasyaXpEvent.groupBy({
    by: ['studentId'],
    where: { status: 'VALIDATED', occurredAt: { gte: from }, ...(studentFilter ? { studentId: { in: studentFilter } } : {}) },
    _sum: { points: true },
    orderBy: { _sum: { points: 'desc' } },
    take: 50,
  })
  const ids = grouped.map((g) => g.studentId)
  const students = ids.length ? await ctx.db.student.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : []
  const rows = grouped
    .map((g) => ({ studentId: g.studentId, xp: g._sum.points ?? 0, s: students.find((s) => s.id === g.studentId) }))
    .filter((r) => r.xp > 0 && r.s)
    .map((r, i) => ({ rank: i + 1, name: `${r.s!.firstName} ${r.s!.lastName.slice(0, 1)}.`.trim(), xp: r.xp, studentId: r.studentId }))
  return { enabled: true as const, rows }
}

// --- Platform administrator -------------------------------------------------

export async function platformOverview() {
  const since = new Date(Date.now() - 7 * 86_400_000)
  const [profiles, sessions7d, xpByStatus, flagged, schools, current, settings] = await Promise.all([
    prisma.globalLeaderboardProfile.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.tapasyaFocusSession.count({ where: { startedAt: { gte: since } } }),
    prisma.tapasyaXpEvent.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true }, _sum: { points: true } }),
    prisma.tapasyaXpEvent.count({ where: { createdAt: { gte: since }, flags: { has: 'CAPPED' } } }),
    prisma.globalLeaderboardProfile.findMany({ where: { status: 'ACTIVE' }, distinct: ['tenantId'], select: { tenantId: true } }),
    scoringAt(new Date()),
    getGlobalSettings(),
  ])
  return {
    profiles: Object.fromEntries(profiles.map((p) => [p.status, p._count._all])),
    sessions7d,
    xp7d: xpByStatus.map((x) => ({ status: x.status, events: x._count._all, points: x._sum.points ?? 0 })),
    cappedEvents7d: flagged,
    participatingSchools: schools.length,
    scoring: { version: current.version, effectiveFrom: current.effectiveFrom?.toISOString() ?? null, rules: current.rules },
    settings,
  }
}

export async function scoringVersions() {
  const rows = await prisma.globalScoringConfig.findMany({ orderBy: { version: 'desc' }, take: 50 })
  return rows.map((r) => ({ version: r.version, rules: normalizeRules(r.rules), effectiveFrom: r.effectiveFrom.toISOString(), reason: r.reason, createdById: r.createdById, createdAt: r.createdAt.toISOString() }))
}

export async function previewScoring(proposed: ScoringRules) {
  const current = await scoringAt(new Date())
  const rules = normalizeRules(proposed)
  return { issues: validateRules(rules), diff: diffRules(current.rules, rules), samples: previewRules(current.rules, rules), currentVersion: current.version }
}

/**
 * Publishes a new rule version. Prospective only: it applies to activity from
 * its effective date, never re-scores the past, and needs a written reason.
 */
export async function publishScoring(ctx: PlatformContext, input: { rules: ScoringRules; effectiveFrom: string; reason: string }) {
  const rules = normalizeRules(input.rules)
  const issues = validateRules(rules)
  if (issues.length) throw new ApiException(422, 'RULES_INVALID', issues[0]!.message, issues)
  const effectiveFrom = new Date(input.effectiveFrom)
  if (Number.isNaN(effectiveFrom.getTime())) throw badRequest('Choose an effective date.')
  if (effectiveFrom.getTime() < Date.now() - 60_000) throw badRequest('Rule changes apply from now on — choose a time that has not passed.')
  if (input.reason.trim().length < 10) throw badRequest('Explain the change in at least 10 characters.')

  const current = await scoringAt(new Date())
  const created = await prisma.$transaction(async (tx) => {
    const last = await tx.globalScoringConfig.findFirst({ orderBy: { version: 'desc' }, select: { version: true, effectiveFrom: true } })
    if (last && effectiveFrom < last.effectiveFrom) throw badRequest('A later version is already scheduled; choose a date after it.')
    return tx.globalScoringConfig.create({
      data: { version: (last?.version ?? 0) + 1, rules: rules as never, effectiveFrom, reason: input.reason.trim(), createdById: ctx.user.userId },
    })
  })
  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    action: 'tapasya.scoring.publish',
    module: 'platform',
    entityType: 'GlobalScoringConfig',
    entityId: created.id,
    summary: `Published XP rules v${created.version}, effective ${effectiveFrom.toISOString()}: ${input.reason.trim()}`,
    before: { version: current.version, rules: current.rules },
    after: { version: created.version, rules, effectiveFrom: effectiveFrom.toISOString(), diff: diffRules(current.rules, rules) },
  })
  return { version: created.version, effectiveFrom: created.effectiveFrom.toISOString() }
}

export async function listSeasons() {
  const rows = await prisma.globalLeaderboardSeason.findMany({ orderBy: { startsAt: 'desc' }, take: 50 })
  return rows.map((s) => ({ id: s.id, name: s.name, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() }))
}

export async function createSeason(ctx: PlatformContext, input: { name: string; startsAt: string; endsAt: string }) {
  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  if (!(startsAt < endsAt)) throw badRequest('A season must end after it starts.')
  const overlap = await prisma.globalLeaderboardSeason.findFirst({ where: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })
  if (overlap) throw badRequest(`Overlaps season "${overlap.name}".`)
  const s = await prisma.globalLeaderboardSeason.create({ data: { name: input.name.trim(), startsAt, endsAt, createdById: ctx.user.userId } })
  await audit({ tenantId: null, actorId: ctx.user.userId, action: 'tapasya.season.create', module: 'platform', entityType: 'GlobalLeaderboardSeason', entityId: s.id, summary: `Created season "${s.name}"` })
  return { id: s.id }
}

export async function updateGlobalSettings(ctx: PlatformContext, next: GlobalSettings) {
  const l: PlatformLimits = next.limits
  if (l.minFocusMinutes < 1 || l.minFocusMinutes > l.maxFocusMinutes) throw badRequest('Focus range is invalid.')
  if (l.minBreakMinutes < 1 || l.minBreakMinutes > l.maxBreakMinutes) throw badRequest('Break range is invalid.')
  if (l.maxCyclesPerSession < 1 || l.maxCyclesPerSession > 24) throw badRequest('Cycles per session must be 1 to 24.')
  if (l.maxPauseMinutes < 1 || l.idleExpiryMinutes < 5) throw badRequest('Pause and idle limits are too small.')
  try {
    new Intl.DateTimeFormat('en', { timeZone: next.timezone })
  } catch {
    throw badRequest('Unknown timezone.')
  }
  const before = await getGlobalSettings()
  await saveGlobalSettings(next, ctx.user.userId)
  await audit({ tenantId: null, actorId: ctx.user.userId, action: 'tapasya.settings.update', module: 'platform', entityType: 'GlobalTapasyaSetting', entityId: 'platform', summary: 'Updated Tapasya platform settings', before, after: next })
  return getGlobalSettings()
}

/** Profiles for moderation, with abuse signals from the last 14 days. */
export async function moderationList(filter: { status?: string; q?: string }) {
  const since = new Date(Date.now() - 14 * 86_400_000)
  const profiles = await prisma.globalLeaderboardProfile.findMany({
    where: {
      ...(filter.status ? { status: filter.status as never } : {}),
      ...(filter.q ? { aliasKey: { contains: filter.q.toLowerCase().replace(/[\s_]+/g, '') } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
  if (!profiles.length) return []
  const userIds = profiles.map((p) => p.userId)
  const [capped, rejected, pending, allTime, tenants] = await Promise.all([
    prisma.tapasyaXpEvent.groupBy({ by: ['userId'], where: { userId: { in: userIds }, createdAt: { gte: since }, flags: { has: 'CAPPED' } }, _count: { _all: true } }),
    prisma.tapasyaXpEvent.groupBy({ by: ['userId'], where: { userId: { in: userIds }, createdAt: { gte: since }, status: 'REJECTED' }, _count: { _all: true } }),
    prisma.tapasyaXpEvent.groupBy({ by: ['userId'], where: { userId: { in: userIds }, status: 'PENDING' }, _count: { _all: true } }),
    prisma.globalLeaderboardEntry.findMany({ where: { profileId: { in: profiles.map((p) => p.id) }, period: 'ALL_TIME' }, select: { profileId: true, xp: true } }),
    prisma.tenant.findMany({ where: { id: { in: [...new Set(profiles.map((p) => p.tenantId))] } }, select: { id: true, name: true } }),
  ])
  const n = (rows: { userId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.userId === id)?._count._all ?? 0
  return profiles.map((p) => ({
    id: p.id,
    alias: p.alias,
    avatarKey: p.avatarKey,
    status: p.status,
    school: tenants.find((t) => t.id === p.tenantId)?.name ?? '—',
    allTimeXp: allTime.find((e) => e.profileId === p.id)?.xp ?? 0,
    signals: { capped14d: n(capped, p.userId), rejected14d: n(rejected, p.userId), pending: n(pending, p.userId) },
    updatedAt: p.updatedAt.toISOString(),
  }))
}

export async function moderateProfile(ctx: PlatformContext, profileId: string, action: 'SUSPEND' | 'RESTORE', reason: string) {
  if (reason.trim().length < 5) throw badRequest('Give a reason.')
  const p = await prisma.globalLeaderboardProfile.findUnique({ where: { id: profileId } })
  if (!p) throw notFound('Profile')
  if (action === 'SUSPEND') {
    await prisma.globalLeaderboardProfile.update({ where: { id: p.id }, data: { status: 'SUSPENDED' } })
    await removeFromBoard(p.id)
  } else {
    if (p.status !== 'SUSPENDED') throw badRequest('Only a suspended profile can be restored.')
    await prisma.globalLeaderboardProfile.update({ where: { id: p.id }, data: { status: p.consentAt ? 'ACTIVE' : 'PENDING_GUARDIAN' } })
    await refreshProjectionSafely(p.userId)
  }
  await audit({ tenantId: null, actorId: ctx.user.userId, action: `tapasya.profile.${action.toLowerCase()}`, module: 'platform', entityType: 'GlobalLeaderboardProfile', entityId: p.id, summary: `${action === 'SUSPEND' ? 'Suspended' : 'Restored'} leaderboard alias "${p.alias}": ${reason.trim()}` })
}

/** Recent ledger rows for one profile, for investigating a correction. */
export async function profileLedger(profileId: string) {
  const p = await prisma.globalLeaderboardProfile.findUnique({ where: { id: profileId } })
  if (!p) throw notFound('Profile')
  const rows = await prisma.tapasyaXpEvent.findMany({
    where: { tenantId: p.tenantId, userId: p.userId },
    orderBy: { occurredAt: 'desc' },
    take: 100,
    select: { id: true, eventType: true, points: true, status: true, flags: true, rejectionReason: true, scoringVersion: true, occurredAt: true, correctsId: true, correctionReason: true },
  })
  return rows.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() }))
}

/**
 * Reverses one ledger row with a new CORRECTION row. The original stays, so
 * the history shows what was awarded, what was taken back, by whom and why.
 */
export async function reverseXp(ctx: PlatformContext, profileId: string, xpEventId: string, reason: string) {
  if (reason.trim().length < 10) throw badRequest('Explain the correction in at least 10 characters.')
  const p = await prisma.globalLeaderboardProfile.findUnique({ where: { id: profileId } })
  if (!p) throw notFound('Profile')
  const ev = await prisma.tapasyaXpEvent.findFirst({ where: { id: xpEventId, tenantId: p.tenantId, userId: p.userId } })
  if (!ev) throw notFound('XP event')
  if (ev.eventType === 'CORRECTION') throw badRequest('Corrections cannot themselves be reversed.')
  if (ev.status !== 'VALIDATED' || ev.points <= 0) throw badRequest('Only validated, positive awards can be reversed.')
  const res = await prisma.tapasyaXpEvent.createMany({
    data: [{
      tenantId: ev.tenantId,
      userId: ev.userId,
      studentId: ev.studentId,
      eventType: 'CORRECTION',
      sourceType: 'XP_EVENT',
      sourceId: ev.id,
      points: -ev.points,
      scoringVersion: ev.scoringVersion,
      status: 'VALIDATED',
      idempotencyKey: `correction:${ev.id}`,
      correctsId: ev.id,
      correctionReason: reason.trim(),
      actorUserId: ctx.user.userId,
      occurredAt: ev.occurredAt,
    }],
    skipDuplicates: true,
  })
  if (res.count === 0) throw badRequest('This award was already reversed.')
  await audit({ tenantId: null, actorId: ctx.user.userId, action: 'tapasya.xp.reverse', module: 'platform', entityType: 'TapasyaXpEvent', entityId: ev.id, summary: `Reversed ${ev.points} XP (${ev.eventType}) for alias "${p.alias}": ${reason.trim()}` })
  await refreshProjectionSafely(p.userId, [ev.occurredAt])
}

export async function recentAudit() {
  const rows = await prisma.auditLog.findMany({ where: { action: { startsWith: 'tapasya.' }, tenantId: null }, orderBy: { createdAt: 'desc' }, take: 50 })
  return rows.map((r) => ({ id: r.id, action: r.action, summary: r.summary, actorLabel: r.actorLabel, actorId: r.actorId, createdAt: r.createdAt.toISOString() }))
}
