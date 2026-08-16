import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

/**
 * Self-service password reset and invitation links.
 *
 * The properties under test are the ones that decide whether a reset link is
 * a convenience or a way in: a link must work once, only before it expires,
 * only on the school it was issued for, and redeeming it must not leave the
 * previous sessions alive.
 *
 * `next/headers` is stubbed because the services read the caller's IP through
 * it for rate limiting and audit, and there is no request scope in a test.
 */
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'vitest' }),
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
}))

const { issueToken, verifyToken, consumeToken } = await import('../src/server/auth/tokens')
const { completeWithToken } = await import('../src/server/auth/reset')
const { hashPassword, verifyPassword } = await import('../src/server/auth/password')

const prisma = new PrismaClient()

let tenantId: string
let otherTenantId: string
let userId: string

const ORIGINAL_PASSWORD = 'OriginalPass123'

beforeAll(async () => {
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo' } })
  const greenwood = await prisma.tenant.findUnique({ where: { slug: 'greenwood' } })
  if (!demo || !greenwood) throw new Error('Seed the database first: npm run db:seed')

  tenantId = demo.id
  otherTenantId = greenwood.id

  const user = await prisma.user.create({
    data: {
      tenantId,
      email: 'reset-test@example.test',
      firstName: 'Reset',
      lastName: 'Tester',
      status: 'ACTIVE',
      passwordHash: await hashPassword(ORIGINAL_PASSWORD),
    },
  })
  userId = user.id
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'reset-test@example.test' } })
  await prisma.$disconnect()
})

describe('one-time tokens', () => {
  it('verifies a freshly issued token', async () => {
    const { token } = await issueToken(userId, 'PASSWORD_RESET')
    const row = await verifyToken(token, 'PASSWORD_RESET', tenantId)

    expect(row?.userId).toBe(userId)
  })

  it('stores only a hash, never the token itself', async () => {
    const { token } = await issueToken(userId, 'PASSWORD_RESET')
    const stored = await prisma.verificationToken.findMany({
      where: { userId, usedAt: null },
      select: { tokenHash: true },
    })

    expect(stored.length).toBeGreaterThan(0)
    expect(stored.every((row) => row.tokenHash !== token)).toBe(true)
  })

  it('refuses a token presented on another school host', async () => {
    const { token } = await issueToken(userId, 'PASSWORD_RESET')

    expect(await verifyToken(token, 'PASSWORD_RESET', otherTenantId)).toBeNull()
  })

  it('refuses a token presented for a different purpose', async () => {
    const { token } = await issueToken(userId, 'PASSWORD_RESET')

    expect(await verifyToken(token, 'INVITE', tenantId)).toBeNull()
  })

  it('invalidates the previous token when a new one is issued', async () => {
    const first = await issueToken(userId, 'PASSWORD_RESET')
    const second = await issueToken(userId, 'PASSWORD_RESET')

    expect(await verifyToken(first.token, 'PASSWORD_RESET', tenantId)).toBeNull()
    expect(await verifyToken(second.token, 'PASSWORD_RESET', tenantId)).not.toBeNull()
  })

  it('will not verify an expired token', async () => {
    const { token } = await issueToken(userId, 'PASSWORD_RESET')
    await prisma.verificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    expect(await verifyToken(token, 'PASSWORD_RESET', tenantId)).toBeNull()
  })

  it('can only be consumed once', async () => {
    const { token } = await issueToken(userId, 'PASSWORD_RESET')
    const row = await verifyToken(token, 'PASSWORD_RESET', tenantId)

    expect(await consumeToken(prisma, row!.id)).toBe(true)
    expect(await consumeToken(prisma, row!.id)).toBe(false)
  })
})

describe('redeeming a reset link', () => {
  it('rejects a password that fails the policy without spending the token', async () => {
    const { token } = await issueToken(userId, 'PASSWORD_RESET')

    const result = await completeWithToken(token, 'PASSWORD_RESET', tenantId, 'short')
    expect(result).toMatchObject({ ok: false, field: 'password' })

    // The link still works, so a typo does not force another email.
    expect(await verifyToken(token, 'PASSWORD_RESET', tenantId)).not.toBeNull()
  })

  it('rejects reusing the password already on the account', async () => {
    const { token } = await issueToken(userId, 'PASSWORD_RESET')

    const result = await completeWithToken(token, 'PASSWORD_RESET', tenantId, ORIGINAL_PASSWORD)
    expect(result).toMatchObject({ ok: false, field: 'password' })
  })

  it('sets the password, clears the lockout and revokes every session', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 8, lockedUntil: new Date(Date.now() + 900_000) },
    })
    const session = await prisma.session.create({
      data: {
        userId,
        tenantId,
        tokenHash: `test-session-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    })

    const { token } = await issueToken(userId, 'PASSWORD_RESET')
    const result = await completeWithToken(token, 'PASSWORD_RESET', tenantId, 'BrandNewPass456')
    expect(result).toEqual({ ok: true })

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(await verifyPassword('BrandNewPass456', user.passwordHash!)).toBe(true)
    expect(user.failedLoginCount).toBe(0)
    expect(user.lockedUntil).toBeNull()
    expect(user.mustChangePassword).toBe(false)

    // A session that predates the reset may belong to whoever caused it.
    const after = await prisma.session.findUniqueOrThrow({ where: { id: session.id } })
    expect(after.revokedAt).not.toBeNull()

    // And the link is spent.
    expect(await verifyToken(token, 'PASSWORD_RESET', tenantId)).toBeNull()
  })

  it('refuses a link redeemed against another school', async () => {
    const { token } = await issueToken(userId, 'PASSWORD_RESET')

    const result = await completeWithToken(
      token,
      'PASSWORD_RESET',
      otherTenantId,
      'AnotherPass789',
    )
    expect(result).toMatchObject({ ok: false, field: 'token' })
  })
})

describe('redeeming an invitation', () => {
  it('activates an invited account', async () => {
    const invited = await prisma.user.create({
      data: {
        tenantId,
        email: 'invite-test@example.test',
        firstName: 'Invited',
        lastName: 'Tester',
        status: 'INVITED',
      },
    })

    try {
      const { token } = await issueToken(invited.id, 'INVITE')
      const result = await completeWithToken(token, 'INVITE', tenantId, 'FirstPassword123')
      expect(result).toEqual({ ok: true })

      const user = await prisma.user.findUniqueOrThrow({ where: { id: invited.id } })
      expect(user.status).toBe('ACTIVE')
      expect(user.emailVerifiedAt).not.toBeNull()
      expect(await verifyPassword('FirstPassword123', user.passwordHash!)).toBe(true)
    } finally {
      await prisma.user.delete({ where: { id: invited.id } })
    }
  })

  it('refuses an invitation for a disabled account', async () => {
    const disabled = await prisma.user.create({
      data: {
        tenantId,
        email: 'disabled-test@example.test',
        firstName: 'Disabled',
        lastName: 'Tester',
        status: 'DISABLED',
      },
    })

    try {
      const { token } = await issueToken(disabled.id, 'INVITE')
      expect(await verifyToken(token, 'INVITE', tenantId)).toBeNull()
    } finally {
      await prisma.user.delete({ where: { id: disabled.id } })
    }
  })
})
