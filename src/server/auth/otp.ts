import crypto from 'node:crypto'
import { env } from '@/lib/env'
import { prisma } from '@/server/db/prisma'
import { audit } from '@/server/audit'
import { hmacSha256, randomToken, sha256, timingSafeEqual } from '@/server/crypto'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'
import { whatsappProvider } from '@/server/providers'
import { createPasswordResetTicket } from '@/server/modules/platform/support'
import { maskPhone, normalizePhone } from './phone'
import { requestMeta } from './session'
import { issueToken } from './tokens'
import type { TenantRef } from './reset'

/**
 * Password reset by one-time code over WhatsApp.
 *
 * The channel exists because a school's most reliable contact detail is a
 * phone number, not an email address - the number is on the admission form,
 * it is how the school already reaches parents, and it is far more likely to
 * be current than an address typed once at enrolment.
 *
 * Three properties make a six-digit code safe enough to reset a password with:
 * it expires in ten minutes, it dies after five wrong guesses, and proving it
 * does not sign anyone in - it only exchanges for the same short-lived reset
 * token the emailed link produces, so MFA still stands where it is enabled.
 */

const OTP_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5
/** The window between proving the phone and choosing the password. */
const EXCHANGE_TTL_MINUTES = 15

export type OtpChannel = 'WHATSAPP'

export type OtpRequestOutcome =
  | {
      ok: true
      /** Opaque handle for the verify step. Meaningless on its own. */
      challengeToken: string
      maskedPhone: string
      retryAfterSeconds?: number
    }
  | { ok: false; reason: 'invalid_phone'; message: string }
  | { ok: false; reason: 'ticketed'; message: string }

const TICKETED_MESSAGE =
  'We could not send a WhatsApp code just now. Our platform team has been notified and will contact you to reset your password.'

/**
 * Hashes a code with AUTH_SECRET rather than storing it plainly.
 *
 * Salted with the row id so two people holding the same six digits do not
 * share a hash. This is defence in depth only: six digits is a small space,
 * and what actually stops guessing is the attempt cap below.
 */
function codeDigest(challengeId: string, code: string): string {
  return hmacSha256(`${challengeId}:${code}`, env().AUTH_SECRET)
}

function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Step one: prove the number is on record and send a code to it.
 *
 * Returns a challenge for any syntactically valid number, whether or not it
 * belongs to anybody. An unknown number gets a handle that no row backs, so
 * the verify step fails exactly as a wrong code does. Answering honestly here
 * would turn the form into a way of asking "does this child go to this
 * school?", which for a school is a safeguarding question before it is a
 * security one.
 */
export async function requestWhatsappOtp(
  rawPhone: string,
  tenant: TenantRef,
): Promise<OtpRequestOutcome> {
  const phone = normalizePhone(rawPhone)
  if (!phone) {
    return {
      ok: false,
      reason: 'invalid_phone',
      message: 'Enter the mobile number registered with the school, including the country code.',
    }
  }

  const meta = await requestMeta()
  const masked = maskPhone(phone)

  const byPhone = await rateLimit(
    `otp:phone:${tenant.id}:${phone}`,
    RATE_LIMITS.passwordResetRequest.limit,
    RATE_LIMITS.passwordResetRequest.windowSeconds,
  )
  const byIp = await rateLimit(
    `otp:ip:${meta.ip ?? 'unknown'}`,
    RATE_LIMITS.passwordResetRequest.limit * 5,
    RATE_LIMITS.passwordResetRequest.windowSeconds,
  )
  if (!byPhone.ok || !byIp.ok) {
    // A refusal naming the number would confirm the number. Hand back a decoy
    // and let the verify step fail like any wrong code.
    return {
      ok: true,
      challengeToken: randomToken(32),
      maskedPhone: masked,
      retryAfterSeconds: Math.max(byPhone.retryAfterSeconds, byIp.retryAfterSeconds),
    }
  }

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, phone, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true },
  })

  if (!user) {
    return { ok: true, challengeToken: randomToken(32), maskedPhone: masked }
  }

  const provider = whatsappProvider()
  if (provider.name === 'log') {
    // No WhatsApp configured at all: the secondary path, so the person is
    // picked up by a human rather than left waiting for a code that is only
    // ever written to a log file.
    await raiseTicket(user.id, phone, tenant, meta.ip)
    return { ok: false, reason: 'ticketed', message: TICKETED_MESSAGE }
  }

  const challengeToken = randomToken(32)
  const code = generateCode()

  // One live challenge per person: a second request must retire the first,
  // or every code ever sent stays usable until it expires.
  const challenge = await prisma.$transaction(async (tx) => {
    await tx.verificationToken.updateMany({
      where: { userId: user.id, purpose: 'OTP_RESET', usedAt: null },
      data: { usedAt: new Date() },
    })
    return tx.verificationToken.create({
      data: {
        userId: user.id,
        purpose: 'OTP_RESET',
        tokenHash: sha256(challengeToken),
        channel: 'WHATSAPP',
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
      },
    })
  })

  await prisma.verificationToken.update({
    where: { id: challenge.id },
    data: { codeHash: codeDigest(challenge.id, code) },
  })

  const result = await provider.send({
    to: phone,
    templateName: env().WHATSAPP_OTP_TEMPLATE,
    body: `${code} is your ${tenant.name} password reset code. It expires in ${OTP_TTL_MINUTES} minutes.`,
    variables: { '1': code },
  })

  if (!result.ok) {
    // Delivery failed - a wrong number on WhatsApp, an expired access token, a
    // template Meta has not approved. Retire the challenge and fall back.
    console.error('[auth] whatsapp OTP send failed', result.error)
    await prisma.verificationToken.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() },
    })
    await raiseTicket(user.id, phone, tenant, meta.ip)
    return { ok: false, reason: 'ticketed', message: TICKETED_MESSAGE }
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorLabel: `${user.firstName} ${user.lastName}`,
    action: 'auth.otp.request',
    module: 'auth',
    entityType: 'User',
    entityId: user.id,
    summary: `Sent a WhatsApp reset code to ${masked}`,
  })

  return { ok: true, challengeToken, maskedPhone: masked }
}

