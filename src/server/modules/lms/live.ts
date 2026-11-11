import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { badRequest, forbidden, notFound } from '@/server/api/response'
import { istDateTime } from '@/lib/ist-clock'
import { isHttpsUrl, liveState, JOIN_EARLY_MINUTES } from '@/lib/lms/live'
import { assertLms, actorOf, auditLms } from './access'
import { requireLearner, type Learner } from './learning'
import { isAcademy } from './academy-tenant'

/**
 * Live, instructor-led classes. The school schedules classes for a batch and
 * pastes a Zoom / Google Meet link; students press Join from their portal,
 * which records that they joined and sends them to the meeting.
 */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined))
const optionalId = z.string().max(40).optional().or(z.literal('').transform(() => undefined))
const httpsLink = (message: string) =>
  optionalText(500).refine((v) => !v || isHttpsUrl(v), { message })

export const batchSchema = z.object({
  title: z.string().trim().min(2, 'Give the batch a name').max(140),
  description: optionalText(2000),
  courseId: optionalId,
  classLevelId: optionalId,
  sectionId: optionalId,
  instructorName: optionalText(120),
  meetingUrl: httpsLink('Paste the full https:// meeting link'),
})

export const liveClassSchema = z.object({
  title: z.string().trim().min(2, 'Give the class a title').max(140),
  agenda: optionalText(2000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  time: z.string().regex(/^\d{1,2}:\d{2}$/, 'Pick a start time'),
  durationMinutes: z.coerce.number().int().min(10, 'At least 10 minutes').max(480),
  meetingUrl: httpsLink('Paste the full https:// meeting link'),
  /** Extra weekly repeats after the first class. */
  repeatWeeks: z.coerce.number().int().min(0).max(26).default(0),
})

function require(ctx: AppContext, permission: string) {
  ctx.require(permission)
  return assertLms(ctx)
}

async function resolveAudience(ctx: AppContext, classLevelId?: string, sectionId?: string) {
  if (sectionId) {
    const section = await ctx.db.section.findFirst({ where: { id: sectionId, deletedAt: null }, select: { id: true, classLevelId: true } })
    if (!section) throw notFound('Section')
    return { classLevelId: section.classLevelId, sectionId: section.id }
  }
  if (classLevelId) {
    const cls = await ctx.db.classLevel.findFirst({ where: { id: classLevelId, deletedAt: null }, select: { id: true } })
    if (!cls) throw notFound('Class')
    return { classLevelId, sectionId: null }
  }
  return { classLevelId: null, sectionId: null }
}

async function checkCourse(ctx: AppContext, courseId?: string) {
  if (!courseId) return null
  const course = await ctx.db.lmsCourse.findFirst({
    where: { id: courseId, deletedAt: null, OR: [{ tenantId: null, status: 'PUBLISHED' }, { tenantId: ctx.tenant.id }] },
    select: { id: true },
  })
  if (!course) throw notFound('Course')
  return course.id
}

async function audienceLabels(ctx: AppContext, rows: { classLevelId: string | null; sectionId: string | null }[]) {
  const classIds = [...new Set(rows.map((r) => r.classLevelId).filter((x): x is string => !!x))]
  const sectionIds = [...new Set(rows.map((r) => r.sectionId).filter((x): x is string => !!x))]
  const [classes, sections] = await Promise.all([
    ctx.db.classLevel.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }),
    ctx.db.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } }),
  ])
  const c = new Map(classes.map((x) => [x.id, x.name]))
  const s = new Map(sections.map((x) => [x.id, x.name]))
  const everyone = isAcademy(ctx.tenant) ? 'All learners' : 'Whole school'
  return (r: { classLevelId: string | null; sectionId: string | null; courseId?: string | null }) =>
    isAcademy(ctx.tenant) && r.courseId ? 'Learners of the course' : !r.classLevelId ? everyone : r.sectionId ? `${c.get(r.classLevelId) ?? 'Class'} – ${s.get(r.sectionId) ?? ''}` : c.get(r.classLevelId) ?? 'Class'
}

