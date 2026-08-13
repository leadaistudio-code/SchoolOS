import { z } from 'zod'
import QRCode from 'qrcode'
import type { AppContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { env } from '@/lib/env'
import { randomToken, sha256 } from '@/server/crypto'
import { verifyPassword } from '@/server/auth/password'
import {
  generateTotpSecret,
  totpOtpauthUrl,
  verifyTotp,
} from '@/server/auth/totp'
import { createSession, requestMeta } from '@/server/auth/session'

const MFA_CHALLENGE_TTL_MS = 10 * 60_000

export const mfaCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'),
})

export const mfaDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'),
})

export async function beginMfaEnrolment(ctx: AppContext) {
  ctx.require('settings.view')
  const user = await prisma.user.findFirst({
    where: { id: ctx.user.userId, tenantId: ctx.tenant.id },
    select: { id: true, email: true, mfaEnabled: true, firstName: true, lastName: true },
  })
  if (!user) throw notFound('User')
  if (user.mfaEnabled) throw conflict('Authenticator app is already enabled')

  const secret = generateTotpSecret()
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: secret, mfaEnabled: false },
  })

  const account = user.email ?? `${user.firstName}.${user.lastName}`.toLowerCase()
  const otpauthUrl = totpOtpauthUrl({
    secret,
    accountName: account,
    issuer: env().APP_NAME,
  })
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 })

  return { secret, otpauthUrl, qrDataUrl }
}

export async function confirmMfaEnrolment(ctx: AppContext, raw: z.infer<typeof mfaCodeSchema>) {
  ctx.require('settings.view')
  const input = mfaCodeSchema.parse(raw)
  const user = await prisma.user.findFirst({
    where: { id: ctx.user.userId, tenantId: ctx.tenant.id },
    select: { id: true, mfaSecret: true, mfaEnabled: true, firstName: true, lastName: true },
  })
  if (!user?.mfaSecret) throw conflict('Start enrolment before confirming a code')
  if (user.mfaEnabled) throw conflict('Authenticator app is already enabled')
  if (!verifyTotp(user.mfaSecret, input.code)) {
    throw conflict('That code is not valid. Check the time on your device and try again.')
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${user.firstName} ${user.lastName}`,
    action: 'mfa.enroll',
    module: 'auth',
    entityType: 'User',
    entityId: user.id,
    summary: 'Enabled authenticator app (MFA)',
  })
  return { enabled: true }
}

export async function disableMfa(ctx: AppContext, raw: z.infer<typeof mfaDisableSchema>) {
  ctx.require('settings.view')
  const input = mfaDisableSchema.parse(raw)
  const user = await prisma.user.findFirst({
    where: { id: ctx.user.userId, tenantId: ctx.tenant.id },
    select: {
      id: true,
      passwordHash: true,
      mfaSecret: true,
      mfaEnabled: true,
      firstName: true,
      lastName: true,
    },
  })
  if (!user?.mfaEnabled || !user.mfaSecret) throw conflict('Authenticator app is not enabled')
  if (!user.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
    throw conflict('Password is incorrect')
  }
  if (!verifyTotp(user.mfaSecret, input.code)) {
    throw conflict('That code is not valid')
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecret: null },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${user.firstName} ${user.lastName}`,
    action: 'mfa.disable',
    module: 'auth',
    entityType: 'User',
    entityId: user.id,
    summary: 'Disabled authenticator app (MFA)',
  })
  return { enabled: false }
}

export async function getMfaStatus(ctx: AppContext) {
  ctx.require('settings.view')
  const user = await prisma.user.findFirst({
    where: { id: ctx.user.userId, tenantId: ctx.tenant.id },
    select: { mfaEnabled: true },
  })
  return { enabled: !!user?.mfaEnabled }
}

/** After password login: create a short-lived OTP_LOGIN challenge instead of a session. */
export async function createMfaChallenge(userId: string): Promise<string> {
  const token = randomToken(32)
  await prisma.verificationToken.create({
    data: {
      userId,
      purpose: 'OTP_LOGIN',
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
    },
  })
  return token
}

export async function completeMfaChallenge(challengeToken: string, code: string) {
  const hash = sha256(challengeToken)
  const row = await prisma.verificationToken.findFirst({
    where: {
      tokenHash: hash,
      purpose: 'OTP_LOGIN',
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: {
        select: {
          id: true,
          tenantId: true,
          mfaEnabled: true,
          mfaSecret: true,
          firstName: true,
          lastName: true,
          mustChangePassword: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  })
  if (!row || row.user.deletedAt || row.user.status !== 'ACTIVE') {
    return { ok: false as const, message: 'This sign-in challenge has expired. Sign in again.' }
  }
  if (!row.user.mfaEnabled || !row.user.mfaSecret) {
    return { ok: false as const, message: 'Authenticator is not enabled for this account.' }
  }
  if (!verifyTotp(row.user.mfaSecret, code)) {
    await audit({
      tenantId: row.user.tenantId,
      actorId: row.user.id,
      actorLabel: `${row.user.firstName} ${row.user.lastName}`,
      action: 'mfa.challenge.fail',
      module: 'auth',
      entityType: 'User',
      entityId: row.user.id,
      summary: 'Failed MFA challenge at sign-in',
    })
    return { ok: false as const, message: 'That code is not valid. Try again.' }
  }

  await prisma.verificationToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  })

  const meta = await requestMeta()
  await createSession({
    userId: row.user.id,
    tenantId: row.user.tenantId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
  await audit({
    tenantId: row.user.tenantId,
    actorId: row.user.id,
    actorLabel: `${row.user.firstName} ${row.user.lastName}`,
    action: 'auth.login',
    module: 'auth',
    entityType: 'User',
    entityId: row.user.id,
    summary: 'Signed in (MFA)',
  })

  return {
    ok: true as const,
    userId: row.user.id,
    mustChangePassword: row.user.mustChangePassword,
  }
}