async function raiseTicket(
  userId: string,
  phone: string,
  tenant: TenantRef,
  ip: string | null,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, lastName: true },
  })

  await createPasswordResetTicket({
    // The ticket is keyed by email; a phone-only account still needs a subject
    // the platform team can act on.
    email: user?.email ?? `${phone}@phone.invalid`,
    note: `WhatsApp delivery failed for ${maskPhone(phone)} (${user?.firstName ?? ''} ${user?.lastName ?? ''})`.trim(),
    tenantId: tenant.id,
    tenantName: tenant.name,
    ip,
  })

  await audit({
    tenantId: tenant.id,
    actorId: userId,
    actorLabel: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || null,
    action: 'auth.otp.ticketed',
    module: 'auth',
    entityType: 'User',
    entityId: userId,
    summary: `WhatsApp reset code could not be delivered to ${maskPhone(phone)}; raised a support ticket`,
  })
}

export type OtpVerifyOutcome =
  | { ok: true; resetToken: string }
  | { ok: false; message: string; attemptsLeft?: number }

/** One message for every failure, so nothing distinguishes the reasons. */
const BAD_CODE = 'That code is not correct, or it has expired. Request a new one.'

/**
 * Step two: check the code and exchange it for a reset token.
 *
 * On success this does not sign anyone in. It mints the same PASSWORD_RESET
 * token the emailed link carries, so the password is set through one shared
 * path and MFA still applies at the sign-in that follows.
 */
export async function verifyWhatsappOtp(
  challengeToken: string,
  code: string,
  tenantId: string,
): Promise<OtpVerifyOutcome> {
  const meta = await requestMeta()
  const limited = await rateLimit(
    `otp:verify:${meta.ip ?? 'unknown'}`,
    RATE_LIMITS.login.limit * 2,
    RATE_LIMITS.login.windowSeconds,
  )
  if (!limited.ok) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' }
  }

  const digits = code.trim()
  if (!/^\d{6}$/.test(digits)) return { ok: false, message: BAD_CODE }

  const row = await prisma.verificationToken.findFirst({
    where: {
      tokenHash: sha256(challengeToken),
      purpose: 'OTP_RESET',
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: { select: { id: true, tenantId: true, status: true, deletedAt: true, firstName: true, lastName: true } },
    },
  })

  // Covers the decoy handed to an unknown number, an expired challenge, and a
  // challenge raised against another school - all indistinguishable.
  if (!row || !row.codeHash) return { ok: false, message: BAD_CODE }
  if (row.user.deletedAt || row.user.status !== 'ACTIVE') return { ok: false, message: BAD_CODE }
  if (row.user.tenantId !== tenantId) return { ok: false, message: BAD_CODE }

  if (row.attempts >= MAX_ATTEMPTS) {
    await prisma.verificationToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    })
    return { ok: false, message: 'Too many incorrect codes. Request a new one.' }
  }

  if (!timingSafeEqual(row.codeHash, codeDigest(row.id, digits))) {
    const updated = await prisma.verificationToken.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })
    return {
      ok: false,
      message: BAD_CODE,
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - updated.attempts),
    }
  }

  // Correct. Spend the challenge and mint the reset token in one commit, so a
  // replay cannot produce a second token from the same code.
  const { token } = await prisma.$transaction(async (tx) => {
    await tx.verificationToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    })
    return issueToken(row.user.id, 'PASSWORD_RESET', EXCHANGE_TTL_MINUTES, tx)
  })

  await audit({
    tenantId,
    actorId: row.user.id,
    actorLabel: `${row.user.firstName} ${row.user.lastName}`,
    action: 'auth.otp.verified',
    module: 'auth',
    entityType: 'User',
    entityId: row.user.id,
    summary: 'Verified a WhatsApp reset code',
  })

  return { ok: true, resetToken: token }
}
