import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const SLUG = vi.hoisted(() => {
  const slug = `zzacad-${Date.now().toString(36)}`
  process.env.ACADEMY_SLUG = slug
  delete process.env.RAZORPAY_KEY_ID
  delete process.env.RAZORPAY_KEY_SECRET
  return slug
})

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': `198.51.100.${Date.now() % 250}`, 'user-agent': 'vitest' }),
  cookies: async () => ({ set: () => {}, get: () => undefined, delete: () => {} }),
}))

import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import { FEATURE, invalidateEntitlementsCache } from '../src/server/entitlements'
import * as academy from '../src/server/modules/lms/academy'
import { myLiveClasses } from '../src/server/modules/lms/live'

/**
 * The public Academy without Razorpay keys: sign-up makes a learner, free
 * courses open at once, paid ones go through the simulated checkout, and only
 * a payment for the full price opens a course.
 */
const prisma = new PrismaClient()

let tenantId: string
let paidCourse: string
let freeCourse: string
let hiddenCourse: string
let learner: AppContext

function contextFor(userId: string, email: string): AppContext {
  const held = new Set(['lms.learn'])
  return {
    user: {
      sessionId: 's_test',
      userId,
      tenantId,
      isSuperAdmin: false,
      firstName: 'Public',
      lastName: 'Learner',
      email,
      phone: null,
      avatarUrl: null,
      displayName: null,
      mustChangePassword: false,
      roleKeys: ['STUDENT'],
      permissions: held,
      impersonatedById: null,
    },
    tenant: { id: tenantId, slug: SLUG, name: 'Academy', currency: 'INR' } as never,
    db: tenantDb(tenantId),
    can: (p: string) => held.has(p),
    canAny: (...ps: string[]) => ps.some((p) => held.has(p)),
    require: (p: string) => {
      if (!held.has(p)) throw new Error(`missing ${p}`)
    },
  }
}

async function course(title: string, priceMinor: number | null) {
  const c = await prisma.lmsCourse.create({
    data: {
      tenantId,
      title,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      academyPriceMinor: priceMinor,
      modules: { create: { tenantId, title: 'Start', position: 1 } },
    },
    include: { modules: true },
  })
  await prisma.lmsLesson.create({
    data: { tenantId, courseId: c.id, moduleId: c.modules[0]!.id, title: 'Hello', kind: 'TEXT', body: 'Hi', position: 1 },
  })
  return c.id
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: SLUG, name: 'Test Academy', status: 'ACTIVE' } })
  tenantId = tenant.id
  await prisma.tenantEntitlementOverride.create({ data: { tenantId, featureKey: FEATURE.MODULE_ROBOTICS_LMS, enabled: true } })
  await invalidateEntitlementsCache(tenantId)
  paidCourse = await course('Paid robotics', 49_900)
  freeCourse = await course('Free intro', 0)
  hiddenCourse = await course('Not on the Academy', null)
})

afterAll(async () => {
  if (tenantId) {
    await prisma.lmsAcademyOrder.deleteMany({ where: { tenantId } })
    await prisma.lmsBatch.deleteMany({ where: { tenantId } })
    await prisma.lmsCourse.deleteMany({ where: { tenantId } })
    await prisma.student.deleteMany({ where: { tenantId } })
    await prisma.user.deleteMany({ where: { tenantId } })
    await prisma.tenant.delete({ where: { id: tenantId } })
  }
  await prisma.$disconnect()
})

describe('Academy sign-up', () => {
  it('creates a student account and refuses a second one with the same email', async () => {
    const email = `${SLUG}@example.com`
    const first = await academy.signUpLearner(tenantId, { firstName: 'Asha', lastName: 'K', email, password: 'robots-123' })
    expect(first).toEqual({ ok: true })
    const user = await prisma.user.findFirstOrThrow({ where: { tenantId, email }, include: { roles: { include: { role: true } }, student: true } })
    expect(user.roles.map((r) => r.role.key)).toEqual(['STUDENT'])
    expect(user.student?.admissionNo).toMatch(/^AC\d{8}$/)
    learner = contextFor(user.id, email)

    const again = await academy.signUpLearner(tenantId, { firstName: 'Asha', email: email.toUpperCase(), password: 'robots-123' })
    expect(again).toMatchObject({ ok: false, field: 'email' })
    const weak = await academy.signUpLearner(tenantId, { firstName: 'B', email: `b-${email}`, password: 'short' })
    expect(weak).toMatchObject({ ok: false, field: 'password' })
  })
})

