import crypto from 'node:crypto'
import type { TapasyaUnlockRequest } from '@prisma/client'
import type { z } from 'zod'
import { env } from '@/lib/env'
import type { AppContext } from '@/server/context'
import { ApiException, notFound } from '@/server/api/response'
import { audit } from '@/server/audit'
import { hmacSha256, timingSafeEqual } from '@/server/crypto'
import { notify } from '@/server/notifications'
import { sendParentMessage } from '@/server/messaging/send'
import { getGlobalSettings, requireTapasyaEnabled } from './config'
import { assertGuardianOf, currentStudent, guardianChildIds, limitOrThrow } from './people'
import { capWindows } from './xp'
import type { unlockDecisionSchema, unlockRequestSchema } from './schema'

/**
 * Guardian-approved temporary exceptions during a focus session.
 *
 * The student asks; the request goes to each linked guardian in the app, and a
 * one-time six-digit code goes to the guardian's phone over WhatsApp (SMS
 * fallback when the school enabled it). The guardian either approves in the
 * app or reads the code to the student, who enters it.
 *
 *  - The code is generated with `crypto.randomInt`, stored only as an HMAC
 *    salted with the request id, and never written to a log, notification,
 *    audit row or API response.
 *  - It expires in ten minutes, dies after five wrong attempts, and is erased
 *    the moment it is used, so it cannot be replayed.
 *  - It is bound to one request, which is bound to one student and session.
 *  - Request creation is idempotent per client key and rate-limited.
 *
 * What an approval grants is a window in which *the MyCampusView app* lifts
 * restrictions it applied itself. It cannot lift anything enforced by the
 * operating system, a school's device-management policy or Screen Time
 * settings the app does not own.
 */

const CODE_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5

export const UNLOCK_ACTION_LABEL: Record<string, string> = {
  OPEN_APPS: 'use other apps',
  END_SESSION: 'end the focus session early',
  BREAK_APPS: 'use other apps during the break',
}

function codeDigest(requestId: string, code: string): string {
  return hmacSha256(`tapasya-unlock:${requestId}:${code}`, env().AUTH_SECRET)
}

export type UnlockDto = {
  id: string
  action: string
  reason: string
  requestedMinutes: number
  status: string
  expiresAt: string
  attemptsLeft: number
  deliveryChannel: string | null
  deliveryFailed: boolean
  decidedVia: string | null
  decidedAt: string | null
  grantStartsAt: string | null
  grantEndsAt: string | null
  createdAt: string
}

function dto(r: TapasyaUnlockRequest): UnlockDto {
  return {
    id: r.id,
    action: r.action,
    reason: r.reason,
    requestedMinutes: r.requestedMinutes,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - r.attempts),
    deliveryChannel: r.deliveryChannel,
    deliveryFailed: Boolean(r.deliveryError),
    decidedVia: r.decidedVia,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    grantStartsAt: r.grantStartsAt?.toISOString() ?? null,
    grantEndsAt: r.grantEndsAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }
}

/** Expires a pending request whose time is up. Returns the current row. */
async function settleExpiry(ctx: AppContext, r: TapasyaUnlockRequest): Promise<TapasyaUnlockRequest> {
  if (r.status === 'PENDING' && r.expiresAt.getTime() <= Date.now()) {
    return ctx.db.tapasyaUnlockRequest.update({ where: { id: r.id }, data: { status: 'EXPIRED', codeHash: null } })
  }
  return r
}

async function guardiansOf(ctx: AppContext, studentId: string): Promise<{ userIds: string[]; phones: string[] }> {
  const links = await ctx.db.studentGuardian.findMany({
    where: { studentId },
    select: { parent: { select: { userId: true, phone: true, deletedAt: true } } },
  })
  const live = links.map((l) => l.parent).filter((p) => !p.deletedAt)
  return {
    userIds: live.map((p) => p.userId).filter((u): u is string => Boolean(u)),
    phones: [...new Set(live.map((p) => p.phone).filter((p): p is string => Boolean(p)))],
  }
}

