import { Prisma } from '@prisma/client'
import type { z } from 'zod'
import type { AppContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { ApiException, badRequest, notFound } from '@/server/api/response'
import { audit } from '@/server/audit'
import { notify } from '@/server/notifications'
import { AVATAR_KEYS, aliasKey, validateAlias } from '@/lib/tapasya/alias'
import { getGlobalSettings, getSchoolPolicy } from './config'
import { assertGuardianOf, currentStudent, guardianChildIds, limitOrThrow } from './people'
import { refreshProjectionSafely, removeFromBoard } from './leaderboard'
import type { profileSchema } from './schema'

/**
 * Global leaderboard participation.
 *
 * Off by default for everyone: a student picks an alias, and nothing appears
 * on the board until a linked guardian approves. Either of them can withdraw
 * at any time, which removes the public entries immediately (the student's own
 * XP history is kept — it belongs to the school record, not the board).
 */

export type ProfileDto = { alias: string; avatarKey: string; showBadges: boolean; division: string | null; status: string; consentAt: string | null }

function dto(p: { alias: string; avatarKey: string; showBadges: boolean; division: string | null; status: string; consentAt: Date | null }): ProfileDto {
  return { alias: p.alias, avatarKey: p.avatarKey, showBadges: p.showBadges, division: p.division, status: p.status, consentAt: p.consentAt?.toISOString() ?? null }
}

async function participationAllowed(ctx: AppContext): Promise<void> {
  const [settings, policy] = await Promise.all([getGlobalSettings(), getSchoolPolicy(ctx)])
  if (!settings.leaderboardEnabled) throw new ApiException(403, 'LEADERBOARD_OFF', 'The global leaderboard is not open right now.')
  if (!policy.enabled || !policy.globalLeaderboardAllowed) throw new ApiException(403, 'LEADERBOARD_SCHOOL_OFF', 'Your school has not enabled the global leaderboard.')
}

async function guardianUserIds(ctx: AppContext, studentId: string): Promise<string[]> {
  const links = await ctx.db.studentGuardian.findMany({
    where: { studentId },
    select: { parent: { select: { userId: true, deletedAt: true } } },
  })
  return links.map((l) => (l.parent.deletedAt ? null : l.parent.userId)).filter((u): u is string => Boolean(u))
}

export async function getOwnProfile(ctx: AppContext): Promise<ProfileDto | null> {
  const p = await prisma.globalLeaderboardProfile.findUnique({ where: { userId: ctx.user.userId } })
  return p ? dto(p) : null
}

/**
 * Creates or edits the student's public identity. A new (or re-joining)
 * profile waits for guardian consent; editing an approved one keeps it live.
 */
export async function saveOwnProfile(ctx: AppContext, input: z.infer<typeof profileSchema>): Promise<ProfileDto> {
  await participationAllowed(ctx)
  const student = await currentStudent(ctx)
  await limitOrThrow(`tapasya:profile:${ctx.user.userId}`, 10, 3600)
  const errors = validateAlias(input.alias, student)
  if (errors.length) throw new ApiException(422, 'ALIAS_INVALID', errors[0]!, errors)
  if (!(AVATAR_KEYS as readonly string[]).includes(input.avatarKey)) throw badRequest('Choose one of the avatars.')

  const existing = await prisma.globalLeaderboardProfile.findUnique({ where: { userId: ctx.user.userId } })
  if (existing?.status === 'SUSPENDED') throw new ApiException(403, 'PROFILE_SUSPENDED', 'Your leaderboard profile was suspended by a moderator.')
  const rejoining = !existing || existing.status === 'OPTED_OUT' || existing.status === 'SCHOOL_DISABLED'
  const data = {
    alias: input.alias.trim(),
    aliasKey: aliasKey(input.alias),
    avatarKey: input.avatarKey,
    showBadges: input.showBadges,
    division: input.division ?? null,
  }

  let saved
  try {
    saved = existing
      ? await prisma.globalLeaderboardProfile.update({
        where: { id: existing.id },
        data: { ...data, ...(rejoining ? { status: 'PENDING_GUARDIAN' as const, consentAt: null, consentByUserId: null, optedOutAt: null } : {}) },
      })
      : await prisma.globalLeaderboardProfile.create({ data: { ...data, userId: ctx.user.userId, tenantId: ctx.tenant.id, status: 'PENDING_GUARDIAN' } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ApiException(409, 'ALIAS_TAKEN', 'That alias is taken. Try another.')
    throw err
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    action: rejoining ? 'tapasya.global.request' : 'tapasya.global.edit',
    module: 'tapasya',
    entityType: 'GlobalLeaderboardProfile',
    entityId: saved.id,
    summary: rejoining ? 'Asked a guardian to approve global leaderboard participation' : 'Edited global leaderboard alias',
  })

  if (rejoining) {
    const guardians = await guardianUserIds(ctx, student.id)
    if (guardians.length) {
      await notify(ctx, {
        userIds: guardians,
        eventKey: 'tapasya.global.consent',
        title: 'Leaderboard approval needed',
        body: `${student.firstName} would like to join the MyCampusView global study leaderboard under an alias. Nothing is shared until you approve.`,
        linkUrl: '/tapasya/guardian',
      }).catch((err) => console.error('[tapasya] consent notification failed', err))
    }
  } else if (saved.status === 'ACTIVE') {
    await refreshProjectionSafely(ctx.user.userId)
  }
  return dto(saved)
}

/** Student withdraws. Public entries go immediately. */
export async function optOutSelf(ctx: AppContext): Promise<void> {
  const p = await prisma.globalLeaderboardProfile.findUnique({ where: { userId: ctx.user.userId } })
  if (!p) return
  await withdraw(ctx, p.id, p.userId, 'student')
}

async function withdraw(ctx: AppContext, profileId: string, userId: string, by: 'student' | 'guardian'): Promise<void> {
  await prisma.globalLeaderboardProfile.update({ where: { id: profileId }, data: { status: 'OPTED_OUT', optedOutAt: new Date() } })
  await removeFromBoard(profileId)
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    action: 'tapasya.global.opt_out',
    module: 'tapasya',
    entityType: 'GlobalLeaderboardProfile',
    entityId: profileId,
    summary: `Global leaderboard participation withdrawn by ${by}`,
    after: { userId },
  })
}

