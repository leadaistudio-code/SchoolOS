import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { badRequest, forbidden, notFound } from '@/server/api/response'
import { FEATURE, assertWithinLimit } from '@/server/entitlements'
import { gradeQuiz, publicQuiz, type Quiz, type QuizResult } from '@/lib/lms/options'
import { assertLms } from './access'
import { issueCertificateFor } from './certificates'

/**
 * The student's side: which courses are open to them, the lesson player, and
 * progress. A course is open when it is published and assigned to the
 * student's current class, section or the whole school, or when the student
 * already started it.
 */

export async function currentLearner(ctx: AppContext) {
  const student = await ctx.db.student.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!student) return null
  const placement = await ctx.db.enrollment.findFirst({
    where: { studentId: student.id, isCurrent: true },
    orderBy: { joinedOn: 'desc' },
    select: { classLevelId: true, sectionId: true },
  })
  return { ...student, placement }
}

export type Learner = NonNullable<Awaited<ReturnType<typeof currentLearner>>>

export async function requireLearner(ctx: AppContext): Promise<Learner> {
  ctx.require('lms.learn')
  await assertLms(ctx)
  const learner = await currentLearner(ctx)
  if (!learner) throw forbidden('Courses are taken from a student account')
  return learner
}

async function assignedCourseIds(ctx: AppContext, learner: Learner) {
  const p = learner.placement
  const rows = await ctx.db.lmsCourseAssignment.findMany({
    where: {
      OR: [
        { classLevelId: null },
        ...(p ? [{ classLevelId: p.classLevelId, sectionId: null }, { sectionId: p.sectionId }] : []),
      ],
    },
    select: { courseId: true },
  })
  return new Set(rows.map((r) => r.courseId))
}

function openCourseWhere(ctx: AppContext) {
  return { deletedAt: null, status: 'PUBLISHED' as const, OR: [{ tenantId: null }, { tenantId: ctx.tenant.id }] }
}

export async function myCourses(ctx: AppContext) {
  const learner = await requireLearner(ctx)
  const [assigned, enrollments] = await Promise.all([
    assignedCourseIds(ctx, learner),
    ctx.db.lmsEnrollment.findMany({
      where: { studentId: learner.id },
      select: { courseId: true, completedAt: true, lastActivityAt: true, lastLessonId: true, id: true },
    }),
  ])
  const ids = [...new Set([...assigned, ...enrollments.map((e) => e.courseId)])]
  const courses = await ctx.db.lmsCourse.findMany({
    where: { id: { in: ids }, ...openCourseWhere(ctx) },
    include: { lessons: { select: { id: true, durationMinutes: true } } },
  })
  const done = await ctx.db.lmsLessonProgress.findMany({
    where: { studentId: learner.id, enrollmentId: { in: enrollments.map((e) => e.id) }, completedAt: { not: null } },
    select: { lessonId: true },
  })
  const doneIds = new Set(done.map((d) => d.lessonId))
  const enrolment = new Map(enrollments.map((e) => [e.courseId, e]))
  const list = courses.map((c) => {
    const e = enrolment.get(c.id)
    const completed = c.lessons.filter((l) => doneIds.has(l.id)).length
    return {
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      category: c.category,
      level: c.level,
      lessons: c.lessons.length,
      minutes: c.lessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0),
      completed,
      percent: c.lessons.length ? Math.round((completed / c.lessons.length) * 100) : 0,
      started: !!e,
      completedAt: e?.completedAt ?? null,
      lastActivityAt: e?.lastActivityAt ?? null,
      resumeLessonId: e?.lastLessonId ?? null,
    }
  })
  return {
    learner,
    courses: list.sort(
      (a, b) =>
        Number(!!a.completedAt) - Number(!!b.completedAt) ||
        (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0) ||
        a.title.localeCompare(b.title),
    ),
  }
}

export { openCourse as openCourseFor }

