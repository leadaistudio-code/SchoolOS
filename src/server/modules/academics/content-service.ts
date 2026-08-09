import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { endOfMonth, startOfMonth } from 'date-fns'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, notFound } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'
import { accessibleStudentIds } from '@/server/scope'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')

/* --------------------------------------------------------------- classwork */

export const classworkCreateSchema = z.object({
  classSubjectId: z.string().min(1, 'Select a subject'),
  sectionId: z.string().optional(),
  onDate: isoDate,
  topic: z.string().trim().min(3, 'Describe what was covered').max(200),
  notes: z.string().trim().max(4000).optional(),
})

export const CLASSWORK_SORT_FIELDS = ['onDate', 'topic'] as const

export type ClassworkRow = {
  id: string
  onDate: Date
  topic: string
  notes: string | null
  subject: string
  className: string
  sectionName: string | null
  teacher: string
  attachmentCount: number
}

/**
 * The daily lesson log. Parents use it to see what was actually covered, which
 * is why it is visible to them for their own children's classes only.
 */
export async function listClasswork(
  ctx: AppContext,
  query: ListQuery,
  filter: { classLevelId?: string; sectionId?: string; subjectId?: string },
): Promise<{ rows: ClassworkRow[]; total: number }> {
  ctx.require('classwork.view')

  const ownStudentIds = await accessibleStudentIds(ctx)

  const where: Prisma.ClassworkWhereInput = {
    deletedAt: null,
    ...(ownStudentIds !== null
      ? {
          classLevel: {
            enrollments: { some: { studentId: { in: ownStudentIds }, isCurrent: true } },
          },
        }
      : {}),
    ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
    ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
    ...(filter.subjectId ? { classSubject: { subjectId: filter.subjectId } } : {}),
    ...(query.q
      ? {
          OR: [
            { topic: { contains: query.q, mode: 'insensitive' } },
            { notes: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const orderBy = orderByFrom(query.sort, query.dir, CLASSWORK_SORT_FIELDS, { onDate: 'desc' })

  const [rows, total] = await Promise.all([
    ctx.db.classwork.findMany({
      where,
      orderBy,
      ...skipTake(query),
      select: {
        id: true,
        onDate: true,
        topic: true,
        notes: true,
        classLevel: { select: { name: true } },
        section: { select: { name: true } },
        classSubject: { select: { subject: { select: { name: true } } } },
        teacher: { select: { firstName: true, lastName: true } },
        _count: { select: { attachments: true } },
      },
    }),
    ctx.db.classwork.count({ where }),
  ])

  return {
    total,
    rows: rows.map((c) => ({
      id: c.id,
      onDate: c.onDate,
      topic: c.topic,
      notes: c.notes,
      subject: c.classSubject.subject.name,
      className: c.classLevel.name,
      sectionName: c.section?.name ?? null,
      teacher: `${c.teacher.firstName} ${c.teacher.lastName}`,
      attachmentCount: c._count.attachments,
    })),
  }
}

export async function createClasswork(
  ctx: AppContext,
  input: z.infer<typeof classworkCreateSchema>,
) {
  ctx.require('classwork.create')

  const classSubject = await ctx.db.classSubject.findFirst({
    where: { id: input.classSubjectId },
    select: { id: true, classLevelId: true, teacherId: true },
  })
  if (!classSubject) throw notFound('Subject assignment')

  const me = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { id: true },
  })

  if (!ctx.can('academics.manage') && (!me || classSubject.teacherId !== me.id)) {
    throw new ApiException(403, 'FORBIDDEN', 'You can only log classwork for subjects you teach')
  }

  const teacherId = classSubject.teacherId ?? me?.id
  if (!teacherId) {
    throw new ApiException(409, 'CONFLICT', 'This subject has no teacher assigned yet')
  }

  const created = await ctx.db.classwork.create({
    data: {
      tenantId: ctx.tenant.id,
      classLevelId: classSubject.classLevelId,
      sectionId: input.sectionId || null,
      classSubjectId: input.classSubjectId,
      teacherId,
      onDate: attendanceDate(input.onDate),
      topic: input.topic,
      notes: input.notes,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'classwork.create',
    module: 'classwork',
    entityType: 'Classwork',
    entityId: created.id,
    summary: `Logged classwork "${created.topic}" for ${input.onDate}`,
    after: created,
  })
  return created
}

export async function deleteClasswork(ctx: AppContext, id: string) {
  ctx.require('classwork.delete')
  const before = await ctx.db.classwork.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Classwork')

  await ctx.db.classwork.update({ where: { id }, data: { deletedAt: new Date() } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'classwork.delete',
    module: 'classwork',
    entityType: 'Classwork',
    entityId: id,
    summary: `Deleted classwork "${before.topic}"`,
    before,
  })
  return { ok: true }
}

/* ---------------------------------------------------------------- calendar */

export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the event a title').max(200),
    description: z.string().trim().max(2000).optional(),
    kind: z
      .enum(['HOLIDAY', 'EXAM', 'PTM', 'EVENT', 'ACTIVITY', 'FUNCTION', 'OTHER'])
      .default('EVENT'),
    startsAt: z.string().min(1, 'Choose a start date'),
    endsAt: z.string().optional(),
    allDay: z.coerce.boolean().default(true),
    location: z.string().trim().max(120).optional(),
    color: z.string().trim().max(20).optional(),
  })
  .transform((v) => ({ ...v, endsAt: v.endsAt || v.startsAt }))
  .refine((v) => new Date(v.endsAt) >= new Date(v.startsAt), {
    path: ['endsAt'],
    message: 'The event cannot end before it starts',
  })

export type CalendarMonth = {
  month: string
  days: {
    date: string
    isToday: boolean
    isSunday: boolean
    inMonth: boolean
    events: {
      id: string
      title: string
      kind: string
      color: string | null
      allDay: boolean
      startsAt: Date
    }[]
  }[]
}

/**
 * A month grid, padded to whole weeks so the calendar renders as 6 rows of 7
 * without the UI having to compute the padding itself.
 */
export async function calendarMonth(
  ctx: AppContext,
  monthInput?: string,
): Promise<CalendarMonth> {
  ctx.require('calendar.view')

  const anchor = monthInput ? new Date(`${monthInput}-01T00:00:00Z`) : new Date()
  const from = startOfMonth(anchor)
  const to = endOfMonth(anchor)

  const events = await ctx.db.calendarEvent.findMany({
    where: {
      startsAt: { lte: to },
      endsAt: { gte: from },
    },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      title: true,
      kind: true,
      color: true,
      allDay: true,
      startsAt: true,
      endsAt: true,
    },
  })

  const byDay = new Map<string, typeof events>()
  for (const event of events) {
    // A multi-day event appears on each day it spans.
    const cursor = new Date(event.startsAt)
    const last = new Date(event.endsAt)
    while (cursor <= last) {
      const key = cursor.toISOString().slice(0, 10)
      byDay.set(key, [...(byDay.get(key) ?? []), event])
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  const gridStart = new Date(from)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())
  const todayKey = new Date().toISOString().slice(0, 10)

  const days: CalendarMonth['days'] = []
  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart)
    day.setDate(gridStart.getDate() + i)
    const key = day.toISOString().slice(0, 10)

    days.push({
      date: key,
      isToday: key === todayKey,
      isSunday: day.getDay() === 0,
      inMonth: day.getMonth() === from.getMonth(),
      events: (byDay.get(key) ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        kind: e.kind,
        color: e.color,
        allDay: e.allDay,
        startsAt: e.startsAt,
      })),
    })
  }

  return { month: from.toISOString().slice(0, 7), days }
}

