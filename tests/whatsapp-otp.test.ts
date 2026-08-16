import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

/**
 * Password reset by WhatsApp one-time code.
 *
 * A six-digit code is a small secret, so the tests that matter are the ones
 * that bound how it can be attacked: it must die after five wrong guesses, it
 * must not be reusable, an unknown number must be indistinguishable from a
 * known one, and a code issued for one school must be worthless at another.
 */
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.11', 'user-agent': 'vitest' }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}))

/**
 * Rate limiting is real and correct - three requests per number per hour - so
 * a test file that exercises the flow a dozen times would spend most of it
 * throttled. It is held open here and closed deliberately in one test.
 */
const state = vi.hoisted(() => ({ allowRateLimit: true }))
vi.mock('@/server/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/rate-limit')>()
  return {
    ...actual,
    rateLimit: async () => ({
      ok: state.allowRateLimit,
      remaining: state.allowRateLimit ? 5 : 0,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: state.allowRateLimit ? 0 : 60,
    }),
  }
})

/** Captures what would have been sent, so the code can be read back. */
const sent: { to: string; variables?: Record<string, string> }[] = []
vi.mock('@/server/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/providers')>()
  return {
    ...actual,
    whatsappProvider: () => ({
      name: 'meta_cloud_test',
      async send(message: { to: string; variables?: Record<string, string> }) {
        sent.push(message)
        return { ok: true, providerMessageId: `test_${sent.length}` }
      },
    }),
  }
})

const { requestWhatsappOtp, verifyWhatsappOtp } = await import('../src/server/auth/otp')
const { normalizePhone, maskPhone } = await import('../src/server/auth/phone')
const { verifyToken } = await import('../src/server/auth/tokens')

const prisma = new PrismaClient()

const PHONE = '+919000000123'
const EMAIL = 'otp-target@example.test'

let tenant: { id: string; slug: string; name: string }
let otherTenantId: string
let userId: string

function lastCode(): string {
  return sent[sent.length - 1]!.variables!['1']!
}

beforeAll(async () => {
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo' } })
  const greenwood = await prisma.tenant.findUnique({ where: { slug: 'greenwood' } })
  if (!demo || !greenwood) throw new Error('Seed the database first: npm run db:seed')

  tenant = { id: demo.id, slug: demo.slug, name: demo.name }
  otherTenantId = greenwood.id

  const user = await prisma.user.create({
    data: {
      tenantId: demo.id,
      email: EMAIL,
      phone: PHONE,
      firstName: 'Otp',
      lastName: 'Target',
      status: 'ACTIVE',
    },
  })
  userId = user.id
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } })
  await prisma.$disconnect()
})

beforeEach(() => {
  sent.length = 0
  state.allowRateLimit = true
})

describe('phone normalisation', () => {
  it('accepts the shapes a parent actually types', () => {
    for (const raw of ['9000000123', '09000000123', '+91 90000 00123', '+91-9000000123', '919000000123']) {
      expect(normalizePhone(raw, '+91')).toBe(PHONE)
    }
  })

  it('leaves an existing country code alone', () => {
    // Guessing here would silently look up a different person.
    expect(normalizePhone('+14155550123', '+91')).toBe('+14155550123')
  })

  it('rejects what cannot be a number', () => {
    expect(normalizePhone('', '+91')).toBeNull()
    expect(normalizePhone('abc', '+91')).toBeNull()
    expect(normalizePhone('123', '+91')).toBeNull()
  })

  it('masks all but the last four digits', () => {
    expect(maskPhone(PHONE)).toContain('0123')
    expect(maskPhone(PHONE)).not.toContain('900000')
  })
})