export async function requestUnlock(ctx: AppContext, input: z.infer<typeof unlockRequestSchema>): Promise<UnlockDto> {
  const policy = await requireTapasyaEnabled(ctx)
  const student = await currentStudent(ctx)

  const existing = await ctx.db.tapasyaUnlockRequest.findFirst({ where: { requestedByUserId: ctx.user.userId, idempotencyKey: input.idempotencyKey } })
  if (existing) return dto(await settleExpiry(ctx, existing))

  await limitOrThrow(`tapasya:unlock:req:${ctx.user.userId}`, 5, 600)
  if (policy.maxUnlockRequestsPerDay === 0) throw new ApiException(403, 'UNLOCK_DISABLED', 'Your school does not allow exception requests.')
  if (input.requestedMinutes > policy.maxUnlockMinutes) {
    throw new ApiException(422, 'UNLOCK_TOO_LONG', `Ask for at most ${policy.maxUnlockMinutes} minutes.`)
  }
  const settings = await getGlobalSettings()
  const w = capWindows(new Date(), ctx.tenant.timezone || settings.timezone)
  const today = await ctx.db.tapasyaUnlockRequest.count({ where: { requestedByUserId: ctx.user.userId, createdAt: { gte: w.dayStart, lt: w.dayEnd } } })
  if (today >= policy.maxUnlockRequestsPerDay) {
    throw new ApiException(429, 'UNLOCK_LIMIT', `You can ask for ${policy.maxUnlockRequestsPerDay} exceptions a day.`)
  }

  if (input.sessionId) {
    const s = await ctx.db.tapasyaFocusSession.findFirst({ where: { id: input.sessionId, userId: ctx.user.userId }, select: { id: true } })
    if (!s) throw notFound('Session')
  }

  const guardians = await guardiansOf(ctx, student.id)
  if (!guardians.userIds.length && !guardians.phones.length) {
    throw new ApiException(409, 'NO_GUARDIAN', 'No guardian is linked to your account. Ask your school office to add one.')
  }

  // Only one open request at a time: a new one retires the previous code.
  await ctx.db.tapasyaUnlockRequest.updateMany({
    where: { requestedByUserId: ctx.user.userId, status: 'PENDING' },
    data: { status: 'CANCELLED', codeHash: null },
  })

  const row = await ctx.db.tapasyaUnlockRequest.create({
    data: {
      tenantId: ctx.tenant.id,
      studentId: student.id,
      requestedByUserId: ctx.user.userId,
      sessionId: input.sessionId ?? null,
      deviceId: input.deviceId ?? null,
      action: input.action,
      reason: input.reason,
      requestedMinutes: input.requestedMinutes,
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      idempotencyKey: input.idempotencyKey,
      guardianUserIds: guardians.userIds,
    },
  })

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  let channel: string | null = null
  let deliveryError: string | null = null
  if (guardians.phones.length) {
    const body = `MyCampusView Tapasya: ${student.firstName} asks for ${input.requestedMinutes} min to ${UNLOCK_ACTION_LABEL[input.action] ?? 'pause focus'}. `
      + `If you agree, tell them the code ${code}. It expires in ${CODE_TTL_MINUTES} minutes. You can also approve or decline in the MyCampusView app.`
    for (const to of guardians.phones) {
      const res = await sendParentMessage({ to, body })
      if (res.ok) {
        channel = res.channel ?? 'whatsapp'
        break
      }
      deliveryError = res.error ?? 'Message could not be sent'
    }
  } else {
    deliveryError = 'No guardian phone on record'
  }

  const updated = await ctx.db.tapasyaUnlockRequest.update({
    where: { id: row.id },
    data: channel
      ? { codeHash: codeDigest(row.id, code), deliveryChannel: channel, deliveryError: null }
      : { deliveryChannel: null, deliveryError: (deliveryError ?? 'Not sent').slice(0, 200), status: guardians.userIds.length ? 'PENDING' : 'DELIVERY_FAILED' },
  })

  if (guardians.userIds.length) {
    await notify(ctx, {
      userIds: guardians.userIds,
      eventKey: 'tapasya.unlock.requested',
      title: 'Study break request',
      body: `${student.firstName} asks for ${input.requestedMinutes} min to ${UNLOCK_ACTION_LABEL[input.action] ?? 'pause focus'}: "${input.reason.slice(0, 120)}"`,
      linkUrl: '/tapasya/guardian',
    }).catch((err) => console.error('[tapasya] unlock notification failed', err))
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    action: 'tapasya.unlock.request',
    module: 'tapasya',
    entityType: 'TapasyaUnlockRequest',
    entityId: row.id,
    summary: `Asked a guardian for ${input.requestedMinutes} min (${input.action}); code ${channel ? `sent by ${channel}` : 'not delivered'}`,
  })
  return dto(updated)
}

