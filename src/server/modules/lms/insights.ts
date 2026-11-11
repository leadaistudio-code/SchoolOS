import type { AppContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { FEATURE, hasFeature } from '@/server/entitlements'
import { istClock, istDayStart, shiftIso, weekStartIso } from '@/lib/ist-clock'
import { liveState } from '@/lib/lms/live'
import { assertLms } from './access'
import { requireLearner } from './learning'
import { learnerBatchWhere } from './live'

/**
 * Dashboards. Everything is computed from the enrolment and progress rows on
 * request; a school's LMS data is small enough that this stays quick.
 */

const DAY = 86400_000
export const QUIET_AFTER_DAYS = 14

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

export async function schoolInsights(ctx: AppContext) {
  ctx.require('lms.view')
  await assertLms(ctx)
  const now = new Date()
  const today = istClock(now).iso

  const [enrollments, assignments, doneByEnrollment] = await Promise.all([
    ctx.db.lmsEnrollment.findMany({
      select: { id: true, courseId: true, studentId: true, lastActivityAt: true, completedAt: true },
    }),
    ctx.db.lmsCourseAssignment.findMany({ select: { courseId: true } }),
    ctx.db.lmsLessonProgress.groupBy({ by: ['enrollmentId'], where: { completedAt: { not: null }, lesson: { archivedAt: null } }, _count: { _all: true } }),
  ])
  const courseIds = [...new Set([...enrollments.map((e) => e.courseId), ...assignments.map((a) => a.courseId)])]
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))]

  const weeksFrom = shiftIso(weekStartIso(today), -7 * 7)
  const [courses, lessonCounts, placements, classSizes, recent, quiz, certificates, pendingReviews, kitsOut, kitsLate, liveClasses] =
    await Promise.all([
      ctx.db.lmsCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true, tenantId: true, deletedAt: true } }),
      ctx.db.lmsLesson.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds }, archivedAt: null }, _count: { _all: true } }),
      ctx.db.enrollment.findMany({
        where: { isCurrent: true, studentId: { in: studentIds } },
        select: {
          studentId: true,
          classLevelId: true,
          classLevel: { select: { name: true, numeric: true } },
          section: { select: { name: true } },
          student: { select: { firstName: true, lastName: true, admissionNo: true } },
        },
      }),
      ctx.db.enrollment.groupBy({
        by: ['classLevelId'],
        where: { isCurrent: true, student: { deletedAt: null, status: 'ACTIVE' } },
        _count: { _all: true },
      }),
      ctx.db.lmsLessonProgress.findMany({
        where: { completedAt: { gte: istDayStart(weeksFrom) } },
        select: { completedAt: true, studentId: true },
      }),
      ctx.db.lmsQuizAttempt.aggregate({ where: { submittedAt: { gte: new Date(now.getTime() - 90 * DAY) } }, _avg: { scorePercent: true }, _count: { _all: true } }),
      ctx.db.lmsCertificate.count({ where: { revokedAt: null } }),
      ctx.db.lmsProjectSubmission.count({ where: { status: 'SUBMITTED' } }),
      ctx.db.lmsKitLoan.aggregate({ where: { returnedAt: null }, _sum: { quantity: true } }),
      ctx.db.lmsKitLoan.count({ where: { returnedAt: null, dueOn: { lt: new Date(`${today}T00:00:00.000Z`) } } }),
      ctx.db.lmsLiveClass.findMany({
        where: { cancelledAt: null, startsAt: { gte: new Date(now.getTime() - 30 * DAY), lte: now } },
        select: {
          id: true,
          startsAt: true,
          durationMinutes: true,
          cancelledAt: true,
          batch: { select: { classLevelId: true, sectionId: true } },
          _count: { select: { attendance: true } },
        },
      }),
    ])

  const lessonsIn = new Map(lessonCounts.map((l) => [l.courseId, l._count._all]))
  const done = new Map(doneByEnrollment.map((d) => [d.enrollmentId, d._count._all]))
  const percentOf = (e: (typeof enrollments)[number]) =>
    e.completedAt ? 100 : Math.min(100, pct(done.get(e.id) ?? 0, lessonsIn.get(e.courseId) ?? 0))
  const placementOf = new Map(placements.map((p) => [p.studentId, p]))
  const quietBefore = now.getTime() - QUIET_AFTER_DAYS * DAY

  // Courses
  const courseRows = courses
    .filter((c) => !c.deletedAt)
    .map((c) => {
      const mine = enrollments.filter((e) => e.courseId === c.id)
      const finished = mine.filter((e) => e.completedAt).length
      return {
        id: c.id,
        title: c.title,
        own: c.tenantId === ctx.tenant.id,
        lessons: lessonsIn.get(c.id) ?? 0,
        started: mine.length,
        finished,
        inProgress: mine.length - finished,
        averagePercent: mine.length ? Math.round(mine.reduce((s, e) => s + percentOf(e), 0) / mine.length) : 0,
        quiet: mine.filter((e) => !e.completedAt && e.lastActivityAt.getTime() < quietBefore).length,
      }
    })
    .sort((a, b) => b.started - a.started || a.title.localeCompare(b.title))

  // Classes
  const size = new Map(classSizes.map((c) => [c.classLevelId, c._count._all]))
  const classAgg = new Map<string, { name: string; order: number; learners: Set<string>; finished: number; enrolments: number; percentSum: number }>()
  for (const e of enrollments) {
    const p = placementOf.get(e.studentId)
    if (!p) continue
    const row =
      classAgg.get(p.classLevelId) ??
      { name: p.classLevel.name, order: p.classLevel.numeric, learners: new Set<string>(), finished: 0, enrolments: 0, percentSum: 0 }
    row.learners.add(e.studentId)
    row.enrolments += 1
    row.percentSum += percentOf(e)
    if (e.completedAt) row.finished += 1
    classAgg.set(p.classLevelId, row)
  }
  const classRows = [...classAgg.entries()]
    .map(([id, r]) => ({
      id,
      name: r.name,
      order: r.order,
      students: size.get(id) ?? 0,
      learners: r.learners.size,
      reach: pct(r.learners.size, size.get(id) ?? 0),
      finished: r.finished,
      averagePercent: r.enrolments ? Math.round(r.percentSum / r.enrolments) : 0,
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))

  // Weekly activity: lessons completed per IST week, oldest first.
  const weeks = Array.from({ length: 8 }, (_, i) => shiftIso(weeksFrom, i * 7))
  const perWeek = new Map(weeks.map((w) => [w, 0]))
  for (const r of recent) {
    const w = weekStartIso(istClock(r.completedAt!).iso)
    if (perWeek.has(w)) perWeek.set(w, perWeek.get(w)! + 1)
  }

  // People
  const titleOf = new Map(courses.map((c) => [c.id, c.title]))
  const person = (studentId: string) => {
    const p = placementOf.get(studentId)
    return {
      studentId,
      name: p ? `${p.student.firstName} ${p.student.lastName}`.trim() : 'Former student',
      admissionNo: p?.student.admissionNo ?? '',
      className: p ? `${p.classLevel.name}${p.section ? ` – ${p.section.name}` : ''}` : '',
    }
  }
  const quiet = enrollments
    .filter((e) => !e.completedAt && e.lastActivityAt.getTime() < quietBefore && placementOf.has(e.studentId))
    .sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime())
    .slice(0, 15)
    .map((e) => ({
      ...person(e.studentId),
      courseId: e.courseId,
      courseTitle: titleOf.get(e.courseId) ?? 'Course',
      percent: percentOf(e),
      lastActivityAt: e.lastActivityAt,
      days: Math.floor((now.getTime() - e.lastActivityAt.getTime()) / DAY),
    }))

  const monthAgo = now.getTime() - 30 * DAY
  const lessonsByStudent = new Map<string, number>()
  for (const r of recent) {
    if (r.completedAt!.getTime() < monthAgo) continue
    lessonsByStudent.set(r.studentId, (lessonsByStudent.get(r.studentId) ?? 0) + 1)
  }
  const top = [...lessonsByStudent.entries()]
    .filter(([id]) => placementOf.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, lessons]) => ({ ...person(id), lessons }))

  // Live classes over the last 30 days that have finished.
  const ended = liveClasses.filter((c) => liveState(c, now) === 'ended')
  const audienceKeys = [...new Set(ended.map((c) => `${c.batch.classLevelId ?? ''}|${c.batch.sectionId ?? ''}`))]
  const audienceSize = new Map(
    await Promise.all(
      audienceKeys.map(async (key) => {
        const [classLevelId, sectionId] = key.split('|')
        const count = await ctx.db.enrollment.count({
          where: {
            isCurrent: true,
            student: { deletedAt: null, status: 'ACTIVE' },
            ...(sectionId ? { sectionId } : classLevelId ? { classLevelId } : {}),
          },
        })
        return [key, count] as const
      }),
    ),
  )
  const expected = ended.reduce((s, c) => s + (audienceSize.get(`${c.batch.classLevelId ?? ''}|${c.batch.sectionId ?? ''}`) ?? 0), 0)
  const joined = ended.reduce((s, c) => s + c._count.attendance, 0)

  const active7 = new Set(enrollments.filter((e) => e.lastActivityAt.getTime() >= now.getTime() - 7 * DAY).map((e) => e.studentId))

  return {
    totals: {
      learners: studentIds.length,
      active7: active7.size,
      enrolments: enrollments.length,
      finished: enrollments.filter((e) => e.completedAt).length,
      certificates,
      quizAverage: quiz._count._all ? Math.round(quiz._avg.scorePercent ?? 0) : null,
      quizAttempts: quiz._count._all,
      liveClasses: ended.length,
      liveAttendance: expected ? pct(joined, expected) : null,
      pendingReviews,
      kitsOut: kitsOut._sum.quantity ?? 0,
      kitsLate,
    },
    courses: courseRows,
    classes: classRows,
    weeks: weeks.map((w) => ({ week: w, lessons: perWeek.get(w) ?? 0 })),
    quiet,
    top,
  }
}

