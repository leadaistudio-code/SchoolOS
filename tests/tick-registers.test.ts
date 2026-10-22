import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import {
  classTestCreateSchema,
  createClassTest,
  getClassTest,
  listClassTests,
  saveClassTestResults,
} from '../src/server/modules/class-tests/service'
import {
  createHomeworkForSections,
  getHomework,
  setHomeworkMarks,
} from '../src/server/modules/homework/service'
import { passFail } from '../src/lib/registers'

const prisma = new PrismaClient()

let tenantId: string
let otherTenantId: string
let classLevelId: string
let classSubjectId: string
let sectionId: string
let classSectionIds: string[]
let studentIds: string[]
let homeworkId: string
const createdTests: string[] = []
const createdHomework: string[] = []

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
  contextFor(tenantId, [
    'exams.class_tests',
    'exams.manage',
    'homework.view',
    'homework.create',
    'homework.review',
    'academics.manage',
  ])

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
  classLevelId = enrollment.classLevelId
  const cs = await prisma.classSubject.findFirstOrThrow({
    where: { tenantId, classLevelId, teacherId: { not: null } },
    select: { id: true, teacherId: true },
  })
  classSubjectId = cs.id
  const sections = await prisma.section.findMany({ where: { tenantId, classLevelId, deletedAt: null }, select: { id: true } })
  classSectionIds = sections.map((s) => s.id)
  const roster = await prisma.enrollment.findMany({
    where: { tenantId, sectionId, isCurrent: true, student: { deletedAt: null } },
    select: { studentId: true },
  })
  studentIds = roster.map((r) => r.studentId)

  const hw = await prisma.homework.create({
    data: {
      tenantId,
      classLevelId,
      sectionId,
      classSubjectId,
      teacherId: cs.teacherId!,
      title: 'Register test',
      assignedOn: new Date(),
      dueOn: new Date(),
    },
  })
  homeworkId = hw.id
})

afterAll(async () => {
  await prisma.homework.deleteMany({ where: { id: { in: [homeworkId, ...createdHomework].filter(Boolean) } } })
  await prisma.classTest.deleteMany({ where: { id: { in: createdTests } } })
  await prisma.$disconnect()
})

describe('homework completion register', () => {
  it('records each mark and counts completed, partial and late work as done', async () => {
    const marks = ['COMPLETED', 'PARTIAL', 'NO_NOTEBOOK', 'ABSENT'] as const
    const entries = studentIds.slice(0, marks.length).map((studentId, i) => ({ studentId, mark: marks[i]! }))
    const result = await setHomeworkMarks(admin(), homeworkId, { entries })
    expect(result.marked).toBe(entries.length)
    expect(result.done).toBe(entries.filter((e) => ['COMPLETED', 'PARTIAL'].includes(e.mark)).length)

    const rows = await prisma.homeworkSubmission.findMany({ where: { homeworkId }, select: { studentId: true, status: true, teacherMark: true } })
    const byStudent = new Map(rows.map((r) => [r.studentId, r]))
    expect(byStudent.get(studentIds[0]!)).toMatchObject({ status: 'REVIEWED', teacherMark: 'COMPLETED' })
    if (studentIds[2]) expect(byStudent.get(studentIds[2])).toMatchObject({ status: 'PENDING', teacherMark: 'NO_NOTEBOOK' })

    const { roster } = await getHomework(admin(), homeworkId)
    expect(roster.find((r) => r.studentId === studentIds[0])?.status).toBe('COMPLETED')
  })

  it('clearing a mark returns the student to pending', async () => {
    await setHomeworkMarks(admin(), homeworkId, { entries: [{ studentId: studentIds[0]!, mark: null }] })
    const row = await prisma.homeworkSubmission.findFirst({ where: { homeworkId, studentId: studentIds[0]! } })
    expect(row).toMatchObject({ status: 'PENDING', teacherMark: null })
  })

  it('rejects a student from another class', async () => {
    const outsider = await prisma.enrollment.findFirstOrThrow({
      where: { tenantId, isCurrent: true, sectionId: { not: sectionId } },
      select: { studentId: true },
    })
    await expect(
      setHomeworkMarks(admin(), homeworkId, { entries: [{ studentId: outsider.studentId, mark: 'COMPLETED' }] }),
    ).rejects.toThrow(/not in the class/)
  })

  it('cannot be reached from another school', async () => {
    const other = contextFor(otherTenantId, ['homework.review', 'academics.manage'])
    await expect(setHomeworkMarks(other, homeworkId, { entries: [] })).rejects.toThrow(/not found/i)
  })

  it('sets one homework per chosen section', async () => {
    const created = await createHomeworkForSections(admin(), {
      classSubjectId,
      sectionIds: classSectionIds,
      title: 'Multi-section homework',
      assignedOn: '2026-10-22',
      dueOn: '2026-10-23',
      isPublished: false,
    })
    createdHomework.push(...created.map((h) => h.id))
    expect(created.map((h) => h.sectionId).sort()).toEqual([...classSectionIds].sort())
  })

  it('refuses a section from another class', async () => {
    const foreign = await prisma.section.findFirstOrThrow({ where: { tenantId, classLevelId: { not: classLevelId } }, select: { id: true } })
    await expect(
      createHomeworkForSections(admin(), {
        classSubjectId,
        sectionIds: [sectionId, foreign.id],
        title: 'Wrong section',
        assignedOn: '2026-10-22',
        dueOn: '2026-10-23',
        isPublished: false,
      }),
    ).rejects.toThrow(/does not belong/)
  })
})

