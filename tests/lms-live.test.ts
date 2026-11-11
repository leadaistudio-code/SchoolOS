import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import { FEATURE, invalidateEntitlementsCache } from '../src/server/entitlements'
import { liveState, meetingPlatform } from '../src/lib/lms/live'
import * as content from '../src/server/modules/lms/content'
import { assignCourse } from '../src/server/modules/lms/school'
import { completeLesson, courseForLearner } from '../src/server/modules/lms/learning'
import * as live from '../src/server/modules/lms/live'
import { mySubmission, reviewProject, reviewQueue, submitProject } from '../src/server/modules/lms/projects'

/**
 * Phase 2 of the LMS: live classes reach only the batch's students and record
 * who pressed Join inside the join window; project lessons complete only when
 * a teacher approves the submission.
 */
const prisma = new PrismaClient()
const TAG = `ZZLIVE-${Date.now().toString(36)}`
const actor = { id: 'u_platform', label: 'Platform Tester' }

let tenantId: string
let staff: AppContext
let learner: AppContext
let student: { id: string; classLevelId: string }
let otherClassId: string
let createdOverride = false
const courseIds: string[] = []

function contextFor(id: string, userId: string, held: Set<string>): AppContext {
  return {
    user: {
      sessionId: 's_test',
      userId,
      tenantId: id,
      isSuperAdmin: false,
      firstName: 'Live',
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
  otherClassId = (
    await prisma.classLevel.findFirstOrThrow({ where: { tenantId, deletedAt: null, id: { not: student.classLevelId } }, select: { id: true } })
  ).id
  staff = contextFor(tenantId, 'u_staff', new Set(['lms.view', 'lms.manage', 'lms.teach']))
  learner = contextFor(tenantId, enrolment.student.userId!, new Set(['lms.learn']))
})

afterAll(async () => {
  await prisma.lmsBatch.deleteMany({ where: { tenantId, title: { startsWith: TAG } } })
  await prisma.lmsCourse.deleteMany({ where: { id: { in: courseIds } } })
  if (createdOverride) {
    await prisma.tenantEntitlementOverride.deleteMany({ where: { tenantId, featureKey: FEATURE.MODULE_ROBOTICS_LMS, note: TAG } })
    await invalidateEntitlementsCache(tenantId)
  }
  await prisma.$disconnect()
})

describe('live class helpers', () => {
  const start = new Date('2026-11-11T10:00:00Z')
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000)
  const c = { startsAt: start, durationMinutes: 60, cancelledAt: null }

  it('opens the join window 15 minutes early and closes it 30 minutes after the end', () => {
    expect(liveState(c, at(-16))).toBe('upcoming')
    expect(liveState(c, at(-15))).toBe('open')
    expect(liveState(c, at(90))).toBe('open')
    expect(liveState(c, at(91))).toBe('ended')
    expect(liveState({ ...c, cancelledAt: start }, at(0))).toBe('cancelled')
  })

  it('names the meeting service from the link', () => {
    expect(meetingPlatform('https://us02web.zoom.us/j/123')).toBe('Zoom')
    expect(meetingPlatform('https://meet.google.com/abc-defg-hij')).toBe('Google Meet')
    expect(meetingPlatform('https://teams.microsoft.com/l/meetup')).toBe('Microsoft Teams')
    expect(meetingPlatform('https://example.com/room')).toBe('Online class')
    expect(meetingPlatform(null)).toBe('Online class')
  })
})

describe('live classes', () => {
  let batchId: string
  let otherBatchId: string

  it('requires a meeting link and schedules a weekly series', async () => {
    await expect(live.createBatch(staff, { title: `${TAG} Bad`, meetingUrl: 'http://zoom.us/j/1' })).rejects.toThrow(/https/)
    const batch = await live.createBatch(staff, { title: `${TAG} Robotics live`, classLevelId: student.classLevelId })
    batchId = batch.id
    const when = { title: 'Sensors', date: '2030-01-07', time: '16:00', durationMinutes: 45 }
    await expect(live.scheduleClasses(staff, batchId, when)).rejects.toThrow(/meeting link/)

    const made = await live.scheduleClasses(staff, batchId, { ...when, meetingUrl: 'https://meet.google.com/abc-defg-hij', repeatWeeks: 3 })
    expect(made).toBe(4)
    const { classes, batch: detail } = await live.getBatch(staff, batchId)
    expect(classes.map((c) => c.title)).toEqual(['Sensors · 1', 'Sensors · 2', 'Sensors · 3', 'Sensors · 4'])
    expect(classes[1]!.startsAt.getTime() - classes[0]!.startsAt.getTime()).toBe(7 * 86400_000)
    expect(classes[0]!.startsAt.toISOString()).toBe('2030-01-07T10:30:00.000Z')
    expect(classes.every((c) => c.state === 'upcoming')).toBe(true)
    expect(detail.audience).not.toBe('Whole school')

    const other = await live.createBatch(staff, { title: `${TAG} Other class`, classLevelId: otherClassId, meetingUrl: 'https://zoom.us/j/9' })
    otherBatchId = other.id
    await live.scheduleClasses(staff, otherBatchId, { ...when, title: 'Elsewhere' })
  })

  it('shows a student only their batch and lets them join only while the class is open', async () => {
    const mine = await live.myLiveClasses(learner)
    expect(mine.upcoming.some((c) => c.batch.id === batchId)).toBe(true)
    expect(mine.upcoming.some((c) => c.batch.id === otherBatchId)).toBe(false)

    const foreign = await prisma.lmsLiveClass.findFirstOrThrow({ where: { batchId: otherBatchId } })
    await expect(live.joinLiveClass(learner, foreign.id)).rejects.toThrow(/not found/i)

    const first = (await live.getBatch(staff, batchId)).classes[0]!
    await expect(live.joinLiveClass(learner, first.id)).rejects.toThrow(/15 minutes before/)

    await prisma.lmsLiveClass.update({ where: { id: first.id }, data: { startsAt: new Date(Date.now() - 5 * 60_000) } })
    expect(await live.joinLiveClass(learner, first.id)).toBe('https://meet.google.com/abc-defg-hij')
    await live.joinLiveClass(learner, first.id)
    const attendance = await live.liveClassAttendance(staff, first.id)
    expect(attendance.joinedCount).toBe(1)
    expect(attendance.rows.find((r) => r.studentId === student.id)).toMatchObject({ joins: 2 })
    expect(attendance.rows[0]!.studentId).toBe(student.id)

    await live.setCancelled(staff, first.id, true)
    await expect(live.joinLiveClass(learner, first.id)).rejects.toThrow(/cancelled/)
    await live.setCancelled(staff, first.id, false)
  })

  it('keeps recordings to https links and shows them to the student', async () => {
    const first = (await live.getBatch(staff, batchId)).classes[0]!
    await expect(live.setRecording(staff, first.id, 'ftp://files/rec.mp4')).rejects.toThrow(/https/)
    await live.setRecording(staff, first.id, 'https://youtu.be/dQw4w9WgXcQ')
    expect((await live.liveClassForLearner(learner, first.id)).recordingUrl).toBe('https://youtu.be/dQw4w9WgXcQ')
  })

  it('keeps another school out of the batch', async () => {
    const other = contextFor('zz-other-school', 'u_other', new Set(['lms.view', 'lms.teach']))
    await expect(live.getBatch(other, batchId)).rejects.toThrow()
  })
})

