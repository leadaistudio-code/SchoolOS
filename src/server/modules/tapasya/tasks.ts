import type { TapasyaTask } from '@prisma/client'
import type { z } from 'zod'
import type { AppContext } from '@/server/context'
import { ApiException, badRequest, conflict, notFound } from '@/server/api/response'
import { tenantTx } from '@/server/db/tenant-client'
import { audit } from '@/server/audit'
import { notify } from '@/server/notifications'
import { reviewDay, suggestPlan, type PlannerTask } from '@/lib/tapasya/planner'
import { addDays, startOfLocalDay, weekStart } from '@/lib/tapasya/periods'
import { getGlobalSettings, limitsFor, requireTapasyaEnabled, scoringAt } from './config'
import { assertTeachable, currentStudent, dateOnly, isoDate, schoolToday, teachableStudentIds } from './people'
import { awardFrog, evaluateAchievements } from './xp'
import { refreshProjectionSafely } from './leaderboard'
import type { frogSchema, planQuerySchema, taskInputSchema, taskUpdateSchema, teacherTaskSchema } from './schema'

export type TaskDto = {
  id: string
  title: string
  description: string | null
  subject: string | null
  category: string
  difficulty: number
  importance: number
  urgency: number
  estimatedMinutes: number
  actualMinutes: number
  dueOn: string | null
  status: string
  isTeacherAssigned: boolean
  isMandatory: boolean
  studentCanEdit: boolean
  teacherInstructions: string | null
  requiredFocusMinutes: number | null
  requiredBreakMinutes: number | null
  homeworkId: string | null
  frogOn: string | null
  isPrimaryFrog: boolean
  notes: string | null
  reflection: string | null
  completedAt: string | null
}

export function taskDto(t: TapasyaTask): TaskDto {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    subject: t.subject,
    category: t.category,
    difficulty: t.difficulty,
    importance: t.importance,
    urgency: t.urgency,
    estimatedMinutes: t.estimatedMinutes,
    actualMinutes: t.actualMinutes,
    dueOn: isoDate(t.dueOn),
    status: t.status,
    isTeacherAssigned: t.isTeacherAssigned,
    isMandatory: t.isMandatory,
    studentCanEdit: t.studentCanEdit,
    teacherInstructions: t.teacherInstructions,
    requiredFocusMinutes: t.requiredFocusMinutes,
    requiredBreakMinutes: t.requiredBreakMinutes,
    homeworkId: t.homeworkId,
    frogOn: isoDate(t.frogOn),
    isPrimaryFrog: t.isPrimaryFrog,
    notes: t.notes,
    reflection: t.reflection,
    completedAt: t.completedAt?.toISOString() ?? null,
  }
}

function toPlanner(t: TapasyaTask, today: string): PlannerTask {
  return {
    id: t.id,
    title: t.title,
    importance: t.importance,
    urgency: t.urgency,
    difficulty: t.difficulty,
    estimatedMinutes: t.estimatedMinutes,
    dueOn: isoDate(t.dueOn),
    isTeacherAssigned: t.isTeacherAssigned,
    isMandatory: t.isMandatory,
    status: t.status,
    isPrimaryFrog: isoDate(t.frogOn) === today && t.isPrimaryFrog,
    actualMinutes: t.actualMinutes,
  }
}

