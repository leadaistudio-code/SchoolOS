import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import { FEATURE, invalidateEntitlementsCache } from '../src/server/entitlements'
import * as content from '../src/server/modules/lms/content'
import { assignCourse } from '../src/server/modules/lms/school'
import { completeLesson } from '../src/server/modules/lms/learning'
import * as certs from '../src/server/modules/lms/certificates'
import * as kits from '../src/server/modules/lms/kits'
import { learnerSummary, schoolInsights } from '../src/server/modules/lms/insights'
import { istClock } from '../src/lib/ist-clock'

/**
 * Phase 3: finishing a course issues one verifiable certificate; kits cannot
 * be over-issued and lost kits leave stock; dashboards count what happened.
 */
const prisma = new PrismaClient()
const TAG = `ZZP3-${Date.now().toString(36)}`
const actor = { id: 'u_platform', label: 'Platform Tester' }

let tenantId: string
let staff: AppContext
let viewer: AppContext
let learner: AppContext
let student: { id: string; classLevelId: string }
let createdOverride = false
let courseId: string
const kitIds: string[] = []

function contextFor(id: string, userId: string, held: Set<string>): AppContext {
  return {
    user: {
      sessionId: 's_test',
      userId,
      tenantId: id,
      isSuperAdmin: false,
      firstName: 'Phase',
      lastName: 'Three',
      email: null,
      phone: null,
      avatarUrl: null,
      displayName: null,
      mustChangePassword: false,
      roleKeys: ['SCHOOL_ADMIN'],
      permissions: held,
      impersonatedById: null,
    },
    tenant: { id, name: 'Test School', currency: 'INR' } as never,
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
  const key = { tenantId_featureKey: { tenantId, featureKey: FEATURE.MODULE_ROBOTICS_LMS } }
  if (!(await prisma.tenantEntitlementOverride.findUnique({ where: key }))) {
    await prisma.tenantEntitlementOverride.create({ data: { tenantId, featureKey: FEATURE.MODULE_ROBOTICS_LMS, enabled: true, note: TAG } })
    createdOverride = true
  }
  await invalidateEntitlementsCache(tenantId)

  const enrolment = await prisma.enrollment.findFirstOrThrow({
    where: { tenantId, isCurrent: true, student: { deletedAt: null, status: 'ACTIVE', userId: { not: null } } },
    select: { studentId: true, classLevelId: true, student: { select: { userId: true } } },
  })
  student = { id: enrolment.studentId, classLevelId: enrolment.classLevelId }
  staff = contextFor(tenantId, 'u_staff', new Set(['lms.view', 'lms.manage', 'lms.teach']))
  viewer = contextFor(tenantId, 'u_viewer', new Set(['lms.view']))
  learner = contextFor(tenantId, enrolment.student.userId!, new Set(['lms.learn']))
})

afterAll(async () => {
  await prisma.lmsKit.deleteMany({ where: { id: { in: kitIds } } })
  if (courseId) await prisma.lmsCourse.deleteMany({ where: { id: courseId } })
  if (createdOverride) {
    await prisma.tenantEntitlementOverride.deleteMany({ where: { tenantId, featureKey: FEATURE.MODULE_ROBOTICS_LMS, note: TAG } })
    await invalidateEntitlementsCache(tenantId)
  }
  await prisma.$disconnect()
})

describe('certificates', () => {
  let certificateId: string
  let token: string

  it('issues one numbered certificate when the course is finished', async () => {
    const course = await content.createCourse({ tenantId }, actor, { title: `${TAG} Intro to AI`, category: 'AI', level: 'BEGINNER' })
    courseId = course.id
    const moduleId = (await content.getCourseForEditing({ tenantId }, courseId)).modules[0]!.id
    const a = await content.createLesson({ tenantId }, moduleId, { title: 'What is AI', kind: 'TEXT', body: 'Patterns', durationMinutes: 20 })
    const b = await content.createLesson({ tenantId }, moduleId, { title: 'Training data', kind: 'TEXT', body: 'Examples', durationMinutes: 40 })
    await content.setCourseStatus({ tenantId }, courseId, 'PUBLISHED')
    await assignCourse(staff, courseId, { classLevelId: student.classLevelId })

    await completeLesson(learner, courseId, a.id)
    expect(await prisma.lmsCertificate.count({ where: { courseId, studentId: student.id } })).toBe(0)
    await completeLesson(learner, courseId, b.id)
    await completeLesson(learner, courseId, b.id)

    const issued = await prisma.lmsCertificate.findMany({ where: { courseId, studentId: student.id } })
    expect(issued).toHaveLength(1)
    const c = issued[0]!
    expect(c.number).toMatch(/^LMS-\d{4}-\d{5}$/)
    expect(c).toMatchObject({ courseTitle: `${TAG} Intro to AI`, lessons: 2, minutes: 60, scorePercent: null })
    certificateId = c.id
    token = c.verifyToken

    expect((await certs.myCertificates(learner)).some((x) => x.id === c.id)).toBe(true)
    expect((await certs.listCertificates(staff, { q: TAG })).map((x) => x.id)).toEqual([c.id])
  })

  it('verifies publicly and shows a revocation', async () => {
    expect(await certs.verifyLmsCertificate('not-a-real-token-123')).toBeNull()
    expect((await certs.verifyLmsCertificate(token))?.certificate.revokedAt).toBeNull()

    await expect(certs.revokeCertificate(viewer, certificateId, 'Mistake')).rejects.toThrow(/lms.manage/)
    await expect(certs.revokeCertificate(staff, certificateId, '')).rejects.toThrow(/why/)
    await certs.revokeCertificate(staff, certificateId, 'Issued to the wrong student')
    const after = await certs.verifyLmsCertificate(token)
    expect(after?.certificate.revokedAt).not.toBeNull()
    expect(after?.certificate.revokedReason).toBe('Issued to the wrong student')

    await certs.restoreCertificate(staff, certificateId)
    expect((await certs.verifyLmsCertificate(token))?.certificate.revokedAt).toBeNull()
  })

  it('keeps certificates inside their school', async () => {
    const other = contextFor('zz-other-school', 'u_other', new Set(['lms.view']))
    await expect(certs.myCertificate(learner, 'missing')).rejects.toThrow(/not found/i)
    const row = await other.db.lmsCertificate.findFirst({ where: { id: certificateId } })
    expect(row).toBeNull()
  })
})