describe('project review', () => {
  let courseId: string
  let projectId: string
  let textId: string

  it('completes a project lesson only once the teacher approves it', async () => {
    const course = await content.createCourse({ tenantId }, actor, { title: `${TAG} Build a rover`, category: 'ROBOTICS', level: 'BEGINNER' })
    courseId = course.id
    courseIds.push(courseId)
    const moduleId = (await content.getCourseForEditing({ tenantId }, courseId)).modules[0]!.id
    textId = (await content.createLesson({ tenantId }, moduleId, { title: 'Read', kind: 'TEXT', body: 'Wheels and motors' })).id
    projectId = (await content.createLesson({ tenantId }, moduleId, { title: 'Build it', kind: 'PROJECT', body: 'Film your rover' })).id
    await content.setCourseStatus({ tenantId }, courseId, 'PUBLISHED')
    await assignCourse(staff, courseId, { classLevelId: student.classLevelId })

    await completeLesson(learner, courseId, textId)
    await expect(completeLesson(learner, courseId, projectId)).rejects.toThrow(/teacher approves/)
    await expect(submitProject(learner, courseId, projectId, {})).rejects.toThrow(/Describe what you built/)
    await expect(submitProject(learner, courseId, projectId, { linkUrl: 'http://drive/x' })).rejects.toThrow(/https/)
    await expect(submitProject(learner, courseId, textId, { note: 'Done' })).rejects.toThrow(/not found/i)

    const sent = await submitProject(learner, courseId, projectId, { note: 'It follows the line', linkUrl: 'https://youtu.be/rover' })
    expect(sent).toMatchObject({ status: 'SUBMITTED', version: 1 })
    expect((await reviewQueue(staff, 'SUBMITTED')).rows.some((r) => r.id === sent.id && r.courseId === courseId)).toBe(true)

    await expect(reviewProject(staff, sent.id, { decision: 'CHANGES_REQUESTED' })).rejects.toThrow(/what to change/)
    await reviewProject(staff, sent.id, { decision: 'CHANGES_REQUESTED', feedback: 'Show it turning' })
    expect(await mySubmission(learner, courseId, projectId)).toMatchObject({ status: 'CHANGES_REQUESTED', feedback: 'Show it turning' })
    expect((await courseForLearner(learner, courseId)).percent).toBe(50)

    const again = await submitProject(learner, courseId, projectId, { note: 'Now it turns', linkUrl: 'https://youtu.be/rover2' })
    expect(again).toMatchObject({ status: 'SUBMITTED', version: 2 })

    await reviewProject(staff, again.id, { decision: 'APPROVED', score: 90 })
    const outline = await courseForLearner(learner, courseId)
    expect(outline.percent).toBe(100)
    expect(outline.enrollment.completedAt).not.toBeNull()
    expect(outline.scores.get(projectId)).toBe(90)
    await expect(submitProject(learner, courseId, projectId, { note: 'One more' })).rejects.toThrow(/already approved/)
  })

  it('reopens the course if an approval is withdrawn', async () => {
    const row = await prisma.lmsProjectSubmission.findFirstOrThrow({ where: { lessonId: projectId, studentId: student.id } })
    await reviewProject(staff, row.id, { decision: 'CHANGES_REQUESTED', feedback: 'Add a photo of the wiring' })
    const outline = await courseForLearner(learner, courseId)
    expect(outline.percent).toBe(50)
    expect(outline.enrollment.completedAt).toBeNull()
  })

  it('needs the teach permission to review', async () => {
    const viewer = contextFor(tenantId, 'u_viewer', new Set(['lms.view']))
    await expect(reviewQueue(viewer, 'SUBMITTED')).rejects.toThrow(/lms.teach/)
  })
})