export async function createCalendarEvent(
  ctx: AppContext,
  input: z.infer<typeof calendarEventSchema>,
) {
  ctx.require('calendar.manage')

  const created = await ctx.db.calendarEvent.create({
    data: {
      tenantId: ctx.tenant.id,
      title: input.title,
      description: input.description,
      kind: input.kind,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      allDay: input.allDay,
      location: input.location,
      color: input.color,
      createdById: ctx.user.userId,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'calendar.create',
    module: 'calendar',
    entityType: 'CalendarEvent',
    entityId: created.id,
    summary: `Added "${created.title}" to the school calendar`,
    after: created,
  })
  return created
}

export async function deleteCalendarEvent(ctx: AppContext, id: string) {
  ctx.require('calendar.manage')
  const before = await ctx.db.calendarEvent.findFirst({ where: { id } })
  if (!before) throw notFound('Event')

  await ctx.db.calendarEvent.delete({ where: { id } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'calendar.delete',
    module: 'calendar',
    entityType: 'CalendarEvent',
    entityId: id,
    summary: `Removed "${before.title}" from the calendar`,
    before,
  })
  return { ok: true }
}

export async function upcomingEvents(ctx: AppContext, limit = 8) {
  return ctx.db.calendarEvent.findMany({
    where: { endsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: limit,
    select: {
      id: true,
      title: true,
      kind: true,
      startsAt: true,
      endsAt: true,
      location: true,
    },
  })
}