async function openCourse(ctx: AppContext, learner: Learner, courseId: string) {
  const course = await ctx.db.lmsCourse.findFirst({
    where: { id: courseId, ...openCourseWhere(ctx) },
    include: {
      modules: {
        orderBy: { position: 'asc' },
        include: { lessons: { orderBy: { position: 'asc' }, select: { id: true, title: true, kind: true, durationMinutes: true } } },
      },
    },
  })
  if (!course) throw notFound('Course')
  let enrollment = await ctx.db.lmsEnrollment.findFirst({ where: { courseId, studentId: learner.id } })
  if (!enrollment) {
    const assigned = await assignedCourseIds(ctx, learner)
    if (!assigned.has(courseId)) throw forbidden('This course is not open to your class')
    const learning = await ctx.db.lmsEnrollment.groupBy({ by: ['studentId'] })
    if (!learning.some((l) => l.studentId === learner.id)) {
      await assertWithinLimit(ctx.tenant.id, FEATURE.LIMIT_LMS_STUDENTS, learning.length)
    }
    enrollment = await ctx.db.lmsEnrollment.upsert({
      where: { tenantId_courseId_studentId: { tenantId: ctx.tenant.id, courseId, studentId: learner.id } },
      create: { tenantId: ctx.tenant.id, courseId, studentId: learner.id },
      update: {},
    })
  }
  return { course, enrollment }
}

export async function courseForLearner(ctx: AppContext, courseId: string) {
  const learner = await requireLearner(ctx)
  const { course, enrollment } = await openCourse(ctx, learner, courseId)
  const progress = await ctx.db.lmsLessonProgress.findMany({
    where: { enrollmentId: enrollment.id },
    select: { lessonId: true, completedAt: true, bestScorePercent: true },
  })
  const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id))
  const completed = new Set(progress.filter((p) => p.completedAt).map((p) => p.lessonId))
  const next = lessonIds.find((id) => !completed.has(id)) ?? lessonIds[0] ?? null
  return {
    learner,
    course,
    enrollment,
    completed,
    scores: new Map(progress.map((p) => [p.lessonId, p.bestScorePercent])),
    percent: lessonIds.length ? Math.round((lessonIds.filter((id) => completed.has(id)).length / lessonIds.length) * 100) : 0,
    resumeLessonId: enrollment.lastLessonId && lessonIds.includes(enrollment.lastLessonId) && !completed.has(enrollment.lastLessonId)
      ? enrollment.lastLessonId
      : next,
  }
}

/** The lesson as a learner sees it: quiz answers are never sent. */
export async function lessonForLearner(ctx: AppContext, courseId: string, lessonId: string) {
  const outline = await courseForLearner(ctx, courseId)
  const lesson = await ctx.db.lmsLesson.findFirst({ where: { id: lessonId, courseId } })
  if (!lesson) throw notFound('Lesson')
  await ctx.db.lmsEnrollment.update({
    where: { id: outline.enrollment.id },
    data: { lastLessonId: lessonId, lastActivityAt: new Date() },
  })
  const order = outline.course.modules.flatMap((m) => m.lessons.map((l) => l.id))
  const at = order.indexOf(lessonId)
  const { quiz, ...rest } = lesson
  return {
    ...outline,
    lesson: { ...rest, quiz: publicQuiz(quiz as Quiz | null) },
    previousLessonId: at > 0 ? order[at - 1]! : null,
    nextLessonId: at >= 0 && at < order.length - 1 ? order[at + 1]! : null,
  }
}

