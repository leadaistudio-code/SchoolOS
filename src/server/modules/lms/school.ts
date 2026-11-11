import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { assertLms, actorOf, auditLms } from './access'

/**
 * What a school sees of the course catalogue, which classes each course is
 * open to, and how far its students have got.
 *
 * Course rows are shared (catalogue + the school's own) and narrowed by the
 * tenant client. Relations from a course to tenant rows (assignments,
 * enrollments) are NOT narrowed when nested, so they are always read with
 * their own top-level query.
 */

export async function listCatalogue(ctx: AppContext) {
  ctx.require('lms.view')
  await assertLms(ctx)
  const courses = await ctx.db.lmsCourse.findMany({
    where: {
      deletedAt: null,
      OR: [{ tenantId: null, status: 'PUBLISHED' }, { tenantId: ctx.tenant.id }],
    },
    orderBy: [{ category: 'asc' }, { title: 'asc' }],
    include: { _count: { select: { lessons: { where: { archivedAt: null } }, modules: true } } },
  })
  const ids = courses.map((c) => c.id)
  const [assigned, started, finished] = await Promise.all([
    ctx.db.lmsCourseAssignment.groupBy({ by: ['courseId'], where: { courseId: { in: ids } }, _count: { _all: true } }),
    ctx.db.lmsEnrollment.groupBy({ by: ['courseId'], where: { courseId: { in: ids } }, _count: { _all: true } }),
    ctx.db.lmsEnrollment.groupBy({
      by: ['courseId'],
      where: { courseId: { in: ids }, completedAt: { not: null } },
      _count: { _all: true },
    }),
  ])
  const count = (rows: { courseId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.courseId, r._count._all]))
  const a = count(assigned)
  const s = count(started)
  const f = count(finished)
  return courses.map((c) => ({
    ...c,
    own: c.tenantId === ctx.tenant.id,
    assignments: a.get(c.id) ?? 0,
    started: s.get(c.id) ?? 0,
    finished: f.get(c.id) ?? 0,
  }))
}

/** A course the school may see: published catalogue, or any of its own. */
export async function visibleCourse(ctx: AppContext, id: string) {
  const course = await ctx.db.lmsCourse.findFirst({
    where: { id, deletedAt: null, OR: [{ tenantId: null, status: 'PUBLISHED' }, { tenantId: ctx.tenant.id }] },
    include: {
      modules: {
        orderBy: { position: 'asc' },
        include: {
          lessons: {
            where: { archivedAt: null },
            orderBy: { position: 'asc' },
            select: { id: true, title: true, kind: true, durationMinutes: true, slug: true },
          },
        },
      },
    },
  })
  if (!course) throw notFound('Course')
  return course
}

export async function courseAssignments(ctx: AppContext, courseId: string) {
  const rows = await ctx.db.lmsCourseAssignment.findMany({ where: { courseId }, orderBy: { createdAt: 'asc' } })
  const classIds = [...new Set(rows.map((r) => r.classLevelId).filter((x): x is string => !!x))]
  const sectionIds = [...new Set(rows.map((r) => r.sectionId).filter((x): x is string => !!x))]
  const [classes, sections] = await Promise.all([
    ctx.db.classLevel.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }),
    ctx.db.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } }),
  ])
  const className = new Map(classes.map((c) => [c.id, c.name]))
  const sectionName = new Map(sections.map((s) => [s.id, s.name]))
  return rows.map((r) => ({
    id: r.id,
    label: !r.classLevelId
      ? 'Whole school'
      : r.sectionId
        ? `${className.get(r.classLevelId) ?? 'Class'} – ${sectionName.get(r.sectionId) ?? 'Section'}`
        : `${className.get(r.classLevelId) ?? 'Class'} (all sections)`,
    assignedBy: r.assignedByLabel,
    createdAt: r.createdAt,
  }))
}

export const assignSchema = z.object({
  classLevelId: z.string().max(40).optional().or(z.literal('').transform(() => undefined)),
  sectionId: z.string().max(40).optional().or(z.literal('').transform(() => undefined)),
})

