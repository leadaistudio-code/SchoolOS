import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'
import { teachingClassSubjectIds } from '@/server/scope'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')

export const classTestCreateSchema = z.object({
  classSubjectId: z.string().min(1, 'Select a class and subject'),
  sectionId: z.string().optional(),
  title: z.string().trim().min(2, 'Give the test a name').max(160),
  syllabus: z.string().trim().max(2000).optional(),
  heldOn: isoDate,
  maxMarks: z.coerce.number().positive('Must be more than 0').max(1000).optional(),
})

export const classTestFilterSchema = z.object({
  classLevelId: z.string().optional(),
  sectionId: z.string().optional(),
})

export const classTestResultsSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        done: z.boolean(),
        marks: z.number().min(0).max(1000).nullable(),
      }),
    )
    .max(500),
})

/** School-wide staff manage every class test; a teacher only their own subjects'. */
function schoolWide(ctx: AppContext) {
  return ctx.can('exams.manage') || ctx.can('academics.manage')
}

async function myStaffId(ctx: AppContext) {
  const me = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { id: true },
  })
  return me?.id ?? null
}

async function assertCanManage(ctx: AppContext, test: { teacherId: string; classSubjectId: string }) {
  if (schoolWide(ctx)) return
  const mine = await teachingClassSubjectIds(ctx)
  const me = await myStaffId(ctx)
  if (mine === null || mine.includes(test.classSubjectId) || test.teacherId === me) return
  throw new ApiException(403, 'FORBIDDEN', 'You can only manage class tests for subjects you teach')
}

function rosterWhere(test: { classLevelId: string; sectionId: string | null }): Prisma.EnrollmentWhereInput {
  return {
    classLevelId: test.classLevelId,
    ...(test.sectionId ? { sectionId: test.sectionId } : {}),
    isCurrent: true,
    student: { deletedAt: null },
  }
}