describe('Academy catalogue and checkout', () => {
  it('lists only priced, published courses', async () => {
    const list = await academy.academyCatalogue(tenantId)
    const ids = list.map((c) => c.id)
    expect(ids).toContain(paidCourse)
    expect(ids).toContain(freeCourse)
    expect(ids).not.toContain(hiddenCourse)
    expect(await academy.academyCourse(tenantId, hiddenCourse)).toBeNull()
    await expect(academy.startPurchase(learner, hiddenCourse)).rejects.toThrow()
  })

  it('opens a free course at once', async () => {
    const r = await academy.startPurchase(learner, freeCourse)
    expect(r).toEqual({ kind: 'enrolled', courseId: freeCourse })
    expect(await academy.startPurchase(learner, freeCourse)).toEqual({ kind: 'owned', courseId: freeCourse })
  })

  it('sells a paid course through the simulated checkout, once', async () => {
    expect(academy.paymentMode()).toBe('simulated')
    const start = await academy.startPurchase(learner, paidCourse)
    expect(start.kind).toBe('simulated')
    if (start.kind !== 'simulated') return
    expect(start.amountMinor).toBe(49_900)

    const student = await prisma.student.findFirstOrThrow({ where: { tenantId, userId: learner.user.userId } })
    expect(await prisma.lmsEnrollment.count({ where: { tenantId, courseId: paidCourse, studentId: student.id } })).toBe(0)

    const paid = await academy.confirmSimulatedPurchase(learner, start.orderId)
    expect(paid.status).toBe('paid')
    if (paid.status === 'paid') expect(paid.number).toMatch(/^ACD-\d{4}-\d{5}$/)
    expect(await prisma.lmsEnrollment.count({ where: { tenantId, courseId: paidCourse, studentId: student.id } })).toBe(1)

    const replay = await academy.confirmSimulatedPurchase(learner, start.orderId)
    expect(replay.status).toBe('already')
    expect(await academy.startPurchase(learner, paidCourse)).toEqual({ kind: 'owned', courseId: paidCourse })
    expect((await academy.myOrders(learner)).map((o) => o.courseId)).toEqual([paidCourse])
  })

  it('does not open a course for a payment of the wrong amount', async () => {
    const other = await course('Another paid course', 99_900)
    const start = await academy.startPurchase(learner, other)
    if (start.kind !== 'simulated') throw new Error('expected a simulated order')
    const r = await academy.settleOrder({ orderId: start.orderId, providerPaymentId: 'pay_x', amountMinor: 100, currency: 'INR', raw: {} })
    expect(r.status).toBe('failed')
    const order = await prisma.lmsAcademyOrder.findUniqueOrThrow({ where: { id: start.orderId } })
    expect(order.status).toBe('FAILED')
    expect(await prisma.lmsEnrollment.count({ where: { tenantId, courseId: other } })).toBe(0)
  })

  it('refuses another learner’s order', async () => {
    const start = await academy.startPurchase(learner, await course('Third course', 10_000))
    if (start.kind !== 'simulated') throw new Error('expected a simulated order')
    const stranger = contextFor('u_someone_else', 'x@example.com')
    await expect(academy.confirmSimulatedPurchase(stranger, start.orderId)).rejects.toThrow()
  })
})

describe('Academy live classes', () => {
  it('shows a course batch only to learners who own the course', async () => {
    const owned = await prisma.lmsBatch.create({ data: { tenantId, title: 'Owned batch', courseId: paidCourse, meetingUrl: 'https://meet.google.com/abc' } })
    const notOwned = await prisma.lmsBatch.create({ data: { tenantId, title: 'Other batch', courseId: hiddenCourse, meetingUrl: 'https://meet.google.com/abc' } })
    const open = await prisma.lmsBatch.create({ data: { tenantId, title: 'Open batch', meetingUrl: 'https://meet.google.com/abc' } })
    const startsAt = new Date(Date.now() + 2 * 86400_000)
    for (const b of [owned, notOwned, open]) {
      await prisma.lmsLiveClass.create({ data: { tenantId, batchId: b.id, title: b.title, startsAt } })
    }
    const { upcoming } = await myLiveClasses(learner)
    const titles = upcoming.map((c) => c.title)
    expect(titles).toContain('Owned batch')
    expect(titles).toContain('Open batch')
    expect(titles).not.toContain('Other batch')
  })
})