export async function assignCourse(ctx: AppContext, courseId: string, input: z.input<typeof assignSchema>) {
  ctx.require('lms.manage')
  await assertLms(ctx)
  const course = await visibleCourse(ctx, courseId)
  if (course.status !== 'PUBLISHED') throw badRequest('Publish the course before opening it to students')
  const data = assignSchema.parse(input)

  let classLevelId: string | null = data.classLevelId ?? null
  let sectionId: string | null = null
  if (data.sectionId) {
    const section = await ctx.db.section.findFirst({ where: { id: data.sectionId, deletedAt: null }, select: { id: true, classLevelId: true } })
    if (!section) throw notFound('Section')
    sectionId = section.id
    classLevelId = section.classLevelId
  } else if (classLevelId) {
    const cls = await ctx.db.classLevel.findFirst({ where: { id: classLevelId, deletedAt: null }, select: { id: true } })
    if (!cls) throw notFound('Class')
  }

  const existing = await ctx.db.lmsCourseAssignment.findMany({ where: { courseId }, select: { classLevelId: true, sectionId: true } })
  if (existing.some((e) => !e.classLevelId)) throw conflict('This course is already open to the whole school')
  if (existing.some((e) => e.classLevelId === classLevelId && (e.sectionId === sectionId || !e.sectionId))) {
    throw conflict('This course is already open to that class')
  }

  const actor = actorOf(ctx)
  const row = await ctx.db.lmsCourseAssignment.create({
    data: { tenantId: ctx.tenant.id, courseId, classLevelId, sectionId, assignedById: actor.id, assignedByLabel: actor.label },
  })
  if (!classLevelId) {
    // Whole school supersedes narrower assignments.
    await ctx.db.lmsCourseAssignment.deleteMany({ where: { courseId, id: { not: row.id } } })
  }
  await auditLms(ctx, 'lms.course.assign', 'LmsCourse', courseId, `Opened ${course.title} to students`)
  return row
}

export async function removeAssignment(ctx: AppContext, id: string) {
  ctx.require('lms.manage')
  const row = await ctx.db.lmsCourseAssignment.findFirst({ where: { id } })
  if (!row) throw notFound('Assignment')
  await ctx.db.lmsCourseAssignment.delete({ where: { id } })
  await auditLms(ctx, 'lms.course.unassign', 'LmsCourse', row.courseId, 'Closed a course to a class')
  return row
}

export type ProgressRow = {
  studentId: string
  name: string
  admissionNo: string
  className: string
  sectionName: string
  completed: number
  total: number
  percent: number
  started: boolean
  completedAt: Date | null
  lastActivityAt: Date | null
  quizAverage: number | null
}

/** Every student the course is open to, plus anyone who started it before it was closed. */
export async function courseProgress(ctx: AppContext, courseId: string) {
  ctx.require('lms.view')
  await assertLms(ctx)
  const course = await visibleCourse(ctx, courseId)
  const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id))
  const quizIds = new Set(course.modules.flatMap((m) => m.lessons.filter((l) => l.kind === 'QUIZ' || l.kind === 'INTERACTIVE').map((l) => l.id)))

  const assignments = await ctx.db.lmsCourseAssignment.findMany({ where: { courseId } })
  const wholeSchool = assignments.some((a) => !a.classLevelId)
  const placementFilters = assignments
    .filter((a) => a.classLevelId)
    .map((a) => (a.sectionId ? { sectionId: a.sectionId } : { classLevelId: a.classLevelId! }))

  const [enrolledInScope, enrollments] = await Promise.all([
    wholeSchool || placementFilters.length
      ? ctx.db.enrollment.findMany({
          where: {
            isCurrent: true,
            student: { deletedAt: null, status: 'ACTIVE' },
            ...(wholeSchool ? {} : { OR: placementFilters }),
          },
          select: {
            studentId: true,
            classLevel: { select: { name: true, numeric: true } },
            section: { select: { name: true } },
            student: { select: { firstName: true, lastName: true, admissionNo: true } },
          },
        })
      : Promise.resolve([]),
    ctx.db.lmsEnrollment.findMany({
      where: { courseId },
      select: {
        id: true,
        studentId: true,
        completedAt: true,
        lastActivityAt: true,
        progress: { where: { completedAt: { not: null } }, select: { lessonId: true, bestScorePercent: true } },
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNo: true,
            enrollments: {
              where: { isCurrent: true },
              take: 1,
              select: { classLevel: { select: { name: true, numeric: true } }, section: { select: { name: true } } },
            },
          },
        },
      },
    }),
  ])

  const lessons = new Set(lessonIds)
  const byStudent = new Map(enrollments.map((e) => [e.studentId, e]))
  const rows = new Map<string, ProgressRow & { order: number }>()
  const add = (
    studentId: string,
    s: { firstName: string; lastName: string; admissionNo: string },
    placement: { classLevel: { name: string; numeric: number }; section: { name: string } | null } | undefined,
  ) => {
    const e = byStudent.get(studentId)
    const done = (e?.progress ?? []).filter((p) => lessons.has(p.lessonId))
    const quizScores = done.filter((p) => quizIds.has(p.lessonId) && p.bestScorePercent != null).map((p) => p.bestScorePercent!)
    rows.set(studentId, {
      studentId,
      name: `${s.firstName} ${s.lastName}`.trim(),
      admissionNo: s.admissionNo,
      className: placement?.classLevel.name ?? '',
      sectionName: placement?.section?.name ?? '',
      order: placement?.classLevel.numeric ?? 999,
      completed: done.length,
      total: lessonIds.length,
      percent: lessonIds.length ? Math.round((done.length / lessonIds.length) * 100) : 0,
      started: !!e,
      completedAt: e?.completedAt ?? null,
      lastActivityAt: e?.lastActivityAt ?? null,
      quizAverage: quizScores.length ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length) : null,
    })
  }
  for (const r of enrolledInScope) add(r.studentId, r.student, r)
  for (const e of enrollments) if (!rows.has(e.studentId)) add(e.studentId, e.student, e.student.enrollments[0])

  const list = [...rows.values()].sort(
    (a, b) => a.order - b.order || a.className.localeCompare(b.className) || a.sectionName.localeCompare(b.sectionName) || a.name.localeCompare(b.name),
  )
  return {
    course,
    rows: list.map(({ order: _order, ...r }) => r),
    totals: {
      students: list.length,
      started: list.filter((r) => r.started).length,
      completed: list.filter((r) => r.completedAt).length,
      averagePercent: list.length ? Math.round(list.reduce((s, r) => s + r.percent, 0) / list.length) : 0,
    },
  }
}

