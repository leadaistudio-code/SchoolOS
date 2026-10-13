import type { AppContext } from '@/server/context'
import type { TenantClient } from '@/server/db/tenant-client'
import { audit } from '@/server/audit'
import { prisma } from '@/server/db/prisma'
import { badRequest, notFound } from '@/server/api/response'
import { notifyTenant } from '@/server/notifications'
import { attendanceDate } from '@/lib/dates'
import { shiftIso, shortDayLabel, weekStartIso, weekdayOf } from '@/lib/ist-clock'
import {
  planAutoCover,
  rankSubstitutes,
  type CoverCandidate,
  type RankedCandidate,
} from '@/lib/substitutions'

export type AwayReason = 'LEAVE' | 'ABSENT' | 'MANUAL'

export type CoverLessonRow = {
  sectionId: string
  periodId: string
  periodName: string
  startTime: string
  endTime: string
  sortOrder: number
  className: string
  classLevelId: string
  subject: string | null
  subjectId: string | null
  classSubjectId: string | null
  substitution: {
    id: string
    status: 'OPEN' | 'ASSIGNED' | 'CANCELLED'
    substituteId: string | null
    substituteName: string | null
    note: string | null
  } | null
}

export type AwayTeacher = {
  id: string
  name: string
  reason: AwayReason
  detail: string | null
  lessons: CoverLessonRow[]
}

export type CoverBoard = {
  iso: string
  weekday: number
  teachers: AwayTeacher[]
  totals: { lessons: number; arranged: number; open: number; noCoverNeeded: number }
}

