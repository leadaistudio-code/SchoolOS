import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.10', 'user-agent': 'vitest' }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}))

const { issueStudentPortalLogin } = await import('../src/server/modules/students/portal-login')
const { login } = await import('../src/server/auth/login')

const prisma = new PrismaClient()
const ADMISSION_NO = `STU-LOGIN-${Date.now()}`

let tenantId: string
let otherTenantId: string
let studentId: string

function contextFor(id: string, held = new Set(['students.view', 'students.edit'])): AppContext {
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
      displayName: null,
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
  const greenwood = await prisma.tenant.findUnique({ where: { slug: 'greenwood' } })
  if (!demo || !greenwood) throw new Error('Seed the database first: npm run db:seed')
  tenantId = demo.id
  otherTenantId = greenwood.id

  const student = await prisma.student.create({
    data: { tenantId, admissionNo: ADMISSION_NO, firstName: 'Login', lastName: 'Tester' },
  })
  studentId = student.id
})

afterAll(async () => {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { userId: true } })
  await prisma.student.delete({ where: { id: studentId } })
  if (student?.userId) {
    await prisma.session.deleteMany({ where: { userId: student.userId } })
    await prisma.loginEvent.deleteMany({ where: { userId: student.userId } })
    await prisma.userRole.deleteMany({ where: { userId: student.userId } })
    await prisma.user.delete({ where: { id: student.userId } })
  }
  await prisma.$disconnect()
})

describe('student portal login', () => {
  it('requires permission', async () => {
    await expect(issueStudentPortalLogin(contextFor(tenantId, new Set()), studentId)).rejects.toThrow(/missing/)
  })

  it('creates a student account and signs in with the admission number', async () => {
    const issued = await issueStudentPortalLogin(contextFor(tenantId), studentId)
    expect(issued.created).toBe(true)
    expect(issued.username).toBe(ADMISSION_NO)

    const student = await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { user: { include: { roles: { include: { role: true } } } } },
    })
    expect(student.user?.roles.map((r) => r.role.key)).toEqual(['STUDENT'])
    expect(student.user?.mustChangePassword).toBe(true)

    const result = await login({ identifier: ADMISSION_NO.toLowerCase(), password: issued.password, tenantId })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.userId).toBe(student.userId)
      expect(result.mustChangePassword).toBe(true)
    }
  })

  it('does not let the admission number sign in at another school', async () => {
    const issued = await issueStudentPortalLogin(contextFor(tenantId), studentId)
    const result = await login({ identifier: ADMISSION_NO, password: issued.password, tenantId: otherTenantId })
    expect(result.ok).toBe(false)
  })

  it('re-issuing replaces the password and signs out existing sessions', async () => {
    const first = await issueStudentPortalLogin(contextFor(tenantId), studentId)
    const signedIn = await login({ identifier: ADMISSION_NO, password: first.password, tenantId })
    expect(signedIn.ok).toBe(true)

    const second = await issueStudentPortalLogin(contextFor(tenantId), studentId)
    expect(second.created).toBe(false)

    const { userId } = await prisma.student.findUniqueOrThrow({ where: { id: studentId } })
    const live = await prisma.session.count({ where: { userId: userId!, revokedAt: null } })
    expect(live).toBe(0)
    expect((await login({ identifier: ADMISSION_NO, password: first.password, tenantId })).ok).toBe(false)
    expect((await login({ identifier: ADMISSION_NO, password: second.password, tenantId })).ok).toBe(true)
  })

  it('never writes the password into the audit log', async () => {
    const issued = await issueStudentPortalLogin(contextFor(tenantId), studentId)
    const entry = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'student.issue_login', entityId: studentId },
      orderBy: { createdAt: 'desc' },
    })
    expect(entry).not.toBeNull()
    expect(JSON.stringify(entry)).not.toContain(issued.password)
  })
})