export async function listClassTests(ctx: AppContext, filter: z.infer<typeof classTestFilterSchema>) {
  ctx.require('exams.class_tests')
  const mine = schoolWide(ctx) ? null : await teachingClassSubjectIds(ctx)

  const tests = await ctx.db.classTest.findMany({
    where: {
      deletedAt: null,
      ...(mine !== null ? { classSubjectId: { in: mine } } : {}),
      ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
      ...(filter.sectionId ? { OR: [{ sectionId: filter.sectionId }, { sectionId: null }] } : {}),
    },
    orderBy: [{ heldOn: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      title: true,
      heldOn: true,
      maxMarks: true,
      classLevelId: true,
      sectionId: true,
      classLevel: { select: { name: true } },
      section: { select: { name: true } },
      classSubject: { select: { subject: { select: { name: true } } } },
      teacher: { select: { firstName: true, lastName: true } },
      _count: { select: { results: { where: { completed: true } } } },
    },
  })

  // Class sizes, one grouped query per scope shape rather than one per test.
  const byClass = await ctx.db.enrollment.groupBy({
    by: ['classLevelId'],
    where: { classLevelId: { in: [...new Set(tests.map((t) => t.classLevelId))] }, isCurrent: true, student: { deletedAt: null } },
    _count: { _all: true },
  })
  const sectionIds = [...new Set(tests.flatMap((t) => (t.sectionId ? [t.sectionId] : [])))]
  const bySection = sectionIds.length
    ? await ctx.db.enrollment.groupBy({
        by: ['sectionId'],
        where: { sectionId: { in: sectionIds }, isCurrent: true, student: { deletedAt: null } },
        _count: { _all: true },
      })
    : []
  const classSize = new Map(byClass.map((g) => [g.classLevelId, g._count._all]))
  const sectionSize = new Map(bySection.map((g) => [g.sectionId, g._count._all]))

  return tests.map((t) => ({
    id: t.id,
    title: t.title,
    heldOn: t.heldOn,
    maxMarks: t.maxMarks,
    subject: t.classSubject.subject.name,
    className: t.classLevel.name,
    sectionName: t.section?.name ?? null,
    teacher: `${t.teacher.firstName} ${t.teacher.lastName}`.trim(),
    completed: t._count.results,
    expected: (t.sectionId ? sectionSize.get(t.sectionId) : classSize.get(t.classLevelId)) ?? 0,
  }))
}

export async function createClassTest(ctx: AppContext, input: z.infer<typeof classTestCreateSchema>) {
  ctx.require('exams.class_tests')

  const classSubject = await ctx.db.classSubject.findFirst({
    where: { id: input.classSubjectId },
    select: { id: true, classLevelId: true, teacherId: true },
  })
  if (!classSubject) throw notFound('Subject assignment')

  const me = await myStaffId(ctx)
  if (!schoolWide(ctx)) {
    const mine = await teachingClassSubjectIds(ctx)
    if (mine !== null && !mine.includes(classSubject.id)) {
      throw new ApiException(403, 'FORBIDDEN', 'You can only set class tests for subjects you teach')
    }
  }
  const teacherId = classSubject.teacherId ?? me
  if (!teacherId) throw conflict('This subject has no teacher assigned yet')

  if (input.sectionId) {
    const section = await ctx.db.section.findFirst({
      where: { id: input.sectionId, classLevelId: classSubject.classLevelId, deletedAt: null },
      select: { id: true },
    })
    if (!section) throw new ApiException(400, 'BAD_REQUEST', 'That section does not belong to the class')
  }

  const created = await ctx.db.classTest.create({
    data: {
      tenantId: ctx.tenant.id,
      classLevelId: classSubject.classLevelId,
      sectionId: input.sectionId || null,
      classSubjectId: classSubject.id,
      teacherId,
      title: input.title,
      syllabus: input.syllabus || null,
      heldOn: attendanceDate(input.heldOn),
      maxMarks: input.maxMarks ?? null,
    },
    include: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'class_test.create',
    module: 'exams',
    entityType: 'ClassTest',
    entityId: created.id,
    summary: `Set class test "${created.title}" for ${created.classLevel.name}${created.section ? ` ${created.section.name}` : ''} on ${input.heldOn}`,
  })

  return created
}

export async function getClassTest(ctx: AppContext, id: string) {
  ctx.require('exams.class_tests')

  const test = await ctx.db.classTest.findFirst({
    where: { id, deletedAt: null },
    include: {
      classLevel: { select: { name: true } },
      section: { select: { name: true } },
      classSubject: { select: { subject: { select: { name: true } } } },
      teacher: { select: { firstName: true, lastName: true } },
      results: { select: { studentId: true, completed: true, marks: true } },
    },
  })
  if (!test) throw notFound('Class test')
  await assertCanManage(ctx, test)

  const enrollments = await ctx.db.enrollment.findMany({
    where: rosterWhere(test),
    select: {
      rollNumber: true,
      section: { select: { name: true } },
      student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
    },
    orderBy: [{ section: { name: 'asc' } }, { rollNumber: 'asc' }],
  })
  const resultOf = new Map(test.results.map((r) => [r.studentId, r]))

  return {
    test,
    roster: enrollments.map((e) => ({
      studentId: e.student.id,
      name: `${e.student.firstName} ${e.student.lastName}`.trim(),
      admissionNo: e.student.admissionNo,
      rollNumber: e.rollNumber,
      sectionName: e.section.name,
      done: resultOf.get(e.student.id)?.completed ?? false,
      marks: resultOf.get(e.student.id)?.marks ?? null,
    })),
  }
}

/** Saves the teacher's ticks (and optional marks) for the whole class at once. */
export async function saveClassTestResults(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof classTestResultsSchema>,
) {
  ctx.require('exams.class_tests')

  const test = await ctx.db.classTest.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true, teacherId: true, classSubjectId: true, classLevelId: true, sectionId: true, maxMarks: true },
  })
  if (!test) throw notFound('Class test')
  await assertCanManage(ctx, test)

  const roster = await ctx.db.enrollment.findMany({ where: rosterWhere(test), select: { studentId: true } })
  const inClass = new Set(roster.map((r) => r.studentId))
  for (const e of input.entries) {
    if (!inClass.has(e.studentId)) throw conflict('A student in the list is not in this class')
    if (e.marks !== null) {
      if (test.maxMarks === null) throw new ApiException(400, 'BAD_REQUEST', 'This test has no maximum marks, so marks cannot be entered')
      if (e.marks > test.maxMarks) {
        throw new ApiException(400, 'BAD_REQUEST', `Marks cannot be more than the maximum of ${test.maxMarks}`)
      }
    }
  }

  const now = new Date()
  await ctx.db.$transaction(
    input.entries.map((e) => {
      const completed = e.done || e.marks !== null
      return ctx.db.classTestResult.upsert({
        where: { tenantId_classTestId_studentId: { tenantId: ctx.tenant.id, classTestId: id, studentId: e.studentId } },
        create: {
          tenantId: ctx.tenant.id,
          classTestId: id,
          studentId: e.studentId,
          completed,
          marks: e.marks,
          markedById: ctx.user.userId,
          markedAt: now,
        },
        update: { completed, marks: e.marks, markedById: ctx.user.userId, markedAt: now },
      })
    }),
  )

  const completed = input.entries.filter((e) => e.done || e.marks !== null).length
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'class_test.results',
    module: 'exams',
    entityType: 'ClassTest',
    entityId: id,
    summary: `Marked ${completed} of ${inClass.size} as completed on "${test.title}"`,
  })

  return { completed, total: inClass.size }
}

export async function deleteClassTest(ctx: AppContext, id: string) {
  ctx.require('exams.class_tests')
  const test = await ctx.db.classTest.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true, teacherId: true, classSubjectId: true },
  })
  if (!test) throw notFound('Class test')
  await assertCanManage(ctx, test)

  await ctx.db.classTest.update({ where: { id }, data: { deletedAt: new Date() } })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'class_test.delete',
    module: 'exams',
    entityType: 'ClassTest',
    entityId: id,
    summary: `Deleted class test "${test.title}"`,
  })
}

/** Class-subjects the caller may set a class test for. */
export async function classTestSubjects(ctx: AppContext) {
  ctx.require('exams.class_tests')
  const mine = schoolWide(ctx) ? null : await teachingClassSubjectIds(ctx)
  return ctx.db.classSubject.findMany({
    where: {
      ...(mine !== null ? { id: { in: mine } } : {}),
      classLevel: { deletedAt: null },
    },
    orderBy: [{ classLevel: { numeric: 'asc' } }, { subject: { name: 'asc' } }],
    select: {
      id: true,
      subject: { select: { name: true } },
      classLevel: {
        select: { name: true, sections: { where: { deletedAt: null }, select: { id: true, name: true } } },
      },
    },
  })
}