describe('class tests', () => {
  it('records completed, absent and not applicable with marks and pass or fail', async () => {
    const [test] = await createClassTest(admin(), {
      classSubjectId,
      sectionIds: [sectionId],
      title: 'Unit 1 quick test',
      heldOn: '2026-10-22',
      maxMarks: 20,
      passingMarks: 8,
    })
    createdTests.push(test!.id)

    const statuses = ['COMPLETED', 'ABSENT', 'NOT_APPLICABLE'] as const
    const entries = studentIds.map((studentId, i) => ({
      studentId,
      status: i < statuses.length ? statuses[i]! : null,
      marks: i === 0 ? 15 : null,
    }))
    const saved = await saveClassTestResults(admin(), test!.id, { entries })
    expect(saved.completed).toBe(1)

    const { roster } = await getClassTest(admin(), test!.id)
    expect(roster.find((r) => r.studentId === studentIds[0])).toMatchObject({ status: 'COMPLETED', marks: 15 })
    if (studentIds[1]) expect(roster.find((r) => r.studentId === studentIds[1])?.status).toBe('ABSENT')

    const listed = (await listClassTests(admin(), {})).find((t) => t.id === test!.id)
    expect(listed).toMatchObject({ completed: 1, passed: 1, passingMarks: 8 })
  })

  it('marks without a status count as completed', async () => {
    const [test] = await createClassTest(admin(), { classSubjectId, sectionIds: [sectionId], title: 'Implied', heldOn: '2026-10-22', maxMarks: 10 })
    createdTests.push(test!.id)
    await saveClassTestResults(admin(), test!.id, { entries: [{ studentId: studentIds[0]!, status: null, marks: 4 }] })
    const { roster } = await getClassTest(admin(), test!.id)
    expect(roster.find((r) => r.studentId === studentIds[0])?.status).toBe('COMPLETED')
  })

  it('refuses marks for an absent student and marks above the maximum', async () => {
    const [test] = await createClassTest(admin(), { classSubjectId, sectionIds: [sectionId], title: 'Over max', heldOn: '2026-10-22', maxMarks: 10 })
    createdTests.push(test!.id)
    await expect(
      saveClassTestResults(admin(), test!.id, { entries: [{ studentId: studentIds[0]!, status: 'COMPLETED', marks: 11 }] }),
    ).rejects.toThrow(/maximum/)
    await expect(
      saveClassTestResults(admin(), test!.id, { entries: [{ studentId: studentIds[0]!, status: 'ABSENT', marks: 5 }] }),
    ).rejects.toThrow(/completed the test/)
  })

  it('creates one test per chosen section', async () => {
    const created = await createClassTest(admin(), { classSubjectId, sectionIds: classSectionIds, title: 'Every section', heldOn: '2026-10-22' })
    createdTests.push(...created.map((t) => t.id))
    expect(created.map((t) => t.sectionId).sort()).toEqual([...classSectionIds].sort())
  })

  it('validates passing marks against the maximum', () => {
    const base = { classSubjectId: 'x', title: 'Test', heldOn: '2026-10-22' }
    expect(classTestCreateSchema.safeParse({ ...base, maxMarks: 10, passingMarks: 11 }).success).toBe(false)
    expect(classTestCreateSchema.safeParse({ ...base, passingMarks: 5 }).success).toBe(false)
    expect(classTestCreateSchema.safeParse({ ...base, maxMarks: 10, passingMarks: 4 }).success).toBe(true)
    expect(passFail(4, 4)).toBe('PASS')
    expect(passFail(3.5, 4)).toBe('FAIL')
    expect(passFail(null, 4)).toBeNull()
  })

  it('requires the class test permission', async () => {
    await expect(getClassTest(contextFor(tenantId, []), createdTests[0]!)).rejects.toThrow(/missing exams.class_tests/)
  })

  it('is invisible to another school', async () => {
    const other = contextFor(otherTenantId, ['exams.class_tests', 'exams.manage'])
    await expect(getClassTest(other, createdTests[0]!)).rejects.toThrow(/not found/i)
  })
})