/** Current students a batch reaches. */
function audienceWhere(b: { classLevelId: string | null; sectionId: string | null }) {
  return {
    isCurrent: true,
    student: { deletedAt: null, status: 'ACTIVE' as const },
    ...(b.sectionId ? { sectionId: b.sectionId } : b.classLevelId ? { classLevelId: b.classLevelId } : {}),
  }
}

/** Academy learners have no class: a batch reaches whoever bought its course, or every learner. */
function academyAudienceWhere(b: { courseId: string | null }) {
  return {
    deletedAt: null,
    status: 'ACTIVE' as const,
    userId: { not: null },
    ...(b.courseId ? { lmsEnrollments: { some: { courseId: b.courseId } } } : {}),
  }
}

async function audienceSizeOf(ctx: AppContext, b: { classLevelId: string | null; sectionId: string | null; courseId: string | null }) {
  return isAcademy(ctx.tenant)
    ? ctx.db.student.count({ where: academyAudienceWhere(b) })
    : ctx.db.enrollment.count({ where: audienceWhere(b) })
}

export async function listBatches(ctx: AppContext) {
  await require(ctx, 'lms.view')
  const batches = await ctx.db.lmsBatch.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { course: { select: { id: true, title: true } } },
  })
  const now = new Date()
  const [label, next, counts] = await Promise.all([
    audienceLabels(ctx, batches),
    ctx.db.lmsLiveClass.groupBy({
      by: ['batchId'],
      where: { batchId: { in: batches.map((b) => b.id) }, cancelledAt: null, startsAt: { gte: now } },
      _min: { startsAt: true },
      _count: { _all: true },
    }),
    ctx.db.lmsLiveClass.groupBy({ by: ['batchId'], where: { batchId: { in: batches.map((b) => b.id) } }, _count: { _all: true } }),
  ])
  const nextBy = new Map(next.map((n) => [n.batchId, n]))
  const total = new Map(counts.map((n) => [n.batchId, n._count._all]))
  return batches.map((b) => ({
    ...b,
    audience: label(b),
    nextClassAt: nextBy.get(b.id)?._min.startsAt ?? null,
    upcoming: nextBy.get(b.id)?._count._all ?? 0,
    classes: total.get(b.id) ?? 0,
  }))
}

/** Classes from the last few hours through the next fortnight, for the staff overview. */
export async function upcomingClasses(ctx: AppContext, days = 14) {
  await require(ctx, 'lms.view')
  const now = Date.now()
  const rows = await ctx.db.lmsLiveClass.findMany({
    where: {
      startsAt: { gte: new Date(now - 6 * 3600_000), lte: new Date(now + days * 86400_000) },
      batch: { archivedAt: null },
    },
    orderBy: { startsAt: 'asc' },
    include: { batch: { select: { id: true, title: true, meetingUrl: true, instructorName: true } }, _count: { select: { attendance: true } } },
    take: 50,
  })
  return rows
    .filter((r) => liveState(r) !== 'ended')
    .map((r) => ({ ...r, meetingUrl: r.meetingUrl ?? r.batch.meetingUrl, state: liveState(r) }))
}

export async function createBatch(ctx: AppContext, input: z.input<typeof batchSchema>) {
  await require(ctx, 'lms.teach')
  const data = batchSchema.parse(input)
  const [audience, courseId] = await Promise.all([resolveAudience(ctx, data.classLevelId, data.sectionId), checkCourse(ctx, data.courseId)])
  const actor = actorOf(ctx)
  const batch = await ctx.db.lmsBatch.create({
    data: {
      tenantId: ctx.tenant.id,
      title: data.title,
      description: data.description ?? null,
      courseId,
      ...audience,
      instructorName: data.instructorName ?? null,
      meetingUrl: data.meetingUrl ?? null,
      createdById: actor.id,
      createdByLabel: actor.label,
    },
  })
  await auditLms(ctx, 'lms.batch.create', 'LmsBatch', batch.id, `Created live batch ${batch.title}`)
  return batch
}