/** Children of the signed-in guardian and their participation status. */
export async function guardianConsentList(ctx: AppContext) {
  const ids = await guardianChildIds(ctx)
  if (!ids.length) return []
  const students = await ctx.db.student.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, userId: true, firstName: true, lastName: true } })
  const userIds = students.map((s) => s.userId).filter((u): u is string => Boolean(u))
  const profiles = userIds.length
    ? await prisma.globalLeaderboardProfile.findMany({ where: { userId: { in: userIds }, tenantId: ctx.tenant.id } })
    : []
  return students.map((s) => {
    const p = profiles.find((x) => x.userId === s.userId)
    return { studentId: s.id, name: `${s.firstName} ${s.lastName}`.trim(), profile: p ? dto(p) : null }
  })
}

/** A guardian approves or declines (or later withdraws) a child's participation. */
export async function guardianDecide(ctx: AppContext, studentId: string, decision: 'APPROVE' | 'DECLINE' | 'WITHDRAW'): Promise<ProfileDto | null> {
  await assertGuardianOf(ctx, studentId)
  const student = await ctx.db.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { userId: true } })
  if (!student?.userId) throw notFound('Student')
  const p = await prisma.globalLeaderboardProfile.findUnique({ where: { userId: student.userId } })
  if (!p || p.tenantId !== ctx.tenant.id) throw notFound('Leaderboard request')

  if (decision === 'APPROVE') {
    await participationAllowed(ctx)
    if (p.status !== 'PENDING_GUARDIAN') throw new ApiException(409, 'NOT_PENDING', 'There is no pending request to approve.')
    const saved = await prisma.globalLeaderboardProfile.update({
      where: { id: p.id },
      data: { status: 'ACTIVE', consentByUserId: ctx.user.userId, consentAt: new Date() },
    })
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      action: 'tapasya.global.consent',
      module: 'tapasya',
      entityType: 'GlobalLeaderboardProfile',
      entityId: p.id,
      summary: 'Guardian approved global leaderboard participation',
    })
    await refreshProjectionSafely(student.userId)
    return dto(saved)
  }
  await withdraw(ctx, p.id, student.userId, 'guardian')
  return dto({ ...p, status: 'OPTED_OUT' })
}

/**
 * Applies a school's participation switch to all its profiles. Switching off
 * hides every entry at once; switching back on restores only profiles that
 * already had guardian consent.
 */
export async function applySchoolParticipation(tenantId: string, allowed: boolean): Promise<void> {
  if (!allowed) {
    const affected = await prisma.globalLeaderboardProfile.findMany({ where: { tenantId, status: { in: ['ACTIVE', 'PENDING_GUARDIAN'] } }, select: { id: true } })
    await prisma.globalLeaderboardProfile.updateMany({ where: { id: { in: affected.map((a) => a.id) } }, data: { status: 'SCHOOL_DISABLED' } })
    for (const a of affected) await removeFromBoard(a.id)
    return
  }
  const disabled = await prisma.globalLeaderboardProfile.findMany({ where: { tenantId, status: 'SCHOOL_DISABLED' } })
  for (const p of disabled) {
    await prisma.globalLeaderboardProfile.update({ where: { id: p.id }, data: { status: p.consentAt ? 'ACTIVE' : 'PENDING_GUARDIAN' } })
    if (p.consentAt) await refreshProjectionSafely(p.userId)
  }
}
