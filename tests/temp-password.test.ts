import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'

/**
 * The two things that make self-service password reset actually reach people:
 * a real SMTP transport for the emailed link, and a counter-issued temporary
 * password for the people that link never reaches.
 *
 * `next/headers` is stubbed because sign-in reads the caller's IP through it.
 */
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9', 'user-agent': 'vitest' }),
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
}))

const { smtpOptionsFrom } = await import('../src/server/providers')
const { generateTemporaryPassword, checkPasswordPolicy, verifyPassword, hashPassword } =
  await import('../src/server/auth/password')
const { setTemporaryPassword } = await import('../src/server/modules/settings/users')
const { login } = await import('../src/server/auth/login')

const prisma = new PrismaClient()

let tenantId: string
let targetId: string
let ctx: AppContext

const TARGET_EMAIL = 'temp-pw-target@example.test'

function contextFor(id: string): AppContext {
  const held = new Set(['users.view', 'users.edit'])
  return {
    user: {
      sessionId: 's_test',
      userId: 'u_admin_test',
      tenantId: id,
      isSuperAdmin: false,
      firstName: 'Office',
      lastName: 'Admin',
      email: null,
      phone: null,
      avatarUrl: null,
      mustChangePassword: false,
      roleKeys: ['SCHOOL_ADMIN'],
      permissions: held,
      impersonatedById: null,
    },
    tenant: { id, name: 'Test School' } as never,
    db: tenantDb(id),
    can: (p: string) => held.has(p),
    canAny: (...ps: string[]) => ps.some((p) => held.has(p)),
    require: (p: string) => {
      if (!held.has(p)) throw new Error(`missing ${p}`)
    },
  }
}

beforeAll(async () => {
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo' } })
  if (!demo) throw new Error('Seed the database first: npm run db:seed')
  tenantId = demo.id
  ctx = contextFor(tenantId)

  const target = await prisma.user.create({
    data: {
      tenantId,
      email: TARGET_EMAIL,
      firstName: 'Temp',
      lastName: 'Target',
      status: 'ACTIVE',
      passwordHash: await hashPassword('OriginalPass123'),
    },
  })
  targetId = target.id
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TARGET_EMAIL } })
  await prisma.$disconnect()
})

describe('SMTP url parsing', () => {
  it('defaults to STARTTLS on 587', () => {
    const o = smtpOptionsFrom('smtp://user:pass@smtp.resend.com')
    expect(o).toMatchObject({ host: 'smtp.resend.com', port: 587, secure: false })
  })

  it('defaults to implicit TLS on 465 for smtps', () => {
    const o = smtpOptionsFrom('smtps://user:pass@smtp.zoho.in')
    expect(o).toMatchObject({ port: 465, secure: true })
  })

  it('honours an explicit port', () => {
    expect(smtpOptionsFrom('smtp://u:p@mail.example.com:2525').port).toBe(2525)
  })

  it('percent-decodes credentials', () => {
    // An SMTP password containing @ / + must survive the round trip, or the
    // server rejects the login and every reset email silently fails.
    const o = smtpOptionsFrom('smtp://api%40school.com:p%40ss%2Fw%2Bd@mail.example.com')
    expect(o.auth).toEqual({ user: 'api@school.com', pass: 'p@ss/w+d' })
  })

  it('allows a server with no authentication', () => {
    expect(smtpOptionsFrom('smtp://localhost:1025').auth).toBeUndefined()
  })

  it('rejects a malformed url so the caller can fall back', () => {
    expect(() => smtpOptionsFrom('not-a-url')).toThrow()
  })
})

describe('generated temporary passwords', () => {
  it('always satisfies the password policy', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(checkPasswordPolicy(generateTemporaryPassword())).toEqual([])
    }
  })

  it('avoids characters that are misheard over a phone', () => {
    for (let i = 0; i < 50; i += 1) {
      // No l/I/1, no O/0, no S/5 — the digits block is the only numeric part.
      const letters = generateTemporaryPassword().replace(/[-0-9]/g, '')
      expect(letters).not.toMatch(/[lIOSois]/)
    }
  })

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()))
    expect(seen.size).toBe(200)
  })
})

describe('issuing a temporary password', () => {
  it('sets the password, forces a change and dates it', async () => {
    const issued = await setTemporaryPassword(ctx, targetId)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: targetId } })
    expect(await verifyPassword(issued.password, user.passwordHash!)).toBe(true)
    expect(user.mustChangePassword).toBe(true)
    expect(user.tempPasswordExpiresAt).not.toBeNull()
    expect(user.tempPasswordExpiresAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('clears a lockout, since that is usually why the office was called', async () => {
    await prisma.user.update({
      where: { id: targetId },
      data: { failedLoginCount: 8, lockedUntil: new Date(Date.now() + 900_000) },
    })

    await setTemporaryPassword(ctx, targetId)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: targetId } })
    expect(user.failedLoginCount).toBe(0)
    expect(user.lockedUntil).toBeNull()
  })

  it('revokes every live session', async () => {
    const session = await prisma.session.create({
      data: {
        userId: targetId,
        tenantId,
        tokenHash: `temp-pw-session-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    })

    await setTemporaryPassword(ctx, targetId)

    const after = await prisma.session.findUniqueOrThrow({ where: { id: session.id } })
    expect(after.revokedAt).not.toBeNull()
  })

  it('refuses to issue one for the administrator doing the issuing', async () => {
    const selfCtx = contextFor(tenantId)
    selfCtx.user.userId = targetId

    await expect(setTemporaryPassword(selfCtx, targetId)).rejects.toThrow(/your own password/i)
  })

  it('refuses a disabled account', async () => {
    const disabled = await prisma.user.create({
      data: {
        tenantId,
        email: 'temp-pw-disabled@example.test',
        firstName: 'Off',
        lastName: 'Boarded',
        status: 'DISABLED',
      },
    })
    try {
      await expect(setTemporaryPassword(ctx, disabled.id)).rejects.toThrow(/disabled/i)
    } finally {
      await prisma.user.delete({ where: { id: disabled.id } })
    }
  })

  it('never writes the plaintext into the audit log', async () => {
    const issued = await setTemporaryPassword(ctx, targetId)

    const entry = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'user.temp_password', entityId: targetId },
      orderBy: { createdAt: 'desc' },
    })

    expect(entry).not.toBeNull()
    expect(JSON.stringify(entry)).not.toContain(issued.password)
  })
})

describe('signing in with a temporary password', () => {
  it('works before the deadline', async () => {
    const issued = await setTemporaryPassword(ctx, targetId)

    const result = await login({
      identifier: TARGET_EMAIL,
      password: issued.password,
      tenantId,
    })

    expect(result.ok).toBe(true)
    // And the app will send them straight to the change-password screen.
    if (result.ok) expect(result.mustChangePassword).toBe(true)
  })

  it('is refused once it has expired', async () => {
    const issued = await setTemporaryPassword(ctx, targetId)
    await prisma.user.update({
      where: { id: targetId },
      data: { tempPasswordExpiresAt: new Date(Date.now() - 1000) },
    })

    const result = await login({
      identifier: TARGET_EMAIL,
      password: issued.password,
      tenantId,
    })

    expect(result.ok).toBe(false)
    if (!result.ok && result.reason === 'error') {
      expect(result.message).toMatch(/expired/i)
    }
  })
})
