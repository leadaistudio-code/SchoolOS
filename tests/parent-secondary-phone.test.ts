import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

/**
 * A parent's secondary mobile signs in to the same account and can receive a
 * reset code, while a number that is somebody's primary always means them.
 * Nothing is sent: the WhatsApp provider is replaced by a recorder.
 */
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.12', 'user-agent': 'vitest' }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}))

vi.mock('@/server/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/rate-limit')>()
  return {
    ...actual,
    rateLimit: async () => ({ ok: true, remaining: 5, resetAt: Date.now() + 60_000, retryAfterSeconds: 0 }),
  }
})

const sent: { to: string }[] = []
vi.mock('@/server/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/providers')>()
  return {
    ...actual,
    whatsappProvider: () => ({
      name: 'meta_cloud_test',
      async send(message: { to: string }) {
        sent.push(message)
        return { ok: true, providerMessageId: `test_${sent.length}` }
      },
    }),
  }
})

const { login } = await import('../src/server/auth/login')
const { requestWhatsappOtp } = await import('../src/server/auth/otp')
const { hashPassword } = await import('../src/server/auth/password')

const prisma = new PrismaClient()

const PRIMARY = '+919000000451'
const SECONDARY = '+919000000452'
const OTHER_PRIMARY = '+919000000453'
const PASSWORD = 'Secondary-Phone-Test-1'
const TAG = 'secondary-phone-test'

let tenant: { id: string; slug: string; name: string }
let parentUserId: string
let otherUserId: string

beforeAll(async () => {
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo' } })
  if (!demo) throw new Error('Seed the database first: npm run db:seed')
  tenant = { id: demo.id, slug: demo.slug, name: demo.name }

  const passwordHash = await hashPassword(PASSWORD)
  const user = await prisma.user.create({
    data: { tenantId: demo.id, phone: PRIMARY, firstName: 'Second', lastName: TAG, status: 'ACTIVE', passwordHash },
  })
  parentUserId = user.id
  await prisma.parent.create({
    data: { tenantId: demo.id, userId: user.id, firstName: 'Second', lastName: TAG, phone: PRIMARY, secondaryPhone: SECONDARY },
  })

  // Legacy data: another account whose primary equals a parent's secondary.
  const other = await prisma.user.create({
    data: { tenantId: demo.id, phone: OTHER_PRIMARY, firstName: 'Other', lastName: TAG, status: 'ACTIVE', passwordHash },
  })
  otherUserId = other.id
  await prisma.parent.create({
    data: { tenantId: demo.id, firstName: 'Shadow', lastName: TAG, phone: '+919000000454', secondaryPhone: OTHER_PRIMARY },
  })
})

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { lastName: TAG }, select: { id: true } })
  const ids = users.map((u) => u.id)
  await prisma.session.deleteMany({ where: { userId: { in: ids } } })
  await prisma.verificationToken.deleteMany({ where: { userId: { in: ids } } })
  await prisma.loginEvent.deleteMany({ where: { userId: { in: ids } } })
  await prisma.parent.deleteMany({ where: { lastName: TAG } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
})

beforeEach(() => {
  sent.length = 0
})

describe('parent secondary phone', () => {
  it('signs in with the primary number as before', async () => {
    const out = await login({ identifier: '9000000451', password: PASSWORD, tenantId: tenant.id })
    expect(out.ok && out.userId).toBe(parentUserId)
  })

  it('signs in to the same account with the secondary number, typed any way', async () => {
    for (const typed of ['9000000452', '+91 90000 00452', '09000000452']) {
      const out = await login({ identifier: typed, password: PASSWORD, tenantId: tenant.id })
      expect(out.ok && out.userId).toBe(parentUserId)
    }
  })

  it('still refuses a wrong password on the secondary number', async () => {
    const out = await login({ identifier: SECONDARY, password: 'wrong-password', tenantId: tenant.id })
    expect(out.ok).toBe(false)
  })

  it('does not reach across schools', async () => {
    const out = await login({ identifier: SECONDARY, password: PASSWORD, tenantId: null })
    expect(out.ok).toBe(false)
  })

  it("prefers the account whose primary number it is", async () => {
    const out = await login({ identifier: OTHER_PRIMARY, password: PASSWORD, tenantId: tenant.id })
    expect(out.ok && out.userId).toBe(otherUserId)
  })

  it('sends a reset code to the secondary number that was typed', async () => {
    const out = await requestWhatsappOtp('9000000452', tenant)
    expect(out.ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toBe(SECONDARY)
    const challenge = await prisma.verificationToken.findFirst({
      where: { userId: parentUserId, purpose: 'OTP_RESET', usedAt: null },
    })
    expect(challenge).not.toBeNull()
  })
})