/** Sets or clears the course's completion. `byLearner` false: a teacher's action, not student activity. */
export async function finishIfDone(ctx: AppContext, enrollmentId: string, courseId: string, byLearner = true) {
  const [total, done, enrollment] = await Promise.all([
    ctx.db.lmsLesson.count({ where: { courseId } }),
    ctx.db.lmsLessonProgress.count({ where: { enrollmentId, completedAt: { not: null }, lesson: { courseId } } }),
    ctx.db.lmsEnrollment.findFirstOrThrow({ where: { id: enrollmentId }, select: { completedAt: true } }),
  ])
  const complete = total > 0 && done >= total
  await ctx.db.lmsEnrollment.update({
    where: { id: enrollmentId },
    data: {
      ...(byLearner ? { lastActivityAt: new Date() } : {}),
      completedAt: complete ? (enrollment.completedAt ?? new Date()) : null,
    },
  })
  if (complete) await issueCertificateFor(ctx, enrollmentId)
  return { complete, done, total }
}

export async function completeLesson(ctx: AppContext, courseId: string, lessonId: string) {
  const learner = await requireLearner(ctx)
  const { enrollment } = await openCourse(ctx, learner, courseId)
  const lesson = await ctx.db.lmsLesson.findFirst({ where: { id: lessonId, courseId }, select: { id: true, kind: true } })
  if (!lesson) throw notFound('Lesson')
  if (lesson.kind === 'QUIZ') throw badRequest('Pass the quiz to complete this lesson')
  if (lesson.kind === 'PROJECT') throw badRequest('Submit your project; it is complete once your teacher approves it')
  const existing = await ctx.db.lmsLessonProgress.findFirst({ where: { enrollmentId: enrollment.id, lessonId } })
  if (!existing) {
    await ctx.db.lmsLessonProgress.create({
      data: { tenantId: ctx.tenant.id, enrollmentId: enrollment.id, lessonId, studentId: learner.id, completedAt: new Date() },
    })
  } else if (!existing.completedAt) {
    await ctx.db.lmsLessonProgress.update({ where: { id: existing.id }, data: { completedAt: new Date() } })
  }
  return finishIfDone(ctx, enrollment.id, courseId)
}

export const quizAnswersSchema = z.record(z.string().max(40), z.array(z.string().max(40)).max(6))

export async function submitQuiz(
  ctx: AppContext,
  courseId: string,
  lessonId: string,
  rawAnswers: unknown,
): Promise<QuizResult & { courseComplete: boolean }> {
  const learner = await requireLearner(ctx)
  const { enrollment } = await openCourse(ctx, learner, courseId)
  const lesson = await ctx.db.lmsLesson.findFirst({ where: { id: lessonId, courseId } })
  if (!lesson || lesson.kind !== 'QUIZ' || !lesson.quiz) throw notFound('Quiz')
  const answers = quizAnswersSchema.parse(rawAnswers)
  const result = gradeQuiz(lesson.quiz as unknown as Quiz, answers, lesson.passPercent)

  await ctx.db.lmsQuizAttempt.create({
    data: {
      tenantId: ctx.tenant.id,
      enrollmentId: enrollment.id,
      lessonId,
      studentId: learner.id,
      answers,
      correctCount: result.correctCount,
      totalCount: result.totalCount,
      scorePercent: result.scorePercent,
      passed: result.passed,
    },
  })
  const existing = await ctx.db.lmsLessonProgress.findFirst({ where: { enrollmentId: enrollment.id, lessonId } })
  if (!existing) {
    await ctx.db.lmsLessonProgress.create({
      data: {
        tenantId: ctx.tenant.id,
        enrollmentId: enrollment.id,
        lessonId,
        studentId: learner.id,
        attempts: 1,
        bestScorePercent: result.scorePercent,
        completedAt: result.passed ? new Date() : null,
      },
    })
  } else {
    await ctx.db.lmsLessonProgress.update({
      where: { id: existing.id },
      data: {
        attempts: existing.attempts + 1,
        bestScorePercent: Math.max(existing.bestScorePercent ?? 0, result.scorePercent),
        ...(result.passed && !existing.completedAt ? { completedAt: new Date() } : {}),
      },
    })
  }
  const { complete } = await finishIfDone(ctx, enrollment.id, courseId)
  return { ...result, courseComplete: complete }
}