/** The student enters the code a guardian read to them. */
export async function redeemCode(ctx: AppContext, id: string, code: string): Promise<UnlockDto> {
  await limitOrThrow(`tapasya:unlock:code:${ctx.user.userId}`, 10, 600)
  let r = await ctx.db.tapasyaUnlockRequest.findFirst({ where: { id, requestedByUserId: ctx.user.userId } })
  if (!r) throw notFound('Request')
  r = await settleExpiry(ctx, r)
  if (r.status !== 'PENDING') throw new ApiException(409, 'UNLOCK_NOT_PENDING', r.status === 'EXPIRED' ? 'This code has expired. Send a new request.' : 'This request is no longer open.')
  if (!r.codeHash) throw new ApiException(409, 'UNLOCK_NO_CODE', 'No code was delivered for this request. Ask your guardian to approve it in the app.')

  // Count the attempt before comparing, atomically, so parallel guesses cannot exceed the cap.
  const bumped = await ctx.db.tapasyaUnlockRequest.updateMany({
    where: { id: r.id, status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  })
  if (bumped.count === 0) {
    await ctx.db.tapasyaUnlockRequest.update({ where: { id: r.id }, data: { status: 'EXPIRED', codeHash: null } })
    throw new ApiException(429, 'UNLOCK_LOCKED', 'Too many wrong codes. Send a new request.')
  }

  if (!timingSafeEqual(codeDigest(r.id, code), r.codeHash)) {
    const after = await ctx.db.tapasyaUnlockRequest.findFirstOrThrow({ where: { id: r.id } })
    if (after.attempts >= MAX_ATTEMPTS) {
      await ctx.db.tapasyaUnlockRequest.update({ where: { id: r.id }, data: { status: 'EXPIRED', codeHash: null } })
      throw new ApiException(429, 'UNLOCK_LOCKED', 'Too many wrong codes. Send a new request.')
    }
    throw new ApiException(422, 'UNLOCK_WRONG_CODE', `That code is not right. ${MAX_ATTEMPTS - after.attempts} attempt(s) left.`)
  }

  const now = new Date()
  const res = await ctx.db.tapasyaUnlockRequest.updateMany({
    where: { id: r.id, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      codeHash: null,
      decidedVia: 'CODE',
      decidedAt: now,
      grantStartsAt: now,
      grantEndsAt: new Date(now.getTime() + r.requestedMinutes * 60_000),
    },
  })
  if (res.count === 0) throw new ApiException(409, 'UNLOCK_NOT_PENDING', 'This request is no longer open.')
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    action: 'tapasya.unlock.code',
    module: 'tapasya',
    entityType: 'TapasyaUnlockRequest',
    entityId: r.id,
    summary: `Exception approved with guardian code for ${r.requestedMinutes} min`,
  })
  return dto(await ctx.db.tapasyaUnlockRequest.findFirstOrThrow({ where: { id: r.id } }))
}

export async function cancelUnlock(ctx: AppContext, id: string): Promise<UnlockDto> {
  const r = await ctx.db.tapasyaUnlockRequest.findFirst({ where: { id, requestedByUserId: ctx.user.userId } })
  if (!r) throw notFound('Request')
  if (r.status !== 'PENDING') return dto(r)
  return dto(await ctx.db.tapasyaUnlockRequest.update({ where: { id }, data: { status: 'CANCELLED', codeHash: null } }))
}

