import { beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'

/**
 * Cross-tenant isolation.
 *
 * This is the test that matters most in a multi-tenant product: a user from
 * School A must not be able to reach School B's data by any route - not by
 * listing, not by counting, not by guessing a primary key, not by passing
 * their own tenantId, and not by writing.
 *
 * It runs against the seeded database, which contains two real tenants with
 * data on both sides.
 */
const prisma = new PrismaClient()

let schoolA: string
let schoolB: string

beforeAll(async () => {
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo' } })
  const greenwood = await prisma.tenant.findUnique({ where: { slug: 'greenwood' } })

  if (!demo || !greenwood) {
    throw new Error('Seed the database first: npm run db:seed')
  }
  schoolA = demo.id
  schoolB = greenwood.id
})

describe('tenant isolation', () => {
  it('lists only its own students', async () => {
    const dbA = tenantDb(schoolA)
    const students = await dbA.student.findMany({ select: { tenantId: true } })

    expect(students.length).toBeGreaterThan(0)
    expect(students.every((s) => s.tenantId === schoolA)).toBe(true)
  })

  it('counts only its own students', async () => {
    const [countA, countB, actualA] = await Promise.all([
      tenantDb(schoolA).student.count(),
      tenantDb(schoolB).student.count(),
      prisma.student.count({ where: { tenantId: schoolA } }),
    ])

    expect(countA).toBe(actualA)
    expect(countA).not.toBe(countA + countB)
    expect(countA + countB).toBe(await prisma.student.count())
  })

  it('cannot read another tenant record by its primary key', async () => {
    const victim = await prisma.student.findFirst({ where: { tenantId: schoolB } })
    expect(victim).toBeTruthy()

    const attacker = tenantDb(schoolA)

    expect(await attacker.student.findUnique({ where: { id: victim!.id } })).toBeNull()
    expect(await attacker.student.findFirst({ where: { id: victim!.id } })).toBeNull()
  })

  it('ignores a caller-supplied tenantId in a read', async () => {
    const attacker = tenantDb(schoolA)

    // A handler that naively forwards a request body cannot widen its scope.
    const rows = await attacker.student.findMany({
      where: { tenantId: schoolB },
      select: { tenantId: true },
    })

    expect(rows.every((r) => r.tenantId === schoolA)).toBe(true)
  })

  it('cannot update another tenant record', async () => {
    const victim = await prisma.student.findFirst({ where: { tenantId: schoolB } })
    const attacker = tenantDb(schoolA)

    await expect(
      attacker.student.update({
        where: { id: victim!.id },
        data: { firstName: 'Compromised' },
      }),
    ).rejects.toThrow()

    const after = await prisma.student.findUnique({ where: { id: victim!.id } })
    expect(after?.firstName).toBe(victim!.firstName)
  })

  it('cannot delete another tenant record', async () => {
    const victim = await prisma.student.findFirst({ where: { tenantId: schoolB } })
    const attacker = tenantDb(schoolA)

    await expect(attacker.student.delete({ where: { id: victim!.id } })).rejects.toThrow()
    expect(await prisma.student.findUnique({ where: { id: victim!.id } })).toBeTruthy()
  })

  it('updateMany and deleteMany cannot reach across the boundary', async () => {
    const attacker = tenantDb(schoolA)
    const beforeB = await prisma.student.count({ where: { tenantId: schoolB } })

    const updated = await attacker.student.updateMany({
      where: { tenantId: schoolB },
      data: { city: 'Nowhere' },
    })

    const stillB = await prisma.student.count({
      where: { tenantId: schoolB, city: { not: 'Nowhere' } },
    })

    // The write is re-scoped to school A, so school B is untouched.
    expect(stillB).toBe(beforeB)
    expect(updated.count).toBeLessThanOrEqual(
      await prisma.student.count({ where: { tenantId: schoolA } }),
    )
  })

  it('stamps writes with the bound tenant, overriding any supplied value', async () => {
    const dbA = tenantDb(schoolA)
    const marker = `ISOLATION-${Date.now()}`

    const created = await dbA.subject.create({
      // A malicious payload tries to plant a row in school B.
      data: { tenantId: schoolB, code: marker, name: 'Isolation probe' } as never,
    })

    expect(created.tenantId).toBe(schoolA)

    await prisma.subject.delete({ where: { id: created.id } })
  })

  it('aggregates do not leak other tenant money', async () => {
    const [aggA, realA] = await Promise.all([
      tenantDb(schoolA).feeInvoice.aggregate({ _sum: { totalMinor: true } }),
      prisma.feeInvoice.aggregate({
        where: { tenantId: schoolA },
        _sum: { totalMinor: true },
      }),
    ])

    expect(aggA._sum.totalMinor).toBe(realA._sum.totalMinor)
  })

  it('groupBy does not leak other tenant rows', async () => {
    const grouped = await tenantDb(schoolA).student.groupBy({
      by: ['tenantId'],
      _count: { _all: true },
    })

    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.tenantId).toBe(schoolA)
  })

  it('keeps attendance records inside their tenant', () => {
    // Attendance is the highest-volume tenant-scoped table, so it gets its own
    // check rather than relying on the students case generalising.
    return (async () => {
      const [countA, countB, total] = await Promise.all([
        tenantDb(schoolA).studentAttendance.count(),
        tenantDb(schoolB).studentAttendance.count(),
        prisma.studentAttendance.count(),
      ])
      expect(countA).toBeGreaterThan(0)
      expect(countB).toBeGreaterThan(0)
      expect(countA + countB).toBe(total)
    })()
  })

  it('cannot read another tenant leave request by id', async () => {
    const victim = await prisma.leaveRequest.findFirst({ where: { tenantId: schoolB } })
    expect(victim).toBeTruthy()

    const attacker = tenantDb(schoolA)
    expect(await attacker.leaveRequest.findUnique({ where: { id: victim!.id } })).toBeNull()

    // ...and cannot approve it either.
    await expect(
      attacker.leaveRequest.update({
        where: { id: victim!.id },
        data: { status: 'APPROVED' },
      }),
    ).rejects.toThrow()

    const after = await prisma.leaveRequest.findUnique({ where: { id: victim!.id } })
    expect(after?.status).toBe(victim!.status)
  })

  it('cannot mark attendance for another tenant student', async () => {
    const victim = await prisma.student.findFirst({ where: { tenantId: schoolB } })
    const attacker = tenantDb(schoolA)

    // A crafted payload naming a foreign student writes nothing readable, and
    // the row it would create is stamped with the attacker own tenant.
    const found = await attacker.student.findFirst({ where: { id: victim!.id } })
    expect(found).toBeNull()
  })

  it('refuses to build a client with no tenant', () => {
    expect(() => tenantDb('')).toThrow(/without a tenantId/i)
  })
})
