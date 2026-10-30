import { subDays } from 'date-fns'
import type { AppContext } from '@/server/context'
import { attendanceDate } from '@/lib/dates'

/**
 * The evidence behind each Staff 360 figure.
 *
 * Every reader uses the same window and counting rule as the figure it explains:
 * the 360° tiles look back `RECENT_DAYS`, the health score looks at the current
 * session, and each drill-down says which one it is showing.
 */

export const STAFF_INSIGHTS = [
  'score',
  'attendance',
  'punctuality',
  'load',
  'classwork',
  'homework',
  'marks',
  'syllabus',
  'appraisal',
  'feedback',
] as const
export type StaffInsight = (typeof STAFF_INSIGHTS)[number]

/** Score metric key → drill-down tab. */
export const STAFF_SCORE_METRIC_TAB: Record<string, StaffInsight> = {
  STAFF_ATTENDANCE: 'attendance',
  STAFF_PUNCTUALITY: 'punctuality',
  STAFF_APPRAISAL: 'appraisal',
  STAFF_REVIEW: 'homework',
}

/** Matches the default look-back of `staffPerformance`. */
export const RECENT_DAYS = 89

export type StaffWindow = { kind: 'recent' | 'session'; label: string; from: Date; to: Date }

export async function staffWindow(ctx: AppContext, kind: 'recent' | 'session'): Promise<StaffWindow> {
  const today = attendanceDate(new Date())
  if (kind === 'session') {
    const session = await ctx.db.academicSession.findFirst({
      where: { isCurrent: true },
      select: { name: true, startsOn: true, endsOn: true },
    })
    if (session) {
      return {
        kind,
        label: `this session (${session.name})`,
        from: session.startsOn,
        to: today > session.endsOn ? session.endsOn : today,
      }
    }
  }
  return {
    kind: 'recent',
    label: `the last ${RECENT_DAYS} days`,
    from: attendanceDate(subDays(new Date(), RECENT_DAYS)),
    to: today,
  }
}

export async function staffAttendanceDays(ctx: AppContext, staffId: string, w: StaffWindow) {
  ctx.require('staff.view')
  const [rows, registerDays] = await Promise.all([
    ctx.db.staffAttendance.findMany({
      where: { staffId, onDate: { gte: w.from, lte: w.to } },
      orderBy: { onDate: 'desc' },
      select: {
        id: true,
        onDate: true,
        status: true,
        checkInAt: true,
        checkOutAt: true,
        source: true,
        insideGeofence: true,
        remarks: true,
        overrideReason: true,
      },
    }),
    ctx.db.staffAttendance.findMany({
      where: { onDate: { gte: w.from, lte: w.to } },
      distinct: ['onDate'],
      select: { onDate: true },
    }),
  ])
  const own = new Set(rows.map((r) => r.onDate.toISOString().slice(0, 10)))
  const missing = registerDays
    .map((d) => d.onDate)
    .filter((d) => !own.has(d.toISOString().slice(0, 10)))
    .sort((a, b) => b.getTime() - a.getTime())
  return { rows, missing }
}

export async function staffTimetable(ctx: AppContext, staffId: string) {
  ctx.require('staff.view')
  return ctx.db.timetableSlot.findMany({
    where: { teacherId: staffId },
    orderBy: [{ dayOfWeek: 'asc' }, { period: { sortOrder: 'asc' } }],
    select: {
      id: true,
      dayOfWeek: true,
      roomName: true,
      period: { select: { name: true, startTime: true, endTime: true } },
      classLevel: { select: { name: true } },
      section: { select: { name: true } },
      classSubject: { select: { subject: { select: { name: true } } } },
    },
  })
}

export async function staffClasswork(ctx: AppContext, staffId: string, w: StaffWindow) {
  ctx.require('staff.view')
  return ctx.db.classwork.findMany({
    where: { teacherId: staffId, onDate: { gte: w.from, lte: w.to }, deletedAt: null },
    orderBy: { onDate: 'desc' },
    take: 500,
    select: {
      id: true,
      onDate: true,
      topic: true,
      notes: true,
      classLevel: { select: { name: true } },
      section: { select: { name: true } },
      classSubject: { select: { subject: { select: { name: true } } } },
    },
  })
}

export async function staffHomework(ctx: AppContext, staffId: string, w: StaffWindow) {
  ctx.require('staff.view')
  const rows = await ctx.db.homework.findMany({
    where: { teacherId: staffId, assignedOn: { gte: w.from, lte: w.to }, deletedAt: null },
    orderBy: { assignedOn: 'desc' },
    take: 500,
    select: {
      id: true,
      title: true,
      assignedOn: true,
      dueOn: true,
      classLevel: { select: { name: true } },
      section: { select: { name: true } },
      classSubject: { select: { subject: { select: { name: true } } } },
      submissions: { select: { status: true } },
    },
  })
  return rows.map(({ submissions, ...h }) => {
    const handedIn = submissions.filter((s) => s.status !== 'PENDING').length
    const marked = submissions.filter((s) => s.status === 'REVIEWED').length
    return { ...h, students: submissions.length, handedIn, marked }
  })
}

/** Marks keyed in by this person's login, one row per exam paper. */
export async function staffMarksEntered(ctx: AppContext, staffId: string) {
  ctx.require('staff.view')
  const staff = await ctx.db.staff.findFirst({ where: { id: staffId }, select: { userId: true } })
  if (!staff?.userId) return { hasLogin: false as const, papers: [] }

  const grouped = await ctx.db.mark.groupBy({
    by: ['examSubjectId'],
    where: { enteredById: staff.userId },
    _count: { _all: true },
    _max: { updatedAt: true },
  })
  const papers = await ctx.db.examSubject.findMany({
    where: { id: { in: grouped.map((g) => g.examSubjectId) } },
    select: {
      id: true,
      marksStatus: true,
      exam: { select: { id: true, name: true, startsOn: true } },
      classSubject: {
        select: { subject: { select: { name: true } }, classLevel: { select: { name: true } } },
      },
    },
  })
  const byId = new Map(papers.map((p) => [p.id, p]))
  return {
    hasLogin: true as const,
    papers: grouped
      .flatMap((g) => {
        const p = byId.get(g.examSubjectId)
        return p ? [{ ...p, count: g._count._all, lastAt: g._max.updatedAt }] : []
      })
      .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0)),
  }
}