export async function updateBatch(ctx: AppContext, id: string, input: z.input<typeof batchSchema>) {
  await require(ctx, 'lms.teach')
  await getBatchRow(ctx, id)
  const data = batchSchema.parse(input)
  const [audience, courseId] = await Promise.all([resolveAudience(ctx, data.classLevelId, data.sectionId), checkCourse(ctx, data.courseId)])
  return ctx.db.lmsBatch.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description ?? null,
      courseId,
      ...audience,
      instructorName: data.instructorName ?? null,
      meetingUrl: data.meetingUrl ?? null,
    },
  })
}

export async function archiveBatch(ctx: AppContext, id: string) {
  await require(ctx, 'lms.teach')
  const batch = await getBatchRow(ctx, id)
  await ctx.db.lmsBatch.update({ where: { id }, data: { archivedAt: new Date() } })
  await auditLms(ctx, 'lms.batch.archive', 'LmsBatch', id, `Archived live batch ${batch.title}`)
  return batch
}

async function getBatchRow(ctx: AppContext, id: string) {
  const batch = await ctx.db.lmsBatch.findFirst({ where: { id, archivedAt: null } })
  if (!batch) throw notFound('Batch')
  return batch
}

export async function getBatch(ctx: AppContext, id: string) {
  await require(ctx, 'lms.view')
  const batch = await ctx.db.lmsBatch.findFirst({
    where: { id, archivedAt: null },
    include: { course: { select: { id: true, title: true } } },
  })
  if (!batch) throw notFound('Batch')
  const [label, classes, audienceSize] = await Promise.all([
    audienceLabels(ctx, [batch]),
    ctx.db.lmsLiveClass.findMany({
      where: { batchId: id },
      orderBy: { startsAt: 'asc' },
      include: { _count: { select: { attendance: true } } },
    }),
    audienceSizeOf(ctx, batch),
  ])
  return {
    batch: { ...batch, audience: label(batch) },
    audienceSize,
    classes: classes.map((c) => ({ ...c, effectiveUrl: c.meetingUrl ?? batch.meetingUrl, state: liveState(c) })),
  }
}

function startOf(date: string, time: string) {
  const at = istDateTime(date, time)
  if (!at) throw badRequest('Pick a valid date and time')
  return at
}

export async function scheduleClasses(ctx: AppContext, batchId: string, input: z.input<typeof liveClassSchema>) {
  await require(ctx, 'lms.teach')
  const batch = await getBatchRow(ctx, batchId)
  const data = liveClassSchema.parse(input)
  if (!data.meetingUrl && !batch.meetingUrl) throw badRequest('Add a meeting link, here or on the batch')
  const first = startOf(data.date, data.time)
  const rows = Array.from({ length: data.repeatWeeks + 1 }, (_, week) => ({
    tenantId: ctx.tenant.id,
    batchId,
    title: data.repeatWeeks ? `${data.title} · ${week + 1}` : data.title,
    agenda: data.agenda ?? null,
    startsAt: new Date(first.getTime() + week * 7 * 86400_000),
    durationMinutes: data.durationMinutes,
    meetingUrl: data.meetingUrl ?? null,
  }))
  await ctx.db.lmsLiveClass.createMany({ data: rows })
  await auditLms(ctx, 'lms.live.schedule', 'LmsBatch', batchId, `Scheduled ${rows.length} live class(es) for ${batch.title}`)
  return rows.length
}

async function getClassRow(ctx: AppContext, id: string) {
  const row = await ctx.db.lmsLiveClass.findFirst({ where: { id }, include: { batch: true } })
  if (!row) throw notFound('Live class')
  return row
}