export async function ownUnlocks(ctx: AppContext): Promise<{ items: UnlockDto[]; activeGrant: UnlockDto | null }> {
  const rows = await ctx.db.tapasyaUnlockRequest.findMany({ where: { requestedByUserId: ctx.user.userId }, orderBy: { createdAt: 'desc' }, take: 20 })
  const settled = await Promise.all(rows.map((r) => settleExpiry(ctx, r)))
  const now = Date.now()
  const grant = settled.find((r) => r.status === 'APPROVED' && r.grantEndsAt && r.grantEndsAt.getTime() > now) ?? null
  return { items: settled.map(dto), activeGrant: grant ? dto(grant) : null }
}

/** Requests from the signed-in guardian's children. */
export async function guardianUnlocks(ctx: AppContext) {
  const ids = await guardianChildIds(ctx)
  if (!ids.length) return []
  const rows = await ctx.db.tapasyaUnlockRequest.findMany({
    where: { studentId: { in: ids } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { student: { select: { firstName: true, lastName: true } } },
  })
  const settled = await Promise.all(rows.map(async (r) => ({ row: await settleExpiry(ctx, r), student: r.student, studentId: r.studentId })))
  return settled.map((s) => ({ ...dto(s.row), studentId: s.studentId, studentName: `${s.student.firstName} ${s.student.lastName}`.trim() }))
}

export async function guardianDecideUnlock(ctx: AppContext, id: string, input: z.infer<typeof unlockDecisionSchema>): Promise<UnlockDto> {
  await limitOrThrow(`tapasya:unlock:decide:${ctx.user.userId}`, 30, 600)
  let r = await ctx.db.tapasyaUnlockRequest.findFirst({ where: { id } })
  if (!r) throw notFound('Request')
  await assertGuardianOf(ctx, r.studentId)
  r = await settleExpiry(ctx, r)
  if (r.status !== 'PENDING' && r.status !== 'DELIVERY_FAILED') throw new ApiException(409, 'UNLOCK_NOT_PENDING', 'This request is no longer open.')
  if (r.expiresAt.getTime() <= Date.now()) throw new ApiException(409, 'UNLOCK_NOT_PENDING', 'This request has expired.')

  const policy = await requireTapasyaEnabled(ctx)
  const now = new Date()
  const minutes = Math.min(input.minutes ?? r.requestedMinutes, r.requestedMinutes, policy.maxUnlockMinutes)
  const approve = input.decision === 'APPROVE'
  const res = await ctx.db.tapasyaUnlockRequest.updateMany({
    where: { id: r.id, status: r.status },
    data: approve
      ? { status: 'APPROVED', codeHash: null, decidedByUserId: ctx.user.userId, decidedVia: 'GUARDIAN_APP', decidedAt: now, grantStartsAt: now, grantEndsAt: new Date(now.getTime() + minutes * 60_000) }
      : { status: 'REJECTED', codeHash: null, decidedByUserId: ctx.user.userId, decidedVia: 'GUARDIAN_APP', decidedAt: now },
  })
  if (res.count === 0) throw new ApiException(409, 'UNLOCK_NOT_PENDING', 'This request was already decided.')

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    action: approve ? 'tapasya.unlock.approve' : 'tapasya.unlock.reject',
    module: 'tapasya',
    entityType: 'TapasyaUnlockRequest',
    entityId: r.id,
    summary: approve ? `Guardian approved ${minutes} min exception` : 'Guardian declined exception',
  })
  await notify(ctx, {
    userIds: [r.requestedByUserId],
    eventKey: approve ? 'tapasya.unlock.approved' : 'tapasya.unlock.rejected',
    title: approve ? 'Exception approved' : 'Exception declined',
    body: approve ? `Your guardian approved ${minutes} minutes.` : 'Your guardian declined the request. Keep going — you’ve got this.',
    linkUrl: '/tapasya',
  }).catch((err) => console.error('[tapasya] unlock decision notification failed', err))
  return dto(await ctx.db.tapasyaUnlockRequest.findFirstOrThrow({ where: { id: r.id } }))
}
