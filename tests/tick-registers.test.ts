import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import {
  createClassTest,
  getClassTest,
  saveClassTestResults,
} from '../src/server/modules/class-tests/service'
import { getHomework, setHomeworkCompletion } from '../src/server/modules/homework/service'

const prisma = new PrismaClient()

let tenantId: string
let otherTenantId: string
let classSubjectId: string
let sectionId: string
let studentIds: string[]
let homeworkId: string
const createdTests: string[] = []

function contextFor(id: string, held: string[]): AppContext {
  const perms = new Set(held)
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
      permissions: perms,
      impersonatedById: null,
    },
    tenant: { id, name: 'Test School' } as never,
    db: tenantDb(id),
    can: (p: string) => perms.has(p),
    canAny: (...ps: string[]) => ps.some((p) => perms.has(p)),
    require: (p: string) => {
      if (!perms.has(p)) throw new Error(`missing ${p}`)
    },
  }
}

const admin = () =>
  contextFor(tenantId, ['exams.class_tests', 'exams.manage', 'homework.view', 'homework.review', 'academics.manage'])

beforeAll(async () => {
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo' } })
  const greenwood = await prisma.tenant.findUnique({ where: { slug: 'greenwood' } })
  if (!demo || !greenwood) throw new Error('Seed the database first: npm run db:seed')
  tenantId = demo.id
  otherTenantId = greenwood.id

  const enrollment = await prisma.enrollment.findFirstOrThrow({
    where: { tenantId, isCurrent: true, classLevel: { subjects: { some: { teacherId: { not: null } } } } },
    select: { sectionId: true, classLevelId: true },
  })
  sectionId = enrollment.sectionId
  const cs = await prisma.classSubject.findFirstOrThrow({
    where: { tenantId, classLevelId: enrollment.classLevelId, teacherId: { not: null } },
    select: { id: true, teacherId: true },
  })
  classSubjectId = cs.id
  const roster = await prisma.enrollment.findMany({
    where: { tenantId, sectionId, isCurrent: true, student: { deletedAt: null } },
    select: { studentId: true },
  })
  studentIds = roster.map((r) => r.studentId)

  const hw = await prisma.homework.create({
    data: {
      tenantId,
      classLevelId: enrollment.classLevelId,
      sectionId,
      classSubjectId,
      teacherId: cs.teacherId!,
      title: 'Tick register test',
      assignedOn: new Date(),
      dueOn: new Date(),
    },
  })
  homeworkId = hw.id
})

afterAll(async () => {
  if (homeworkId) await prisma.homework.delete({ where: { id: homeworkId } })
  await prisma.classTest.deleteMany({ where: { id: { in: createdTests } } })
  await prisma.$disconnect()
})

describe('homework completion register', () => {
  it('ticks students without any portal submission', async () => {
    const ticked = studentIds.slice(0, 2)
    const result = await setHomeworkCompletion(admin(), homeworkId, { completedStudentIds: ticked })
    expect(result).toEqual({ completed: 2, total: studentIds.length })

    const { roster } = await getHomework(admin(), homeworkId)
    expect(roster.filter((r) => r.done).map((r) => r.studentId).sort()).toEqual([...ticked].sort())
  })

  it('unticking returns the student to pending', async () => {
    await setHomeworkCompletion(admin(), homeworkId, { completedStudentIds: studentIds.slice(0, 1) })
    const rows = await prisma.homeworkSubmission.findMany({ where: { homeworkId }, select: { studentId: true, status: true } })
    const status = new Map(rows.map((r) => [r.studentId, r.status]))
    expect(status.get(studentIds[0]!)).toBe('REVIEWED')
    expect(status.get(studentIds[1]!)).toBe('PENDING')
  })

  it('rejects a student from another class', async () => {
    const outsider = await prisma.enrollment.findFirstOrThrow({
      where: { tenantId, isCurrent: true, sectionId: { not: sectionId } },
      select: { studentId: true },
    })
    await expect(
      setHomeworkCompletion(admin(), homeworkId, { completedStudentIds: [outsider.studentId] }),
    ).rejects.toThrow(/not in the class/)
  })

  it('cannot be reached from another school', async () => {
    const other = contextFor(otherTenantId, ['homework.review', 'academics.manage'])
    await expect(setHomeworkCompletion(other, homeworkId, { completedStudentIds: [] })).rejects.toThrow(/not found/i)
  })
})

describe('class tests', () => {
  it('creates a test and records completion and marks', async () => {
    const test = await createClassTest(admin(), {
      classSubjectId,
      sectionId,
      title: 'Unit 1 quick test',
      heldOn: '2026-10-22',
      maxMarks: 20,
    })
    createdTests.push(test.id)

    const entries = studentIds.map((studentId, i) => ({
      studentId,
      done: i === 0,
      marks: i === 1 ? 15 : null,
    }))
    const saved = await saveClassTestResults(admin(), test.id, { entries })
    expect(saved.completed).toBe(Math.min(2, studentIds.length))

    const { roster } = await getClassTest(admin(), test.id)
    const first = roster.find((r) => r.studentId === studentIds[0])
    const second = roster.find((r) => r.studentId === studentIds[1])
    expect(first?.done).toBe(true)
    expect(second).toMatchObject({ done: true, marks: 15 })
  })

  it('refuses marks above the maximum', async () => {
    const test = await createClassTest(admin(), { classSubjectId, sectionId, title: 'Over max', heldOn: '2026-10-22', maxMarks: 10 })
    createdTests.push(test.id)
    await expect(
      saveClassTestResults(admin(), test.id, { entries: [{ studentId: studentIds[0]!, done: true, marks: 11 }] }),
    ).rejects.toThrow(/maximum/)
  })

  it('requires the class test permission', async () => {
    await expect(getClassTest(contextFor(tenantId, []), createdTests[0]!)).rejects.toThrow(/missing exams.class_tests/)
  })

  it('is invisible to another school', async () => {
    const other = contextFor(otherTenantId, ['exams.class_tests', 'exams.manage'])
    await expect(getClassTest(other, createdTests[0]!)).rejects.toThrow(/not found/i)
  })
})