describe('requesting a code', () => {
  it('sends one to a number on record', async () => {
    const result = await requestWhatsappOtp('9000000123', tenant)

    expect(result.ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toBe(PHONE)
    expect(lastCode()).toMatch(/^\d{6}$/)
  })

  it('answers an unknown number identically, and sends nothing', async () => {
    const known = await requestWhatsappOtp('9000000123', tenant)
    sent.length = 0
    const unknown = await requestWhatsappOtp('9999999999', tenant)

    expect(unknown.ok).toBe(true)
    expect(sent).toHaveLength(0)
    // Both hand back a challenge of the same shape; only one is real.
    if (known.ok && unknown.ok) {
      expect(unknown.challengeToken).toHaveLength(known.challengeToken.length)
    }
  })

  it('retires the previous code when a new one is requested', async () => {
    const first = await requestWhatsappOtp('9000000123', tenant)
    const firstCode = lastCode()
    const second = await requestWhatsappOtp('9000000123', tenant)

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok) return

    // The old code must not still open the door.
    const stale = await verifyWhatsappOtp(first.challengeToken, firstCode, tenant.id)
    expect(stale.ok).toBe(false)
  })

  it('rejects a number that is not a number', async () => {
    const result = await requestWhatsappOtp('nonsense', tenant)
    expect(result).toMatchObject({ ok: false, reason: 'invalid_phone' })
  })

  it('hands back a decoy rather than a refusal when throttled', async () => {
    state.allowRateLimit = false
    const result = await requestWhatsappOtp('9000000123', tenant)

    // Saying "too many requests for that number" would confirm the number.
    expect(result.ok).toBe(true)
    expect(sent).toHaveLength(0)
    if (result.ok) {
      const attempt = await verifyWhatsappOtp(result.challengeToken, '123456', tenant.id)
      expect(attempt.ok).toBe(false)
    }
  })
})

describe('verifying a code', () => {
  it('exchanges a correct code for a usable reset token', async () => {
    const request = await requestWhatsappOtp('9000000123', tenant)
    if (!request.ok) throw new Error('expected a challenge')

    const result = await verifyWhatsappOtp(request.challengeToken, lastCode(), tenant.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The token is the same kind the emailed link carries.
    const row = await verifyToken(result.resetToken, 'PASSWORD_RESET', tenant.id)
    expect(row?.userId).toBe(userId)
  })

  it('refuses a wrong code and counts the attempt', async () => {
    const request = await requestWhatsappOtp('9000000123', tenant)
    if (!request.ok) throw new Error('expected a challenge')

    const result = await verifyWhatsappOtp(request.challengeToken, '000000', tenant.id)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.attemptsLeft).toBe(4)
  })

  it('dies after five wrong guesses, even if the sixth is right', async () => {
    const request = await requestWhatsappOtp('9000000123', tenant)
    if (!request.ok) throw new Error('expected a challenge')
    const real = lastCode()

    for (let i = 0; i < 5; i += 1) {
      const wrong = String((Number(real) + i + 1) % 1_000_000).padStart(6, '0')
      await verifyWhatsappOtp(request.challengeToken, wrong, tenant.id)
    }

    const result = await verifyWhatsappOtp(request.challengeToken, real, tenant.id)
    expect(result.ok).toBe(false)
  })

  it('cannot be spent twice', async () => {
    const request = await requestWhatsappOtp('9000000123', tenant)
    if (!request.ok) throw new Error('expected a challenge')
    const code = lastCode()

    expect((await verifyWhatsappOtp(request.challengeToken, code, tenant.id)).ok).toBe(true)
    expect((await verifyWhatsappOtp(request.challengeToken, code, tenant.id)).ok).toBe(false)
  })

  it('is worthless on another school host', async () => {
    const request = await requestWhatsappOtp('9000000123', tenant)
    if (!request.ok) throw new Error('expected a challenge')

    const result = await verifyWhatsappOtp(request.challengeToken, lastCode(), otherTenantId)
    expect(result.ok).toBe(false)
  })

  it('refuses an expired challenge', async () => {
    const request = await requestWhatsappOtp('9000000123', tenant)
    if (!request.ok) throw new Error('expected a challenge')
    const code = lastCode()

    await prisma.verificationToken.updateMany({
      where: { userId, purpose: 'OTP_RESET', usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const result = await verifyWhatsappOtp(request.challengeToken, code, tenant.id)
    expect(result.ok).toBe(false)
  })

  it('refuses the decoy handed to an unknown number', async () => {
    const decoy = await requestWhatsappOtp('9999999999', tenant)
    if (!decoy.ok) throw new Error('expected a decoy challenge')

    const result = await verifyWhatsappOtp(decoy.challengeToken, '123456', tenant.id)
    expect(result.ok).toBe(false)
  })

  it('never stores the code in the clear', async () => {
    const request = await requestWhatsappOtp('9000000123', tenant)
    if (!request.ok) throw new Error('expected a challenge')
    const code = lastCode()

    const row = await prisma.verificationToken.findFirstOrThrow({
      where: { userId, purpose: 'OTP_RESET', usedAt: null },
    })
    expect(row.codeHash).not.toBeNull()
    expect(row.codeHash).not.toContain(code)
  })
})