/** The student's own numbers for the top of My courses. */
export async function learnerSummary(ctx: AppContext) {
  const learner = await requireLearner(ctx)
  const now = new Date()
  const [lessonsDone, certificates, nextClass] = await Promise.all([
    ctx.db.lmsLessonProgress.count({ where: { studentId: learner.id, completedAt: { not: null } } }),
    ctx.db.lmsCertificate.count({ where: { studentId: learner.id, revokedAt: null } }),
    (async () => {
      const batches = await ctx.db.lmsBatch.findMany({
        where: await learnerBatchWhere(ctx, learner),
        select: { id: true },
      })
      const rows = await ctx.db.lmsLiveClass.findMany({
        where: { batchId: { in: batches.map((b) => b.id) }, cancelledAt: null, startsAt: { gte: new Date(now.getTime() - 3 * 3600_000) } },
        orderBy: { startsAt: 'asc' },
        take: 5,
        select: { id: true, title: true, startsAt: true, durationMinutes: true, cancelledAt: true },
      })
      const next = rows.find((r) => liveState(r, now) !== 'ended')
      return next ? { ...next, state: liveState(next, now) } : null
    })(),
  ])
  return { lessonsDone, certificates, nextClass }
}

/** Platform console: how each school with the add-on is using it. */
export async function platformUsage() {
  const now = Date.now()
  const tenants = await prisma.tenant.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, slug: true, school: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
  const enabled = (
    await Promise.all(tenants.map(async (t) => ((await hasFeature(t.id, FEATURE.MODULE_ROBOTICS_LMS)) ? t : null)))
  ).filter((t): t is (typeof tenants)[number] => !!t)
  const ids = enabled.map((t) => t.id)

  const [learners, enrolments, finished, active, certificates, ownCourses, batches, kitsOut, lastActive, catalogueUse] = await Promise.all([
    prisma.lmsEnrollment.groupBy({ by: ['tenantId', 'studentId'], where: { tenantId: { in: ids } } }),
    prisma.lmsEnrollment.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids } }, _count: { _all: true } }),
    prisma.lmsEnrollment.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids }, completedAt: { not: null } }, _count: { _all: true } }),
    prisma.lmsEnrollment.groupBy({ by: ['tenantId', 'studentId'], where: { tenantId: { in: ids }, lastActivityAt: { gte: new Date(now - 7 * DAY) } } }),
    prisma.lmsCertificate.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids }, revokedAt: null }, _count: { _all: true } }),
    prisma.lmsCourse.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
    prisma.lmsBatch.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids }, archivedAt: null }, _count: { _all: true } }),
    prisma.lmsKitLoan.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids }, returnedAt: null }, _sum: { quantity: true } }),
    prisma.lmsEnrollment.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids } }, _max: { lastActivityAt: true } }),
    prisma.lmsEnrollment.groupBy({ by: ['courseId', 'tenantId'], where: { tenantId: { in: ids } }, _count: { _all: true } }),
  ])
  const countBy = <T extends { tenantId: string | null }>(rows: T[], value: (r: T) => number) => {
    const m = new Map<string, number>()
    for (const r of rows) if (r.tenantId) m.set(r.tenantId, (m.get(r.tenantId) ?? 0) + value(r))
    return m
  }
  const learnersBy = countBy(learners, () => 1)
  const activeBy = countBy(active, () => 1)
  const enrolBy = countBy(enrolments, (r) => r._count._all)
  const finishedBy = countBy(finished, (r) => r._count._all)
  const certBy = countBy(certificates, (r) => r._count._all)
  const ownBy = countBy(ownCourses, (r) => r._count._all)
  const batchBy = countBy(batches, (r) => r._count._all)
  const kitsBy = countBy(kitsOut, (r) => r._sum.quantity ?? 0)
  const lastBy = new Map(lastActive.map((r) => [r.tenantId, r._max.lastActivityAt]))

  const schools = enabled.map((t) => ({
    id: t.id,
    name: t.school?.name ?? t.name,
    slug: t.slug,
    learners: learnersBy.get(t.id) ?? 0,
    active7: activeBy.get(t.id) ?? 0,
    enrolments: enrolBy.get(t.id) ?? 0,
    finished: finishedBy.get(t.id) ?? 0,
    certificates: certBy.get(t.id) ?? 0,
    ownCourses: ownBy.get(t.id) ?? 0,
    batches: batchBy.get(t.id) ?? 0,
    kitsOut: kitsBy.get(t.id) ?? 0,
    lastActivityAt: lastBy.get(t.id) ?? null,
  }))

  const catalogue = await prisma.lmsCourse.findMany({
    where: { tenantId: null, deletedAt: null },
    select: { id: true, title: true, status: true },
    orderBy: { title: 'asc' },
  })
  const courseRows = catalogue
    .map((c) => {
      const uses = catalogueUse.filter((u) => u.courseId === c.id)
      return { ...c, schools: uses.length, learners: uses.reduce((s, u) => s + u._count._all, 0) }
    })
    .sort((a, b) => b.learners - a.learners || a.title.localeCompare(b.title))

  return {
    totals: {
      schools: schools.length,
      activeSchools: schools.filter((s) => s.active7 > 0).length,
      learners: schools.reduce((s, x) => s + x.learners, 0),
      finished: schools.reduce((s, x) => s + x.finished, 0),
      certificates: schools.reduce((s, x) => s + x.certificates, 0),
    },
    schools: schools.sort((a, b) => b.learners - a.learners || a.name.localeCompare(b.name)),
    courses: courseRows,
  }
}