describe('kits', () => {
  let kitId: string

  it('will not issue more kits than the school holds', async () => {
    await expect(kits.createKit(staff, { name: `${TAG} Drone kit`, quantity: 0 })).rejects.toThrow(/at least one/)
    const kit = await kits.createKit(staff, { name: `${TAG} Drone kit`, quantity: 3, courseId })
    kitId = kit.id
    kitIds.push(kit.id)

    await expect(kits.issueKit(staff, kitId, { studentId: student.id, quantity: 4 })).rejects.toThrow(/Only 3 left/)
    await expect(kits.issueKit(staff, kitId, { studentId: student.id, dueOn: '2020-01-01' })).rejects.toThrow(/already passed/)
    await kits.issueKit(staff, kitId, { studentId: student.id, quantity: 2 })
    await kits.issueKit(staff, kitId, { studentId: student.id, quantity: 1 })
    await expect(kits.issueKit(staff, kitId, { studentId: student.id })).rejects.toThrow(/None left/)

    const listed = (await kits.listKits(staff)).find((k) => k.id === kitId)
    expect(listed).toMatchObject({ quantity: 3, issued: 3, available: 0 })
    await expect(kits.updateKit(staff, kitId, { name: `${TAG} Drone kit`, quantity: 2 })).rejects.toThrow(/cannot be lower/)
    await expect(kits.archiveKit(staff, kitId)).rejects.toThrow(/Collect every kit/)
    expect((await kits.myKits(learner)).filter((l) => l.kitId === kitId)).toHaveLength(2)
  })

  it('flags overdue kits and takes lost ones out of stock', async () => {
    const loans = await prisma.lmsKitLoan.findMany({ where: { kitId }, orderBy: { quantity: 'desc' } })
    await prisma.lmsKitLoan.update({ where: { id: loans[0]!.id }, data: { dueOn: new Date('2020-01-01T00:00:00Z') } })
    expect(kits.isOverdue(new Date('2020-01-01T00:00:00Z'))).toBe(true)
    expect(kits.isOverdue(new Date(`${istClock().iso}T00:00:00Z`))).toBe(false)
    expect((await kits.openLoans(staff, true)).filter((l) => l.kitId === kitId)).toHaveLength(1)
    expect((await kits.listKits(staff)).find((k) => k.id === kitId)?.overdue).toBe(2)

    await expect(kits.returnKit(staff, loans[0]!.id, { condition: 'LOST' })).rejects.toThrow(/Note what/)
    await kits.returnKit(staff, loans[0]!.id, { condition: 'LOST', note: 'Left on the bus' })
    await kits.returnKit(staff, loans[1]!.id, { condition: 'GOOD' })
    await expect(kits.returnKit(staff, loans[1]!.id, { condition: 'GOOD' })).rejects.toThrow(/not found/i)

    const { kit, open, returned } = await kits.getKit(staff, kitId)
    expect(kit).toMatchObject({ quantity: 1, issued: 0, available: 1 })
    expect(open).toHaveLength(0)
    expect(returned.map((r) => r.returnCondition).sort()).toEqual(['GOOD', 'LOST'])
    await kits.archiveKit(staff, kitId)
  })

  it('lets only staff who teach issue kits', async () => {
    await expect(kits.issueKit(viewer, kitId, { studentId: student.id })).rejects.toThrow(/lms.teach/)
    await expect(kits.createKit(viewer, { name: 'x kit', quantity: 1 })).rejects.toThrow(/lms.manage/)
  })
})

describe('dashboards', () => {
  it('counts the finished course and certificate for the school', async () => {
    const data = await schoolInsights(staff)
    expect(data.courses.find((c) => c.id === courseId)).toMatchObject({ started: 1, finished: 1, averagePercent: 100 })
    expect(data.totals.certificates).toBeGreaterThanOrEqual(1)
    expect(data.totals.learners).toBeGreaterThanOrEqual(1)
    expect(data.weeks).toHaveLength(8)
    expect(data.weeks.at(-1)!.lessons).toBeGreaterThanOrEqual(2)
    expect(data.classes.some((c) => c.id === student.classLevelId)).toBe(true)
  })

  it('gives the student their own numbers', async () => {
    const mine = await learnerSummary(learner)
    expect(mine.lessonsDone).toBeGreaterThanOrEqual(2)
    expect(mine.certificates).toBeGreaterThanOrEqual(1)
  })
})