const STALLED_DAYS = 7
const STRUGGLING_ATTEMPTS = 3

/**
 * Lesson-by-lesson view of a course for teachers: where students stall, which
 * knowledge checks they keep failing, projects waiting for review, and badges.
 */
export async function courseLessonBreakdown(ctx: AppContext, courseId: string) {
  ctx.require('lms.view')
  await assertLms(ctx)
  const course = await visibleCourse(ctx, courseId)
  const lessons = course.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleTitle: m.title })))
  const lessonIds = lessons.map((l) => l.id)

  const [progress, enrollments, submissions] = await Promise.all([
    ctx.db.lmsLessonProgress.findMany({
      where: { lessonId: { in: lessonIds }, enrollment: { courseId } },
      select: { lessonId: true, studentId: true, completedAt: true, bestScorePercent: true, attempts: true },
    }),
    ctx.db.lmsEnrollment.findMany({
      where: { courseId, completedAt: null },
      select: { studentId: true, lastActivityAt: true, student: { select: { firstName: true, lastName: true } } },
    }),
    ctx.db.lmsProjectSubmission.findMany({
      where: { lessonId: { in: lessonIds }, enrollment: { courseId } },
      select: { id: true, lessonId: true, studentId: true, status: true, pathway: true },
    }),
  ])

  const rows = lessons.map((l) => {
    const mine = progress.filter((p) => p.lessonId === l.id)
    const scored = mine.filter((p) => p.bestScorePercent != null)
    const tried = mine.filter((p) => p.attempts > 0)
    return {
      id: l.id,
      title: l.title,
      kind: l.kind,
      moduleTitle: l.moduleTitle,
      started: mine.length,
      completed: mine.filter((p) => p.completedAt).length,
      averageScore: scored.length ? Math.round(scored.reduce((s, p) => s + p.bestScorePercent!, 0) / scored.length) : null,
      averageAttempts: tried.length ? Math.round((tried.reduce((s, p) => s + p.attempts, 0) / tried.length) * 10) / 10 : null,
      submissions: submissions.filter((s) => s.lessonId === l.id).length,
      awaitingReview: submissions.filter((s) => s.lessonId === l.id && s.status === 'SUBMITTED').length,
    }
  })

  const names = new Map(enrollments.map((e) => [e.studentId, `${e.student.firstName} ${e.student.lastName}`.trim()]))
  const titles = new Map(lessons.map((l) => [l.id, l.title]))
  const stalledBefore = Date.now() - STALLED_DAYS * 86_400_000
  const attention: { studentId: string; name: string; reason: string }[] = []
  for (const e of enrollments) {
    if (e.lastActivityAt && e.lastActivityAt.getTime() < stalledBefore) {
      const days = Math.floor((Date.now() - e.lastActivityAt.getTime()) / 86_400_000)
      attention.push({ studentId: e.studentId, name: names.get(e.studentId)!, reason: `No activity for ${days} days` })
    }
  }
  for (const p of progress) {
    if (!p.completedAt && p.attempts >= STRUGGLING_ATTEMPTS && names.has(p.studentId)) {
      attention.push({
        studentId: p.studentId,
        name: names.get(p.studentId)!,
        reason: `${p.attempts} tries on “${titles.get(p.lessonId)}” without passing`,
      })
    }
  }

  return {
    rows,
    attention,
    completedSlugsByStudent: groupCompletedSlugs(progress, new Map(lessons.map((l) => [l.id, l.slug]))),
    awaitingReview: submissions.filter((s) => s.status === 'SUBMITTED').map((s) => ({ id: s.id, lessonId: s.lessonId })),
  }
}

function groupCompletedSlugs(
  progress: { lessonId: string; studentId: string; completedAt: Date | null }[],
  slugs: Map<string, string | null>,
) {
  const out = new Map<string, Set<string>>()
  for (const p of progress) {
    const slug = slugs.get(p.lessonId)
    if (!p.completedAt || !slug) continue
    out.set(p.studentId, (out.get(p.studentId) ?? new Set()).add(slug))
  }
  return out
}

export async function classOptions(ctx: AppContext) {
  return ctx.db.classLevel.findMany({
    where: { deletedAt: null, session: { isCurrent: true } },
    orderBy: [{ numeric: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, sections: { where: { deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } } },
  })
}