export async function listTasks(ctx: AppContext, studentId: string, scope: 'open' | 'all' = 'open'): Promise<TaskDto[]> {
  const rows = await ctx.db.tapasyaTask.findMany({
    where: { studentId, deletedAt: null, ...(scope === 'open' ? { status: { in: ['TODO', 'IN_PROGRESS'] } } : {}) },
    orderBy: [{ dueOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 300,
  })
  return rows.map(taskDto)
}

export async function createOwnTask(ctx: AppContext, input: z.infer<typeof taskInputSchema>): Promise<TaskDto> {
  await requireTapasyaEnabled(ctx)
  const student = await currentStudent(ctx)
  const open = await ctx.db.tapasyaTask.count({ where: { studentId: student.id, deletedAt: null, status: { in: ['TODO', 'IN_PROGRESS'] } } })
  if (open >= 200) throw conflict('You have 200 open tasks. Finish or remove some first.')
  const row = await ctx.db.tapasyaTask.create({
    data: {
      tenantId: ctx.tenant.id,
      studentId: student.id,
      title: input.title,
      description: input.description ?? null,
      subject: input.subject ?? null,
      category: input.category === 'TEACHER_GOAL' ? 'PERSONAL' : input.category,
      difficulty: input.difficulty,
      importance: input.importance,
      urgency: input.urgency,
      estimatedMinutes: input.estimatedMinutes,
      dueOn: input.dueOn ? dateOnly(input.dueOn) : null,
      notes: input.notes ?? null,
      createdByUserId: ctx.user.userId,
    },
  })
  return taskDto(row)
}

async function ownTask(ctx: AppContext, id: string): Promise<{ task: TapasyaTask; studentId: string }> {
  const student = await currentStudent(ctx)
  const task = await ctx.db.tapasyaTask.findFirst({ where: { id, studentId: student.id, deletedAt: null } })
  if (!task) throw notFound('Task')
  return { task, studentId: student.id }
}

/**
 * A student edits their task. On a teacher task they may always update
 * progress, notes and reflection; content and due date only when the teacher
 * allowed it, and a mandatory task can never be cancelled or rescheduled.
 */
export async function updateOwnTask(ctx: AppContext, id: string, input: z.infer<typeof taskUpdateSchema>): Promise<TaskDto> {
  const { task } = await ownTask(ctx, id)
  const contentKeys = ['title', 'description', 'subject', 'category', 'difficulty', 'importance', 'urgency', 'estimatedMinutes', 'dueOn'] as const
  const touchesContent = contentKeys.some((k) => input[k] !== undefined)
  if (task.isTeacherAssigned && !task.studentCanEdit && touchesContent) {
    throw new ApiException(403, 'TEACHER_TASK_LOCKED', 'Your teacher set this task. You can update progress, notes and reflection.')
  }
  if (task.isMandatory && input.dueOn !== undefined && isoDate(task.dueOn) !== (input.dueOn ?? null)) {
    throw new ApiException(403, 'TEACHER_TASK_LOCKED', 'A required teacher task keeps its due date.')
  }
  if (task.isMandatory && input.status === 'CANCELLED') {
    throw new ApiException(403, 'TEACHER_TASK_LOCKED', 'A required teacher task cannot be cancelled.')
  }

  const completing = input.status === 'DONE' && task.status !== 'DONE'
  const reopening = input.status !== undefined && input.status !== 'DONE' && task.status === 'DONE'
  const settings = await getGlobalSettings()
  const touched: Date[] = []

  const updated = await tenantTx(ctx.tenant.id, async (tx) => {
    const row = await tx.tapasyaTask.update({
      where: { id: task.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.subject !== undefined ? { subject: input.subject ?? null } : {}),
        ...(input.category !== undefined && !task.isTeacherAssigned ? { category: input.category === 'TEACHER_GOAL' ? 'PERSONAL' : input.category } : {}),
        ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
        ...(input.importance !== undefined ? { importance: input.importance } : {}),
        ...(input.urgency !== undefined ? { urgency: input.urgency } : {}),
        ...(input.estimatedMinutes !== undefined ? { estimatedMinutes: input.estimatedMinutes } : {}),
        ...(input.dueOn !== undefined ? { dueOn: input.dueOn ? dateOnly(input.dueOn) : null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(input.reflection !== undefined ? { reflection: input.reflection ?? null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(completing ? { completedAt: new Date() } : {}),
        ...(reopening ? { completedAt: null } : {}),
      },
    })
    if (completing && row.completedAt) {
      const who = { tenantId: ctx.tenant.id, userId: ctx.user.userId, studentId: row.studentId }
      const scoring = await scoringAt(row.completedAt)
      const res = await awardFrog(tx, who, row, scoring, settings.timezone, ctx.tenant.timezone || settings.timezone)
      if (res?.created) {
        touched.push(row.completedAt)
        await evaluateAchievements(tx, who, scoring, settings.timezone)
      }
    }
    return row
  })
  if (touched.length) await refreshProjectionSafely(ctx.user.userId, touched)
  return taskDto(updated)
}

export async function deleteOwnTask(ctx: AppContext, id: string): Promise<void> {
  const { task } = await ownTask(ctx, id)
  if (task.isMandatory) throw new ApiException(403, 'TEACHER_TASK_LOCKED', 'A required teacher task cannot be removed.')
  if (task.isTeacherAssigned && !task.studentCanEdit) throw new ApiException(403, 'TEACHER_TASK_LOCKED', 'Your teacher set this task. Ask them to remove it.')
  await ctx.db.tapasyaTask.update({ where: { id: task.id }, data: { deletedAt: new Date(), isPrimaryFrog: false, frogOn: null } })
}

/** Sets today's frogs (up to five) and the one primary frog. */
export async function setFrogs(ctx: AppContext, input: z.infer<typeof frogSchema>): Promise<TaskDto[]> {
  await requireTapasyaEnabled(ctx)
  const student = await currentStudent(ctx)
  const today = schoolToday(ctx)
  const day = dateOnly(today)
  const ids = [...new Set(input.taskIds)]
  if (input.primaryTaskId && !ids.includes(input.primaryTaskId)) throw badRequest('The primary frog must be one of the selected frogs.')

  const tasks = ids.length
    ? await ctx.db.tapasyaTask.findMany({ where: { id: { in: ids }, studentId: student.id, deletedAt: null, status: { in: ['TODO', 'IN_PROGRESS'] } } })
    : []
  if (tasks.length !== ids.length) throw badRequest('Choose open tasks of your own.')

  const donePrimary = await ctx.db.tapasyaTask.findFirst({ where: { studentId: student.id, frogOn: day, isPrimaryFrog: true, status: 'DONE' } })
  if (donePrimary && input.primaryTaskId !== donePrimary.id) {
    throw conflict('You already finished today’s primary frog. Pick tomorrow’s after the day ends.')
  }

  await tenantTx(ctx.tenant.id, async (tx) => {
    await tx.tapasyaTask.updateMany({
      where: { studentId: student.id, frogOn: day, status: { not: 'DONE' } },
      data: { frogOn: null, isPrimaryFrog: false },
    })
    if (ids.length) {
      await tx.tapasyaTask.updateMany({ where: { id: { in: ids } }, data: { frogOn: day, isPrimaryFrog: false } })
    }
    if (input.primaryTaskId) {
      await tx.tapasyaTask.updateMany({ where: { id: input.primaryTaskId }, data: { isPrimaryFrog: true } })
    }
  })
  const rows = await ctx.db.tapasyaTask.findMany({ where: { studentId: student.id, frogOn: day, deletedAt: null }, orderBy: { isPrimaryFrog: 'desc' } })
  return rows.map(taskDto)
}

export async function todayView(ctx: AppContext, studentId: string) {
  const today = schoolToday(ctx)
  const rows = await ctx.db.tapasyaTask.findMany({
    where: { studentId, deletedAt: null, OR: [{ status: { in: ['TODO', 'IN_PROGRESS'] } }, { frogOn: dateOnly(today) }] },
    orderBy: [{ isPrimaryFrog: 'desc' }, { dueOn: { sort: 'asc', nulls: 'last' } }],
    take: 300,
  })
  const frogs = rows.filter((r) => isoDate(r.frogOn) === today)
  return {
    today,
    primaryFrog: frogs.find((f) => f.isPrimaryFrog) ? taskDto(frogs.find((f) => f.isPrimaryFrog)!) : null,
    frogs: frogs.map(taskDto),
    open: rows.filter((r) => r.status === 'TODO' || r.status === 'IN_PROGRESS').map(taskDto),
  }
}

export async function planDay(ctx: AppContext, studentId: string, q: z.infer<typeof planQuerySchema>) {
  const today = schoolToday(ctx)
  const rows = await ctx.db.tapasyaTask.findMany({ where: { studentId, deletedAt: null, status: { in: ['TODO', 'IN_PROGRESS'] } }, take: 300 })
  return suggestPlan({
    tasks: rows.map((r) => toPlanner(r, today)),
    today,
    availableMinutes: q.availableMinutes,
    focusMinutes: q.focusMinutes,
    breakMinutes: q.breakMinutes,
  })
}

/** End-of-day review over today's frogs and the tasks worked on today. */
export async function reviewToday(ctx: AppContext, studentId: string) {
  const today = schoolToday(ctx)
  const settings = await getGlobalSettings()
  const tz = ctx.tenant.timezone || settings.timezone
  const from = startOfLocalDay(today, tz)
  const to = startOfLocalDay(addDays(today, 1), tz)
  const intervals = await ctx.db.tapasyaFocusInterval.findMany({
    where: { session: { studentId }, endedAt: { gte: from, lt: to } },
    select: { focusMs: true, session: { select: { taskId: true } } },
  })
  const minutesByTask: Record<string, number> = {}
  for (const iv of intervals) {
    const id = iv.session.taskId
    if (id) minutesByTask[id] = (minutesByTask[id] ?? 0) + Math.round(iv.focusMs / 60_000)
  }
  const ids = Object.keys(minutesByTask)
  const rows = await ctx.db.tapasyaTask.findMany({
    where: { studentId, deletedAt: null, OR: [{ frogOn: dateOnly(today) }, { id: { in: ids } }, { completedAt: { gte: from, lt: to } }] },
  })
  return { today, ...reviewDay(rows.map((r) => toPlanner(r, today)), today, minutesByTask) }
}

// --- Teacher ----------------------------------------------------------------

async function staffIdFor(ctx: AppContext): Promise<string | null> {
  const staff = await ctx.db.staff.findFirst({ where: { userId: ctx.user.userId, deletedAt: null }, select: { id: true } })
  return staff?.id ?? null
}

/** A teacher assigns a task to students in their own classes. */
export async function assignTasks(ctx: AppContext, input: z.infer<typeof teacherTaskSchema>): Promise<{ created: number }> {
  await requireTapasyaEnabled(ctx)
  const ids = [...new Set(input.studentIds)]
  for (const id of ids) await assertTeachable(ctx, id)
  const found = await ctx.db.student.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, userId: true } })
  if (found.length !== ids.length) throw badRequest('Some students were not found.')

  const { limits } = await limitsFor(ctx)
  if (input.requiredFocusMinutes && (input.requiredFocusMinutes < limits.minFocusMinutes || input.requiredFocusMinutes > limits.maxFocusMinutes)) {
    throw badRequest(`Required focus must be between ${limits.minFocusMinutes} and ${limits.maxFocusMinutes} minutes under your school's policy.`)
  }
  if (input.requiredBreakMinutes && (input.requiredBreakMinutes < limits.minBreakMinutes || input.requiredBreakMinutes > limits.maxBreakMinutes)) {
    throw badRequest(`Required break must be between ${limits.minBreakMinutes} and ${limits.maxBreakMinutes} minutes.`)
  }
  if (input.homeworkId) {
    const hw = await ctx.db.homework.findFirst({ where: { id: input.homeworkId, deletedAt: null }, select: { id: true } })
    if (!hw) throw notFound('Homework')
  }
  const staffId = await staffIdFor(ctx)

  const res = await ctx.db.tapasyaTask.createMany({
    data: found.map((s) => ({
      tenantId: ctx.tenant.id,
      studentId: s.id,
      title: input.title,
      description: input.description ?? null,
      subject: input.subject ?? null,
      category: input.homeworkId ? 'HOMEWORK' as const : 'TEACHER_GOAL' as const,
      difficulty: input.difficulty,
      importance: input.importance,
      urgency: input.urgency,
      estimatedMinutes: input.estimatedMinutes,
      dueOn: input.dueOn ? dateOnly(input.dueOn) : null,
      createdByUserId: ctx.user.userId,
      assignedByStaffId: staffId,
      isTeacherAssigned: true,
      isMandatory: input.isMandatory,
      teacherInstructions: input.teacherInstructions ?? null,
      studentCanEdit: input.studentCanEdit,
      requiredFocusMinutes: input.requiredFocusMinutes ?? null,
      requiredBreakMinutes: input.requiredBreakMinutes ?? null,
      homeworkId: input.homeworkId ?? null,
    })),
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    action: 'tapasya.task.assign',
    module: 'tapasya',
    entityType: 'TapasyaTask',
    summary: `Assigned study task "${input.title}" to ${res.count} student(s)${input.isMandatory ? ' (required)' : ''}`,
  })

  const userIds = found.map((s) => s.userId).filter((u): u is string => Boolean(u))
  if (userIds.length) {
    await notify(ctx, {
      userIds,
      eventKey: 'tapasya.task.assigned',
      title: 'New study task',
      body: `${input.title}${input.dueOn ? ` — due ${input.dueOn}` : ''}`,
      linkUrl: '/tapasya',
    }).catch((err) => console.error('[tapasya] task notification failed', err))
  }
  return { created: res.count }
}

/** Teacher view: assigned-task status and focus time for students in scope. */
export async function classProgress(ctx: AppContext, sectionId: string | null) {
  const scoped = await teachableStudentIds(ctx)
  const enrollments = await ctx.db.enrollment.findMany({
    where: {
      isCurrent: true,
      ...(sectionId ? { sectionId } : {}),
      ...(scoped !== null ? { studentId: { in: scoped } } : {}),
      student: { deletedAt: null, status: 'ACTIVE' },
    },
    select: { studentId: true, rollNumber: true, student: { select: { firstName: true, lastName: true } }, section: { select: { id: true, name: true, classLevel: { select: { name: true } } } } },
    orderBy: [{ rollNumber: 'asc' }],
    take: 500,
  })
  const ids = enrollments.map((e) => e.studentId)
  const settings = await getGlobalSettings()
  const today = schoolToday(ctx)
  const tz = ctx.tenant.timezone || settings.timezone
  const from = startOfLocalDay(weekStart(today), tz)
  const to = startOfLocalDay(addDays(weekStart(today), 7), tz)

  const [tasks, intervals] = await Promise.all([
    ids.length ? ctx.db.tapasyaTask.findMany({ where: { studentId: { in: ids }, isTeacherAssigned: true, deletedAt: null }, select: { studentId: true, status: true, isMandatory: true, dueOn: true } }) : [],
    ids.length ? ctx.db.tapasyaFocusInterval.findMany({ where: { session: { studentId: { in: ids } }, endedAt: { gte: from, lt: to } }, select: { focusMs: true, outcome: true, session: { select: { studentId: true } } } }) : [],
  ])

  return enrollments.map((e) => {
    const mine = tasks.filter((t) => t.studentId === e.studentId)
    const ivs = intervals.filter((i) => i.session.studentId === e.studentId)
    const overdue = mine.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED' && t.dueOn && isoDate(t.dueOn)! < today).length
    return {
      studentId: e.studentId,
      name: `${e.student.firstName} ${e.student.lastName}`.trim(),
      rollNumber: e.rollNumber,
      section: `${e.section.classLevel.name} ${e.section.name}`.trim(),
      sectionId: e.section.id,
      assigned: mine.length,
      done: mine.filter((t) => t.status === 'DONE').length,
      overdue,
      focusMinutesThisWeek: Math.floor(ivs.reduce((a, i) => a + i.focusMs, 0) / 60_000),
      completedIntervalsThisWeek: ivs.filter((i) => i.outcome === 'COMPLETED').length,
    }
  })
}

/** Tasks a teacher assigned, grouped by title, for the teacher's own list. */
export async function teacherAssignedTasks(ctx: AppContext) {
  const scoped = await teachableStudentIds(ctx)
  const rows = await ctx.db.tapasyaTask.findMany({
    where: {
      isTeacherAssigned: true,
      deletedAt: null,
      ...(scoped !== null ? { studentId: { in: scoped } } : { createdByUserId: ctx.user.userId }),
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, title: true, dueOn: true, isMandatory: true, status: true, createdAt: true, student: { select: { firstName: true, lastName: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    dueOn: isoDate(r.dueOn),
    isMandatory: r.isMandatory,
    status: r.status,
    student: `${r.student.firstName} ${r.student.lastName}`.trim(),
    createdAt: r.createdAt.toISOString(),
  }))
}

/** A teacher withdraws a task they can see. The student's focus history stays. */
export async function withdrawTeacherTask(ctx: AppContext, id: string): Promise<void> {
  const task = await ctx.db.tapasyaTask.findFirst({ where: { id, isTeacherAssigned: true, deletedAt: null } })
  if (!task) throw notFound('Task')
  await assertTeachable(ctx, task.studentId)
  await ctx.db.tapasyaTask.update({ where: { id }, data: { status: 'CANCELLED', isPrimaryFrog: false } })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    action: 'tapasya.task.withdraw',
    module: 'tapasya',
    entityType: 'TapasyaTask',
    entityId: id,
    summary: `Withdrew study task "${task.title}"`,
  })
}