export async function updateLiveClass(ctx: AppContext, id: string, input: z.input<typeof liveClassSchema>) {
  await require(ctx, 'lms.teach')
  const row = await getClassRow(ctx, id)
  const data = liveClassSchema.parse({ ...(input as object), repeatWeeks: 0 })
  if (!data.meetingUrl && !row.batch.meetingUrl) throw badRequest('Add a meeting link, here or on the batch')
  return ctx.db.lmsLiveClass.update({
    where: { id },
    data: {
      title: data.title,
      agenda: data.agenda ?? null,
      startsAt: startOf(data.date, data.time),
      durationMinutes: data.durationMinutes,
      meetingUrl: data.meetingUrl ?? null,
    },
  })
}

export async function setRecording(ctx: AppContext, id: string, url: string) {
  await require(ctx, 'lms.teach')
  await getClassRow(ctx, id)
  const value = url.trim()
  if (value && !isHttpsUrl(value)) throw badRequest('Paste the full https:// link to the recording')
  return ctx.db.lmsLiveClass.update({ where: { id }, data: { recordingUrl: value || null } })
}

export async function setCancelled(ctx: AppContext, id: string, cancelled: boolean) {
  await require(ctx, 'lms.teach')
  const row = await getClassRow(ctx, id)
  await ctx.db.lmsLiveClass.update({ where: { id }, data: { cancelledAt: cancelled ? new Date() : null } })
  await auditLms(ctx, cancelled ? 'lms.live.cancel' : 'lms.live.restore', 'LmsLiveClass', id, `${cancelled ? 'Cancelled' : 'Restored'} ${row.title}`)
  return row
}

export async function deleteLiveClass(ctx: AppContext, id: string) {
  await require(ctx, 'lms.teach')
  const row = await getClassRow(ctx, id)
  await ctx.db.lmsLiveClass.delete({ where: { id } })
  return row
}

/** Who the class was for, and who pressed Join. */
export async function liveClassAttendance(ctx: AppContext, id: string) {
  await require(ctx, 'lms.view')
  const row = await getClassRow(ctx, id)
  const [audience, joined] = await Promise.all([
    isAcademy(ctx.tenant)
      ? ctx.db.student
          .findMany({
            where: academyAudienceWhere(row.batch),
            select: { id: true, firstName: true, lastName: true, admissionNo: true },
          })
          .then((list) =>
            list.map((s) => ({
              studentId: s.id,
              student: s,
              classLevel: { name: 'Academy', numeric: 0 },
              section: null as { name: string } | null,
            })),
          )
      : ctx.db.enrollment.findMany({
          where: audienceWhere(row.batch),
          select: {
            studentId: true,
            student: { select: { firstName: true, lastName: true, admissionNo: true } },
            classLevel: { select: { name: true, numeric: true } },
            section: { select: { name: true } },
          },
        }),
    ctx.db.lmsLiveAttendance.findMany({ where: { liveClassId: id } }),
  ])
  const byStudent = new Map(joined.map((j) => [j.studentId, j]))
  const rows = audience
    .map((a) => ({
      studentId: a.studentId,
      name: `${a.student.firstName} ${a.student.lastName}`.trim(),
      admissionNo: a.student.admissionNo,
      className: a.classLevel.name,
      sectionName: a.section?.name ?? '',
      order: a.classLevel.numeric,
      joinedAt: byStudent.get(a.studentId)?.firstJoinedAt ?? null,
      joins: byStudent.get(a.studentId)?.joins ?? 0,
    }))
    .sort((a, b) => Number(!!b.joinedAt) - Number(!!a.joinedAt) || a.order - b.order || a.name.localeCompare(b.name))
  return {
    liveClass: { ...row, effectiveUrl: row.meetingUrl ?? row.batch.meetingUrl, state: liveState(row) },
    rows,
    joinedCount: joined.length,
  }
}

/* ------------------------------------------------------------ students */