const name = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`.trim()

/** Teachers not in school on a date and why: approved leave, marked absent, or added by hand. */
export async function teachersAway(
  db: TenantClient,
  iso: string,
): Promise<Map<string, { reason: AwayReason; detail: string | null }>> {
  const onDate = attendanceDate(iso)
  const [leaves, absent, manual] = await Promise.all([
    db.leaveRequest.findMany({
      where: {
        applicantType: 'STAFF',
        status: 'APPROVED',
        staffId: { not: null },
        fromDate: { lte: onDate },
        toDate: { gte: onDate },
      },
      select: { staffId: true, leaveType: { select: { name: true } } },
    }),
    db.staffAttendance.findMany({
      where: { onDate, status: { in: ['ABSENT', 'LEAVE'] } },
      select: { staffId: true, status: true },
    }),
    db.substitution.findMany({
      where: { onDate, reason: 'MANUAL' },
      select: { absentTeacherId: true, note: true },
      distinct: ['absentTeacherId'],
    }),
  ])

  const away = new Map<string, { reason: AwayReason; detail: string | null }>()
  for (const m of manual) away.set(m.absentTeacherId, { reason: 'MANUAL', detail: m.note })
  for (const a of absent) {
    away.set(a.staffId, { reason: a.status === 'LEAVE' ? 'LEAVE' : 'ABSENT', detail: null })
  }
  for (const l of leaves) {
    away.set(l.staffId!, { reason: 'LEAVE', detail: l.leaveType?.name ?? null })
  }
  return away
}

/** Every lesson whose teacher is away on a date, with any cover already arranged. */
export async function coverBoard(db: TenantClient, iso: string): Promise<CoverBoard> {
  const onDate = attendanceDate(iso)
  const weekday = weekdayOf(iso)
  const away = await teachersAway(db, iso)

  const subs = await db.substitution.findMany({
    where: { onDate },
    select: {
      id: true,
      sectionId: true,
      periodId: true,
      absentTeacherId: true,
      status: true,
      note: true,
      substituteId: true,
      substitute: { select: { firstName: true, lastName: true } },
    },
  })
  for (const s of subs) {
    if (!away.has(s.absentTeacherId)) away.set(s.absentTeacherId, { reason: 'MANUAL', detail: null })
  }
  const awayIds = [...away.keys()]
  if (awayIds.length === 0) {
    return { iso, weekday, teachers: [], totals: { lessons: 0, arranged: 0, open: 0, noCoverNeeded: 0 } }
  }

  const [staff, slots] = await Promise.all([
    db.staff.findMany({
      where: { id: { in: awayIds } },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.timetableSlot.findMany({
      where: { dayOfWeek: weekday, teacherId: { in: awayIds } },
      select: {
        teacherId: true,
        sectionId: true,
        periodId: true,
        classSubjectId: true,
        section: { select: { name: true, classLevelId: true, classLevel: { select: { name: true } } } },
        period: { select: { name: true, startTime: true, endTime: true, sortOrder: true } },
        classSubject: { select: { subjectId: true, subject: { select: { name: true } } } },
      },
    }),
  ])

  const subBySlot = new Map(subs.map((s) => [`${s.sectionId}:${s.periodId}`, s]))
  const teachers: AwayTeacher[] = staff.map((t) => {
    const info = away.get(t.id)!
    const lessons = slots
      .filter((s) => s.teacherId === t.id)
      .map((s): CoverLessonRow => {
        const sub = subBySlot.get(`${s.sectionId}:${s.periodId}`)
        return {
          sectionId: s.sectionId,
          periodId: s.periodId,
          periodName: s.period.name,
          startTime: s.period.startTime,
          endTime: s.period.endTime,
          sortOrder: s.period.sortOrder,
          className: `${s.section.classLevel.name} ${s.section.name}`,
          classLevelId: s.section.classLevelId,
          subject: s.classSubject?.subject.name ?? null,
          subjectId: s.classSubject?.subjectId ?? null,
          classSubjectId: s.classSubjectId,
          substitution: sub
            ? {
                id: sub.id,
                status: sub.status,
                substituteId: sub.substituteId,
                substituteName: sub.substitute ? name(sub.substitute) : null,
                note: sub.note,
              }
            : null,
        }
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime))
    return { id: t.id, name: name(t), reason: info.reason, detail: info.detail, lessons }
  })
  teachers.sort((a, b) => b.lessons.length - a.lessons.length || a.name.localeCompare(b.name))

  const all = teachers.flatMap((t) => t.lessons)
  const arranged = all.filter((l) => l.substitution?.status === 'ASSIGNED').length
  const noCoverNeeded = all.filter((l) => l.substitution?.status === 'CANCELLED').length
  return {
    iso,
    weekday,
    teachers,
    totals: { lessons: all.length, arranged, noCoverNeeded, open: all.length - arranged - noCoverNeeded },
  }
}

/** Teachers who could cover on a date, with their load, for ranking. */
async function coverCandidates(db: TenantClient, iso: string, excludeIds: Set<string>): Promise<CoverCandidate[]> {
  const onDate = attendanceDate(iso)
  const weekday = weekdayOf(iso)
  const weekFrom = attendanceDate(weekStartIso(iso))

  const [staff, slots, classSubjects, subsToday, subsWeek] = await Promise.all([
    db.staff.findMany({
      where: { deletedAt: null, leftOn: null, staffType: 'TEACHING' },
      select: { id: true, firstName: true, lastName: true, timetableMaxPerDay: true },
    }),
    db.timetableSlot.findMany({
      where: { dayOfWeek: weekday, teacherId: { not: null } },
      select: { teacherId: true, periodId: true },
    }),
    db.classSubject.findMany({
      where: { teacherId: { not: null } },
      select: { teacherId: true, subjectId: true, classLevelId: true },
    }),
    db.substitution.findMany({
      where: { onDate, status: 'ASSIGNED', substituteId: { not: null } },
      select: { substituteId: true, periodId: true },
    }),
    db.substitution.groupBy({
      by: ['substituteId'],
      where: { onDate: { gte: weekFrom, lte: onDate }, status: 'ASSIGNED', substituteId: { not: null } },
      _count: { _all: true },
    }),
  ])

  const weekCount = new Map(subsWeek.map((g) => [g.substituteId!, g._count._all]))
  return staff
    .filter((s) => !excludeIds.has(s.id))
    .map((s) => {
      const own = slots.filter((x) => x.teacherId === s.id)
      const cover = subsToday.filter((x) => x.substituteId === s.id)
      const mine = classSubjects.filter((x) => x.teacherId === s.id)
      return {
        id: s.id,
        name: name(s),
        subjectIds: new Set(mine.map((m) => m.subjectId)),
        classLevelIds: new Set(mine.map((m) => m.classLevelId)),
        busyPeriodIds: new Set([...own.map((x) => x.periodId), ...cover.map((x) => x.periodId)]),
        lessonsToday: own.length,
        coverToday: cover.length,
        coverThisWeek: weekCount.get(s.id) ?? 0,
        maxPerDay: s.timetableMaxPerDay,
      }
    })
}

export type SuggestedBoard = CoverBoard & {
  suggestions: Record<string, RankedCandidate[]>
  freeTeachers: { id: string; name: string }[]
}

/** The board plus ranked substitutes for every lesson still needing cover. */
export async function coverBoardWithSuggestions(ctx: AppContext, iso: string): Promise<SuggestedBoard> {
  ctx.require('timetable.substitute')
  const board = await coverBoard(ctx.db, iso)
  const candidates = await coverCandidates(ctx.db, iso, new Set(board.teachers.map((t) => t.id)))
  const suggestions: Record<string, RankedCandidate[]> = {}
  for (const t of board.teachers) {
    for (const l of t.lessons) {
      if (l.substitution?.status === 'ASSIGNED' || l.substitution?.status === 'CANCELLED') continue
      suggestions[`${l.sectionId}:${l.periodId}`] = rankSubstitutes(
        { periodId: l.periodId, subjectId: l.subjectId, classLevelId: l.classLevelId },
        candidates,
      ).slice(0, 8)
    }
  }
  return {
    ...board,
    suggestions,
    freeTeachers: candidates.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
  }
}

async function lessonFor(db: TenantClient, iso: string, sectionId: string, periodId: string) {
  const slot = await db.timetableSlot.findFirst({
    where: { sectionId, periodId, dayOfWeek: weekdayOf(iso), teacherId: { not: null } },
    select: {
      teacherId: true,
      classSubjectId: true,
      section: { select: { name: true, classLevel: { select: { name: true } } } },
      period: { select: { name: true, startTime: true, endTime: true } },
      classSubject: { select: { subject: { select: { name: true } } } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  })
  if (!slot) throw notFound('Lesson on that day')
  return slot
}

const actor = (ctx: AppContext) => ({
  tenantId: ctx.tenant.id,
  actorId: ctx.user.userId,
  actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
})

/** Puts a teacher on the board for a date so their lessons can be covered. */
export async function markTeacherAway(ctx: AppContext, staffId: string, iso: string, note?: string) {
  ctx.require('timetable.substitute')
  const teacher = await ctx.db.staff.findFirst({
    where: { id: staffId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!teacher) throw notFound('Teacher')
  const slots = await ctx.db.timetableSlot.findMany({
    where: { teacherId: staffId, dayOfWeek: weekdayOf(iso) },
    select: { sectionId: true, periodId: true, classSubjectId: true },
  })
  if (slots.length === 0) {
    throw badRequest(`${name(teacher)} has no lessons on ${shortDayLabel(iso)}, so there is nothing to cover.`)
  }
  const onDate = attendanceDate(iso)
  const created = await ctx.db.substitution.createMany({
    data: slots.map((s) => ({
      tenantId: ctx.tenant.id,
      onDate,
      sectionId: s.sectionId,
      periodId: s.periodId,
      classSubjectId: s.classSubjectId,
      absentTeacherId: staffId,
      reason: 'MANUAL',
      note: note?.trim() || null,
    })),
    skipDuplicates: true,
  })
  await audit({
    ...actor(ctx),
    action: 'substitution.mark_away',
    module: 'timetable',
    entityType: 'Staff',
    entityId: staffId,
    summary: `Marked ${name(teacher)} away on ${iso} (${slots.length} lessons)`,
  })
  return { lessons: slots.length, created: created.count }
}

async function notifyCover(
  tenantId: string,
  substituteId: string,
  iso: string,
  lines: string[],
) {
  const staff = await prisma.staff.findFirst({ where: { id: substituteId, tenantId }, select: { userId: true } })
  if (!staff?.userId) return false
  await notifyTenant(tenantId, {
    userIds: [staff.userId],
    eventKey: 'timetable.cover_assigned',
    title: `Cover duty · ${shortDayLabel(iso)}`,
    body: `You are covering:\n${lines.join('\n')}`,
    linkUrl: `/academics/timetable/substitutions?date=${iso}`,
    channels: ['IN_APP', 'WHATSAPP'],
  })
  return true
}

function coverLine(slot: Awaited<ReturnType<typeof lessonFor>>) {
  const subject = slot.classSubject?.subject.name ?? 'Lesson'
  const absent = slot.teacher ? ` for ${name(slot.teacher)}` : ''
  return `• ${slot.period.name} (${slot.period.startTime}–${slot.period.endTime}) · ${slot.section.classLevel.name} ${slot.section.name} · ${subject}${absent}`
}

/**
 * Sets who covers one lesson. `substituteId` null puts the lesson back to
 * needing cover; `noCover` records that the class does not need anyone
 * (merged with another section, sent to the library, and so on).
 */
export async function assignSubstitute(
  ctx: AppContext,
  input: { iso: string; sectionId: string; periodId: string; substituteId: string | null; noCover?: boolean; note?: string },
) {
  ctx.require('timetable.substitute')
  const { iso, sectionId, periodId } = input
  const slot = await lessonFor(ctx.db, iso, sectionId, periodId)
  const onDate = attendanceDate(iso)

  if (input.substituteId) {
    if (input.substituteId === slot.teacherId) throw badRequest('Pick someone other than the absent teacher.')
    const sub = await ctx.db.staff.findFirst({
      where: { id: input.substituteId, deletedAt: null, leftOn: null },
      select: { id: true, firstName: true, lastName: true },
    })
    if (!sub) throw notFound('Substitute')
    const [ownLesson, otherCover] = await Promise.all([
      ctx.db.timetableSlot.findFirst({
        where: { teacherId: sub.id, periodId, dayOfWeek: weekdayOf(iso) },
        select: { section: { select: { name: true, classLevel: { select: { name: true } } } } },
      }),
      ctx.db.substitution.findFirst({
        where: { onDate, periodId, substituteId: sub.id, status: 'ASSIGNED', NOT: { sectionId } },
        select: { id: true },
      }),
    ])
    if (ownLesson) {
      throw badRequest(
        `${name(sub)} teaches ${ownLesson.section.classLevel.name} ${ownLesson.section.name} in ${slot.period.name}.`,
      )
    }
    if (otherCover) throw badRequest(`${name(sub)} is already covering another class in ${slot.period.name}.`)
  }

  const status = input.substituteId ? 'ASSIGNED' : input.noCover ? 'CANCELLED' : 'OPEN'
  const existing = await ctx.db.substitution.findFirst({
    where: { onDate, sectionId, periodId },
    select: { id: true, substituteId: true, reason: true },
  })
  const data = {
    substituteId: input.substituteId,
    status,
    note: input.note?.trim() || null,
    assignedById: ctx.user.userId,
    classSubjectId: slot.classSubjectId,
    absentTeacherId: slot.teacherId!,
  } as const
  const row = existing
    ? await ctx.db.substitution.update({ where: { id: existing.id }, data })
    : await ctx.db.substitution.create({
        data: { ...data, tenantId: ctx.tenant.id, onDate, sectionId, periodId, reason: 'ABSENT' },
      })

  if (input.substituteId && existing?.substituteId !== input.substituteId) {
    const sent = await notifyCover(ctx.tenant.id, input.substituteId, iso, [coverLine(slot)])
    if (sent) await ctx.db.substitution.update({ where: { id: row.id }, data: { notifiedAt: new Date() } })
  }

  await audit({
    ...actor(ctx),
    action: 'substitution.assign',
    module: 'timetable',
    entityType: 'Substitution',
    entityId: row.id,
    summary: `${slot.section.classLevel.name} ${slot.section.name}, ${slot.period.name} on ${iso}: ${status.toLowerCase()}`,
  })
  return row
}

/** Gives every lesson still needing cover to its best free teacher, then tells each one once. */
export async function autoAssignCover(ctx: AppContext, iso: string) {
  ctx.require('timetable.substitute')
  const board = await coverBoard(ctx.db, iso)
  const open = board.teachers.flatMap((t) =>
    t.lessons
      .filter((l) => !l.substitution || l.substitution.status === 'OPEN')
      .map((l) => ({ ...l, absentTeacherId: t.id, key: `${l.sectionId}:${l.periodId}` })),
  )
  if (open.length === 0) return { assigned: 0, unassigned: 0 }

  const candidates = await coverCandidates(ctx.db, iso, new Set(board.teachers.map((t) => t.id)))
  const plan = planAutoCover(open, candidates)
  const onDate = attendanceDate(iso)
  const bySub = new Map<string, string[]>()

  for (const lesson of open) {
    const substituteId = plan.get(lesson.key)
    if (!substituteId) continue
    const data = {
      substituteId,
      status: 'ASSIGNED' as const,
      assignedById: ctx.user.userId,
      classSubjectId: lesson.classSubjectId,
      absentTeacherId: lesson.absentTeacherId,
    }
    if (lesson.substitution) {
      await ctx.db.substitution.update({ where: { id: lesson.substitution.id }, data })
    } else {
      await ctx.db.substitution.create({
        data: { ...data, tenantId: ctx.tenant.id, onDate, sectionId: lesson.sectionId, periodId: lesson.periodId, reason: 'ABSENT' },
      })
    }
    const absent = board.teachers.find((t) => t.id === lesson.absentTeacherId)?.name
    const line = `• ${lesson.periodName} (${lesson.startTime}–${lesson.endTime}) · ${lesson.className} · ${lesson.subject ?? 'Lesson'}${absent ? ` for ${absent}` : ''}`
    bySub.set(substituteId, [...(bySub.get(substituteId) ?? []), line])
  }

  for (const [substituteId, lines] of bySub) {
    const sent = await notifyCover(ctx.tenant.id, substituteId, iso, lines)
    if (sent) {
      await ctx.db.substitution.updateMany({
        where: { onDate, substituteId, status: 'ASSIGNED', notifiedAt: null },
        data: { notifiedAt: new Date() },
      })
    }
  }

  await audit({
    ...actor(ctx),
    action: 'substitution.auto_assign',
    module: 'timetable',
    entityType: 'Substitution',
    summary: `Auto-assigned ${plan.size} of ${open.length} lessons on ${iso}`,
  })
  return { assigned: plan.size, unassigned: open.length - plan.size }
}

/** Removes a teacher added by hand, with any cover not yet arranged. */
export async function clearManualAway(ctx: AppContext, staffId: string, iso: string) {
  ctx.require('timetable.substitute')
  const removed = await ctx.db.substitution.deleteMany({
    where: { onDate: attendanceDate(iso), absentTeacherId: staffId, reason: 'MANUAL', status: { not: 'ASSIGNED' } },
  })
  return removed.count
}

/** A teacher's own cover duties from today onward. */
export async function myCoverDuties(ctx: AppContext, fromIso: string) {
  const staff = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return []
  return ctx.db.substitution.findMany({
    where: {
      substituteId: staff.id,
      status: 'ASSIGNED',
      onDate: { gte: attendanceDate(fromIso), lte: attendanceDate(shiftIso(fromIso, 14)) },
    },
    orderBy: [{ onDate: 'asc' }, { period: { sortOrder: 'asc' } }],
    select: {
      id: true,
      onDate: true,
      note: true,
      section: { select: { name: true, classLevel: { select: { name: true } } } },
      period: { select: { name: true, startTime: true, endTime: true } },
      classSubject: { select: { subject: { select: { name: true } } } },
      absentTeacher: { select: { firstName: true, lastName: true } },
    },
  })
}

/** Cover given and lessons missed per teacher over a range — keeps the load fair. */
export async function coverFairness(ctx: AppContext, fromIso: string, toIso: string) {
  ctx.require('timetable.substitute')
  const range = { gte: attendanceDate(fromIso), lte: attendanceDate(toIso) }
  const [given, missed, staff] = await Promise.all([
    ctx.db.substitution.groupBy({
      by: ['substituteId'],
      where: { onDate: range, status: 'ASSIGNED', substituteId: { not: null } },
      _count: { _all: true },
    }),
    ctx.db.substitution.groupBy({
      by: ['absentTeacherId'],
      where: { onDate: range, status: { not: 'CANCELLED' } },
      _count: { _all: true },
    }),
    ctx.db.staff.findMany({
      where: { deletedAt: null, leftOn: null, staffType: 'TEACHING' },
      select: { id: true, firstName: true, lastName: true },
    }),
  ])
  const givenBy = new Map(given.map((g) => [g.substituteId!, g._count._all]))
  const missedBy = new Map(missed.map((g) => [g.absentTeacherId, g._count._all]))
  return staff
    .map((s) => ({ id: s.id, name: name(s), covered: givenBy.get(s.id) ?? 0, missed: missedBy.get(s.id) ?? 0 }))
    .sort((a, b) => b.covered - a.covered || a.name.localeCompare(b.name))
}
