import { prisma } from '@/server/db/prisma'
import { verifyPassword } from './password'
import { phoneLookupCandidates } from './phone'
import { createSession, requestMeta } from './session'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'
import { audit } from '@/server/audit'

export type LoginInput = {
  identifier: string // email or phone
  password: string
  tenantId: string | null // null => platform login
}

export type LoginOutcome =
  | {
      ok: true
      userId: string
      mustChangePassword: boolean
      /**
       * The raw session token, for a caller that cannot use the cookie.
       * Only the mobile sign-in route reads it, and only when the client
       * asked for bearer transport — see the login route.
       */
      sessionToken: string
    }
  | { ok: false; reason: 'error'; message: string; retryAfterSeconds?: number }
  | { ok: false; reason: 'mfa'; challengeToken: string }

const GENERIC_FAILURE = 'Phone number or password is incorrect'
const MAX_FAILED = 8
const LOCK_MINUTES = 15

/**
 * Password login.
 *
 * Deliberate choices:
 *  - the same message for unknown user and wrong password, so the form cannot
 *    be used to enumerate who has an account at a school;
 *  - rate limiting per identifier AND per IP;
 *  - a per-account lockout that survives a rate-limit reset;
 *  - the tenant comes from the request host, never from the form, so a user
 *    cannot aim their credentials at another school.
 */
export async function login(input: LoginInput): Promise<LoginOutcome> {
  const meta = await requestMeta()
  const identifier = input.identifier.trim().toLowerCase()

  const byIdentifier = await rateLimit(
    `login:id:${input.tenantId ?? 'platform'}:${identifier}`,
    RATE_LIMITS.login.limit,
    RATE_LIMITS.login.windowSeconds,
  )
  const byIp = await rateLimit(
    `login:ip:${meta.ip ?? 'unknown'}`,
    RATE_LIMITS.login.limit * 3,
    RATE_LIMITS.login.windowSeconds,
  )
  if (!byIdentifier.ok || !byIp.ok) {
    await recordAttempt(null, input.tenantId, identifier, false, 'rate_limited', meta)
    return {
      ok: false,
      reason: 'error',
      message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
      retryAfterSeconds: Math.max(byIdentifier.retryAfterSeconds, byIp.retryAfterSeconds),
    }
  }

  const isEmail = identifier.includes('@')
  const user = isEmail
    ? await prisma.user.findFirst({
        where: {
          tenantId: input.tenantId,
          deletedAt: null,
          email: identifier,
        },
      })
    : await findUserByPhone(input.tenantId, input.identifier.trim())

  if (!user || !user.passwordHash) {
    await recordAttempt(null, input.tenantId, identifier, false, 'no_such_user', meta)
    return { ok: false, reason: 'error', message: GENERIC_FAILURE }
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAttempt(user.id, input.tenantId, identifier, false, 'locked', meta)
    return {
      ok: false,
      reason: 'error',
      message: `This account is temporarily locked. Try again after ${LOCK_MINUTES} minutes or reset your password.`,
    }
  }

  if (user.status !== 'ACTIVE') {
    await recordAttempt(user.id, input.tenantId, identifier, false, 'inactive', meta)
    return {
      ok: false,
      reason: 'error',
      message: 'This account is not active. Please contact your school administrator.',
    }
  }

  const valid = await verifyPassword(input.password, user.passwordHash)
  if (!valid) {
    const failed = user.failedLoginCount + 1
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil:
          failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    })
    await recordAttempt(user.id, input.tenantId, identifier, false, 'bad_password', meta)
    return { ok: false, reason: 'error', message: GENERIC_FAILURE }
  }

  if (user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()) {
    await recordAttempt(user.id, input.tenantId, identifier, false, 'temp_password_expired', meta)
    return {
      ok: false,
      reason: 'error',
      message:
        'This temporary password has expired. Ask the school office for a new one, or reset your password by email.',
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  })

  if (user.mfaEnabled && user.mfaSecret) {
    const { createMfaChallenge } = await import('@/server/modules/mfa/service')
    const challengeToken = await createMfaChallenge(user.id)
    await recordAttempt(user.id, input.tenantId, identifier, true, 'mfa_required', meta)
    return { ok: false, reason: 'mfa', challengeToken }
  }

  const session = await createSession({
    userId: user.id,
    tenantId: user.tenantId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  await recordAttempt(user.id, input.tenantId, identifier, true, null, meta)
  await audit({
    tenantId: user.tenantId,
    actorId: user.id,
    actorLabel: `${user.firstName} ${user.lastName}`,
    action: 'auth.login',
    module: 'auth',
    entityType: 'User',
    entityId: user.id,
    summary: 'Signed in',
  })

  return {
    ok: true,
    userId: user.id,
    mustChangePassword: user.mustChangePassword,
    sessionToken: session.token,
  }
}

async function findUserByPhone(tenantId: string | null, rawPhone: string) {
  const candidates = phoneLookupCandidates(rawPhone)
  if (candidates.length === 0) return null

  return prisma.user.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      phone: { in: candidates },
    },
  })
}

async function recordAttempt(
  userId: string | null,
  tenantId: string | null,
  email: string,
  success: boolean,
  reason: string | null,
  meta: { ip: string | null; userAgent: string | null },
) {
  await prisma.loginEvent
    .create({
      data: { userId, tenantId, email, success, reason, ip: meta.ip, userAgent: meta.userAgent },
    })
    .catch((err) => console.error('[auth] failed to record login event', err))
}