export async function learnerBatchWhere(ctx: AppContext, learner: Learner) {
  if (isAcademy(ctx.tenant)) {
    const owned = await ctx.db.lmsEnrollment.findMany({ where: { studentId: learner.id }, select: { courseId: true } })
    return {
      archivedAt: null,
      OR: [{ courseId: null }, { courseId: { in: owned.map((o) => o.courseId) } }],
    }
  }
  const p = learner.placement
  return {
    archivedAt: null,
    OR: [
      { classLevelId: null },
      ...(p ? [{ classLevelId: p.classLevelId, sectionId: null }, ...(p.sectionId ? [{ sectionId: p.sectionId }] : [])] : []),
    ],
  }
}

export async function myLiveClasses(ctx: AppContext) {
  const learner = await requireLearner(ctx)
  const batches = await ctx.db.lmsBatch.findMany({
    where: await learnerBatchWhere(ctx, learner),
    select: { id: true, title: true, meetingUrl: true, instructorName: true, course: { select: { id: true, title: true } } },
  })
  const classes = await ctx.db.lmsLiveClass.findMany({
    where: { batchId: { in: batches.map((b) => b.id) }, startsAt: { gte: new Date(Date.now() - 120 * 86400_000) } },
    orderBy: { startsAt: 'asc' },
  })
  const joined = await ctx.db.lmsLiveAttendance.findMany({
    where: { studentId: learner.id, liveClassId: { in: classes.map((c) => c.id) } },
    select: { liveClassId: true },
  })
  const joinedIds = new Set(joined.map((j) => j.liveClassId))
  const batchById = new Map(batches.map((b) => [b.id, b]))
  const list = classes.map((c) => ({
    id: c.id,
    title: c.title,
    agenda: c.agenda,
    startsAt: c.startsAt,
    durationMinutes: c.durationMinutes,
    recordingUrl: c.recordingUrl,
    meetingUrl: c.meetingUrl ?? batchById.get(c.batchId)?.meetingUrl ?? null,
    batch: batchById.get(c.batchId)!,
    state: liveState(c),
    joined: joinedIds.has(c.id),
  }))
  return {
    learner,
    upcoming: list.filter((c) => c.state === 'open' || c.state === 'upcoming'),
    past: list.filter((c) => c.state === 'ended' || c.state === 'cancelled').reverse(),
  }
}

async function learnerClass(ctx: AppContext, learner: Learner, id: string) {
  const row = await ctx.db.lmsLiveClass.findFirst({
    where: { id, batch: await learnerBatchWhere(ctx, learner) },
    include: { batch: { select: { title: true, meetingUrl: true, instructorName: true, course: { select: { id: true, title: true } } } } },
  })
  if (!row) throw notFound('Live class')
  return row
}

/** Records the join and returns where to send the student. */
export async function joinLiveClass(ctx: AppContext, id: string) {
  const learner = await requireLearner(ctx)
  const row = await learnerClass(ctx, learner, id)
  const state = liveState(row)
  if (state === 'cancelled') throw badRequest('This class was cancelled')
  if (state === 'upcoming') throw badRequest(`You can join ${JOIN_EARLY_MINUTES} minutes before the class starts`)
  if (state === 'ended') throw badRequest('This class has ended. Check for a recording.')
  const url = row.meetingUrl ?? row.batch.meetingUrl
  if (!url || !isHttpsUrl(url)) throw forbidden('The meeting link is not ready yet. Ask your teacher.')
  const now = new Date()
  await ctx.db.lmsLiveAttendance.upsert({
    where: { liveClassId_studentId: { liveClassId: id, studentId: learner.id } },
    create: { tenantId: ctx.tenant.id, liveClassId: id, studentId: learner.id },
    update: { lastJoinedAt: now, joins: { increment: 1 } },
  })
  return url
}

export async function liveClassForLearner(ctx: AppContext, id: string) {
  const learner = await requireLearner(ctx)
  const row = await learnerClass(ctx, learner, id)
  return { ...row, state: liveState(row), meetingUrl: row.meetingUrl ?? row.batch.meetingUrl }
}
