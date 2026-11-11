import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import { FEATURE, invalidateEntitlementsCache } from '../src/server/entitlements'
import * as content from '../src/server/modules/lms/content'
import { assignCourse, courseProgress, listCatalogue, visibleCourse } from '../src/server/modules/lms/school'
import { completeLesson, courseForLearner, lessonForLearner, myCourses, submitQuiz } from '../src/server/modules/lms/learning'

/**
 * The LMS promise: the platform publishes a course once and every school with
 * the add-on sees it; a school's own courses stay private and catalogue
 * courses stay read-only to it; a student sees only courses opened to their
 * class; quiz answers never reach the browser; progress adds up.
 */
const prisma = new PrismaClient()
const TAG = `ZZLMS-${Date.now().toString(36)}`
const CATALOGUE = { tenantId: null }
const actor = { id: 'u_platform', label: 'Platform Tester' }

let tenantId: string
let staff: AppContext
let learner: AppContext
let student: { id: string; classLevelId: string }
let createdOverride = false
const courseIds: string[] = []

function contextFor(id: string, userId: string, held: Set<string>): AppContext {
  return {
    user: {
      sessionId: 's_test',
      userId,
      tenantId: id,
      isSuperAdmin: false,
      firstName: 'Lms',
      lastName: 'Tester',
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

let platformCourseId: string
let videoLessonId: string
let quizLessonId: string

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
  staff = contextFor(tenantId, 'u_staff', new Set(['lms.view', 'lms.manage']))
  learner = contextFor(tenantId, enrolment.student.userId!, new Set(['lms.learn']))
})

afterAll(async () => {
  await prisma.lmsCourse.deleteMany({ where: { id: { in: courseIds } } })
  if (createdOverride) {
    await prisma.tenantEntitlementOverride.deleteMany({ where: { tenantId, featureKey: FEATURE.MODULE_ROBOTICS_LMS, note: TAG } })
    await invalidateEntitlementsCache(tenantId)
  }
  await prisma.$disconnect()
})

describe('course authoring', () => {
  it('builds a catalogue course with a module, a video and a quiz', async () => {
    const course = await content.createCourse(CATALOGUE, actor, {
      title: `${TAG} Line follower`,
      category: 'ROBOTICS',
      level: 'BEGINNER',
      outcomes: '- Wire a motor driver\n- Read an IR sensor',
    })
    platformCourseId = course.id
    courseIds.push(course.id)
    const editing = await content.getCourseForEditing(CATALOGUE, course.id)
    expect(editing.outcomes).toEqual(['Wire a motor driver', 'Read an IR sensor'])
    const moduleId = editing.modules[0]!.id

    await expect(content.setCourseStatus(CATALOGUE, course.id, 'PUBLISHED')).rejects.toThrow(/at least one lesson/)
    await expect(
      content.createLesson(CATALOGUE, moduleId, { title: 'Intro', kind: 'VIDEO', videoUrl: 'https://example.com/video' }),
    ).rejects.toThrow(/YouTube or Vimeo/)

    videoLessonId = (await content.createLesson(CATALOGUE, moduleId, { title: 'Intro', kind: 'VIDEO', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' })).id
    await expect(
      content.createLesson(CATALOGUE, moduleId, {
        title: 'Check',
        kind: 'QUIZ',
        quiz: { questions: [{ id: 'q1', prompt: 'Pick', multiple: false, options: [{ id: 'a', text: 'A', correct: false }, { id: 'b', text: 'B', correct: false }] }] },
      }),
    ).rejects.toThrow(/Mark the correct answer/)
    quizLessonId = (
      await content.createLesson(CATALOGUE, moduleId, {
        title: 'Check',
        kind: 'QUIZ',
        passPercent: 100,
        quiz: {
          questions: [
            { id: 'q1', prompt: 'Which sensor?', multiple: false, options: [{ id: 'a', text: 'IR', correct: true }, { id: 'b', text: 'Heat', correct: false }] },
          ],
        },
      })
    ).id

    await content.moveLesson(CATALOGUE, quizLessonId, 'up')
    let order = (await content.getCourseForEditing(CATALOGUE, course.id)).modules[0]!.lessons.map((l) => l.id)
    expect(order).toEqual([quizLessonId, videoLessonId])
    await content.moveLesson(CATALOGUE, quizLessonId, 'down')
    order = (await content.getCourseForEditing(CATALOGUE, course.id)).modules[0]!.lessons.map((l) => l.id)
    expect(order).toEqual([videoLessonId, quizLessonId])

    await expect(content.deleteModule(CATALOGUE, moduleId)).rejects.toThrow(/at least one module/)
  })

  it('hides drafts from schools until published', async () => {
    expect((await listCatalogue(staff)).some((c) => c.id === platformCourseId)).toBe(false)
    await content.setCourseStatus(CATALOGUE, platformCourseId, 'PUBLISHED')
    expect((await listCatalogue(staff)).find((c) => c.id === platformCourseId)).toMatchObject({ own: false })
  })

  it('keeps a school out of catalogue courses and other schools out of its own', async () => {
    const owner = { tenantId }
    await expect(content.updateCourse(owner, platformCourseId, { title: 'Hijacked', category: 'AI', level: 'BEGINNER' })).rejects.toThrow(/not found/i)
    await expect(content.addModule(owner, platformCourseId, 'Sneaky')).rejects.toThrow(/not found/i)

    const own = await content.createCourse(owner, actor, { title: `${TAG} School drone club`, category: 'DRONES', level: 'BEGINNER' })
    courseIds.push(own.id)
    const listed = await listCatalogue(staff)
    expect(listed.find((c) => c.id === own.id)).toMatchObject({ own: true, status: 'DRAFT' })

    const other = contextFor('zz-other-school', 'u_other', new Set(['lms.view']))
    await expect(visibleCourse(other, own.id)).rejects.toThrow(/not found/i)
    await expect(visibleCourse(other, platformCourseId)).resolves.toMatchObject({ id: platformCourseId })
  })
})

describe('learning', () => {
  it('shows a course to a student only once it is opened to their class', async () => {
    expect((await myCourses(learner)).courses.some((c) => c.id === platformCourseId)).toBe(false)
    await expect(courseForLearner(learner, platformCourseId)).rejects.toThrow(/not open to your class/)

    await assignCourse(staff, platformCourseId, { classLevelId: student.classLevelId })
    await expect(assignCourse(staff, platformCourseId, { classLevelId: student.classLevelId })).rejects.toThrow(/already open/)
    const mine = (await myCourses(learner)).courses.find((c) => c.id === platformCourseId)
    expect(mine).toMatchObject({ started: false, lessons: 2, percent: 0 })
  })

  it('never sends quiz answers to the student', async () => {
    const { lesson } = await lessonForLearner(learner, platformCourseId, quizLessonId)
    const sent = JSON.stringify(lesson.quiz)
    expect(sent).toContain('Which sensor?')
    expect(sent).not.toContain('correct')
  })

  it('records lessons and quiz attempts until the course is complete', async () => {
    const afterVideo = await completeLesson(learner, platformCourseId, videoLessonId)
    expect(afterVideo).toMatchObject({ complete: false, done: 1, total: 2 })
    await expect(completeLesson(learner, platformCourseId, quizLessonId)).rejects.toThrow(/Pass the quiz/)

    const wrong = await submitQuiz(learner, platformCourseId, quizLessonId, { q1: ['b'] })
    expect(wrong).toMatchObject({ passed: false, scorePercent: 0, courseComplete: false })
    expect(wrong.questions[0]!.correctOptionIds).toEqual(['a'])

    const right = await submitQuiz(learner, platformCourseId, quizLessonId, { q1: ['a'] })
    expect(right).toMatchObject({ passed: true, scorePercent: 100, courseComplete: true })

    const outline = await courseForLearner(learner, platformCourseId)
    expect(outline.percent).toBe(100)
    expect(outline.enrollment.completedAt).not.toBeNull()
    expect(outline.scores.get(quizLessonId)).toBe(100)

    const progress = await prisma.lmsLessonProgress.findFirstOrThrow({ where: { lessonId: quizLessonId, studentId: student.id } })
    expect(progress.attempts).toBe(2)
    expect(await prisma.lmsQuizAttempt.count({ where: { lessonId: quizLessonId, studentId: student.id } })).toBe(2)
  })

  it('reports the student in the school progress view', async () => {
    const { rows, totals } = await courseProgress(staff, platformCourseId)
    expect(rows.find((r) => r.studentId === student.id)).toMatchObject({ percent: 100, completed: 2, total: 2, quizAverage: 100 })
    expect(totals.completed).toBeGreaterThanOrEqual(1)
    expect(totals.students).toBeGreaterThanOrEqual(1)
  })

  it('reopens a finished course when a new lesson is added', async () => {
    const moduleId = (await content.getCourseForEditing(CATALOGUE, platformCourseId)).modules[0]!.id
    const extra = await content.createLesson(CATALOGUE, moduleId, { title: 'Bonus', kind: 'TEXT', body: 'More to read' })
    const before = await courseForLearner(learner, platformCourseId)
    expect(before.percent).toBe(67)
    expect(before.resumeLessonId).toBe(extra.id)
    const done = await completeLesson(learner, platformCourseId, extra.id)
    expect(done).toMatchObject({ complete: true, done: 3, total: 3 })
  })
})
