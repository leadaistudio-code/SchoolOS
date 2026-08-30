import { differenceInCalendarDays } from 'date-fns'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate, attendancePercent, toDateInput } from '@/lib/dates'
import { assertMarkableSection, studentIdScopeWhere } from '@/server/scope'
import { notify } from '@/server/notifications'
import type {
  AttendanceReportQuery,
  AttendanceStatusValue,
  MarkAttendanceInput,
} from './schema'

/** How far back a teacher may mark without the elevated `attendance.edit` right. */
const BACKDATE_LIMIT_DAYS = 7

export type RegisterRow = {
  studentId: string
  admissionNo: string
  firstName: string
  lastName: string
  rollNumber: number | null
  status: AttendanceStatusValue | null
  minutesLate: number | null
  remarks: string | null
  onApprovedLeave: boolean
}

export type Register = {
  section: { id: string; name: string; className: string }
  onDate: string
  editable: boolean
  lockedReason: string | null
  markedAt: Date | null
  markedBy: string | null
  rows: RegisterRow[]
}

/**
 * Loads the register for one section on one date: every currently enrolled
 * student, whatever was already marked, and whether an approved leave request
 * covers the day (so a teacher is not left guessing why a child is missing).
 */
export async function getRegister(
  ctx: AppContext,
  sectionId: string,
  dateInput: string,
): Promise<Register> {
  ctx.require('attendance.view')

  const onDate = attendanceDate(dateInput)

  const section = await ctx.db.section.findFirst({
    where: { id: sectionId, deletedAt: null },
    select: {
      id: true,
      name: true,
      classLevel: { select: { name: true, sessionId: true } },
    },
  })
  if (!section) throw notFound('Section')
  await assertMarkableSection(ctx, sectionId)

  const [enrollments, existing, leaves] = await Promise.all([
    ctx.db.enrollment.findMany({
      where: { sectionId, isCurrent: true, student: { deletedAt: null } },
      orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
      select: {
        rollNumber: true,
        student: {
          select: { id: true, admissionNo: true, firstName: true, lastName: true },
        },
      },
    }),
    ctx.db.studentAttendance.findMany({
      where: { sectionId, onDate },
      select: {
        studentId: true,
        status: true,
        minutesLate: true,
        remarks: true,
        markedAt: true,
        markedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    ctx.db.leaveRequest.findMany({
      where: {
        applicantType: 'STUDENT',
        status: 'APPROVED',
        fromDate: { lte: onDate },
        toDate: { gte: onDate },
      },
      select: { studentId: true },
    }),
  ])

  const marked = new Map(existing.map((e) => [e.studentId, e]))
  const onLeave = new Set(leaves.map((l) => l.studentId))

  const { editable, reason } = canMark(ctx, onDate)
  const first = existing[0]

  return {
    section: { id: section.id, name: section.name, className: section.classLevel.name },
    onDate: toDateInput(onDate),
    editable,
    lockedReason: reason,
    markedAt: first?.markedAt ?? null,
    markedBy: first?.markedBy ? `${first.markedBy.firstName} ${first.markedBy.lastName}` : null,
    rows: enrollments.map((e) => {
      const m = marked.get(e.student.id)
      return {
        studentId: e.student.id,
        admissionNo: e.student.admissionNo,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        rollNumber: e.rollNumber,
        status: (m?.status as AttendanceStatusValue) ?? null,
        minutesLate: m?.minutesLate ?? null,
        remarks: m?.remarks ?? null,
        onApprovedLeave: onLeave.has(e.student.id),
      }
    }),
  }
}

function canMark(ctx: AppContext, onDate: Date): { editable: boolean; reason: string | null } {
  if (!ctx.can('attendance.mark')) {
    return { editable: false, reason: 'You do not have permission to mark attendance' }
  }

  const daysAgo = differenceInCalendarDays(attendanceDate(new Date()), onDate)

  if (daysAgo < 0) {
    return { editable: false, reason: 'Attendance cannot be marked for a future date' }
  }
  if (daysAgo > BACKDATE_LIMIT_DAYS && !ctx.can('attendance.edit')) {
    return {
      editable: false,
      reason: `This date is more than ${BACKDATE_LIMIT_DAYS} days old. Ask an administrator to correct it.`,
    }
  }
  return { editable: true, reason: null }
}

export type MarkResult = {
  saved: number
  created: number
  updated: number
  absentNotified: number
}

/**
 * Saves a whole section register in one transaction.
 *
 * Correctness points:
 *  - the section is verified to belong to this tenant before anything is written;
 *  - only students actually enrolled in that section can be marked, so a
 *    crafted payload cannot write attendance for someone else's class;
 *  - the write is an upsert keyed on (tenant, student, date), which makes a
 *    re-save idempotent rather than a duplicate-key crash;
 *  - the before/after of any changed row goes into the audit log, because
 *    attendance is a record parents dispute.
 */
export async function markAttendance(
  ctx: AppContext,
  input: MarkAttendanceInput,
): Promise<MarkResult> {
  ctx.require('attendance.mark')

  const onDate = attendanceDate(input.onDate)
  const { editable, reason } = canMark(ctx, onDate)
  if (!editable) throw new ApiException(403, 'ATTENDANCE_LOCKED', reason ?? 'Locked')

  const section = await ctx.db.section.findFirst({
    where: { id: input.sectionId, deletedAt: null },
    select: {
      id: true,
      name: true,
      classLevel: { select: { name: true, sessionId: true } },
    },
  })
  if (!section) throw notFound('Section')
  await assertMarkableSection(ctx, input.sectionId)

  const enrolled = await ctx.db.enrollment.findMany({
    where: { sectionId: input.sectionId, isCurrent: true, student: { deletedAt: null } },
    select: { studentId: true },
  })
  const enrolledIds = new Set(enrolled.map((e) => e.studentId))

  const stray = input.entries.filter((e) => !enrolledIds.has(e.studentId))
  if (stray.length > 0) {
    throw conflict(
      `${stray.length} submitted student${stray.length === 1 ? ' is' : 's are'} not enrolled in this section`,
    )
  }

  const marker = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId },
    select: { id: true },
  })

  const before = await ctx.db.studentAttendance.findMany({
    where: { sectionId: input.sectionId, onDate },
    select: { studentId: true, status: true },
  })
  const beforeMap = new Map(before.map((b) => [b.studentId, b.status]))

  await ctx.db.$transaction(
    input.entries.map((entry) =>
      ctx.db.studentAttendance.upsert({
        where: {
          tenantId_studentId_onDate: {
            tenantId: ctx.tenant.id,
            studentId: entry.studentId,
            onDate,
          },
        },
        create: {
          tenantId: ctx.tenant.id,
          studentId: entry.studentId,
          sectionId: input.sectionId,
          sessionId: section.classLevel.sessionId,
          onDate,
          status: entry.status,
          minutesLate: entry.status === 'LATE' ? (entry.minutesLate ?? null) : null,
          remarks: entry.remarks ?? null,
          markedById: marker?.id ?? null,
        },
        update: {
          status: entry.status,
          sectionId: input.sectionId,
          minutesLate: entry.status === 'LATE' ? (entry.minutesLate ?? null) : null,
          remarks: entry.remarks ?? null,
          markedById: marker?.id ?? null,
        },
      }),
    ),
  )

  const created = input.entries.filter((e) => !beforeMap.has(e.studentId)).length
  const changed = input.entries.filter(
    (e) => beforeMap.has(e.studentId) && beforeMap.get(e.studentId) !== e.status,
  )

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: created > 0 ? 'attendance.mark' : 'attendance.edit',
    module: 'attendance',
    entityType: 'Section',
    entityId: input.sectionId,
    summary: `${section.classLevel.name} ${section.name} attendance for ${input.onDate}: ${input.entries.length} marked, ${changed.length} changed`,
    before: changed.map((c) => ({ studentId: c.studentId, status: beforeMap.get(c.studentId) })),
    after: changed.map((c) => ({ studentId: c.studentId, status: c.status })),
  })

  // Only newly-absent students are notified, so re-saving a register does not
  // send a parent the same alert twice.
  const newlyAbsent = input.entries.filter(
    (e) => e.status === 'ABSENT' && beforeMap.get(e.studentId) !== 'ABSENT',
  )
  const absentNotified = await notifyAbsentees(ctx, newlyAbsent.map((e) => e.studentId), onDate)

  return {
    saved: input.entries.length,
    created,
    updated: changed.length,
    absentNotified,
  }
}

async function notifyAbsentees(
  ctx: AppContext,
  studentIds: string[],
  onDate: Date,
): Promise<number> {
  if (studentIds.length === 0) return 0

  const students = await ctx.db.student.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardians: { select: { parent: { select: { userId: true } } } },
    },
  })

  let sent = 0
  for (const student of students) {
    const recipients = student.guardians
      .map((g) => g.parent.userId)
      .filter((id): id is string => !!id)
    if (recipients.length === 0) continue

    await notify(ctx, {
      userIds: recipients,
      eventKey: 'attendance.absent',
      title: `${student.firstName} was marked absent`,
      body: `${student.firstName} ${student.lastName} was marked absent on ${toDateInput(onDate)}. Contact the school office if this is unexpected.`,
      linkUrl: '/attendance',
      data: { studentId: student.id, onDate: toDateInput(onDate) },
    })
    sent += recipients.length
  }
  return sent
}

/** Marks a whole day as a holiday for every enrolled student. */
export async function markHoliday(ctx: AppContext, dateInput: string, label: string) {
  ctx.require('attendance.edit')
  const onDate = attendanceDate(dateInput)

  const enrollments = await ctx.db.enrollment.findMany({
    where: { isCurrent: true, student: { deletedAt: null } },
    select: { studentId: true, sectionId: true, sessionId: true },
  })

  await ctx.db.studentAttendance.deleteMany({ where: { onDate } })
  await ctx.db.studentAttendance.createMany({
    data: enrollments.map((e) => ({
      tenantId: ctx.tenant.id,
      studentId: e.studentId,
      sectionId: e.sectionId,
      sessionId: e.sessionId,
      onDate,
      status: 'HOLIDAY' as const,
      remarks: label,
    })),
    skipDuplicates: true,
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'attendance.holiday',
    module: 'attendance',
    summary: `Marked ${dateInput} as a holiday (${label}) for ${enrollments.length} students`,
  })

  return { affected: enrollments.length }
}

export type AttendanceSummaryRow = {
  studentId: string
  admissionNo: string
  name: string
  className: string | null
  sectionName: string | null
  present: number
  absent: number
  late: number
  halfDay: number
  leave: number
  percent: number | null
}

/**
 * Per-student attendance summary over a date range, aggregated in the database.
 * Self-scoped roles are narrowed to their own children by the scope layer.
 */
export async function attendanceReport(
  ctx: AppContext,
  query: AttendanceReportQuery,
): Promise<{ rows: AttendanceSummaryRow[]; totals: Record<string, number> }> {
  ctx.require('attendance.view')

  const from = attendanceDate(query.from)
  const to = attendanceDate(query.to)
  if (to < from) throw new ApiException(400, 'BAD_REQUEST', 'The end date is before the start date')
  if (differenceInCalendarDays(to, from) > 400) {
    throw new ApiException(400, 'BAD_REQUEST', 'Choose a range of one year or less')
  }

  const scope = await studentIdScopeWhere(ctx)

  const grouped = await ctx.db.studentAttendance.groupBy({
    by: ['studentId', 'status'],
    where: {
      onDate: { gte: from, lte: to },
      ...scope,
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.classLevelId
        ? { student: { enrollments: { some: { classLevelId: query.classLevelId, isCurrent: true } } } }
        : {}),
    },
    _count: { _all: true },
  })

  const byStudent = new Map<string, Record<string, number>>()
  for (const row of grouped) {
    const bucket = byStudent.get(row.studentId) ?? {}
    bucket[row.status] = row._count._all
    byStudent.set(row.studentId, bucket)
  }

  if (byStudent.size === 0) return { rows: [], totals: {} }

  const students = await ctx.db.student.findMany({
    where: { id: { in: [...byStudent.keys()] } },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        select: {
          classLevel: { select: { name: true, numeric: true } },
          section: { select: { name: true } },
          rollNumber: true,
        },
      },
    },
  })

  const totals: Record<string, number> = {}
  const rows = students
    .map((s) => {
      const counts = byStudent.get(s.id) ?? {}
      for (const [k, v] of Object.entries(counts)) totals[k] = (totals[k] ?? 0) + v
      return {
        studentId: s.id,
        admissionNo: s.admissionNo,
        name: `${s.firstName} ${s.lastName}`,
        className: s.enrollments[0]?.classLevel.name ?? null,
        sectionName: s.enrollments[0]?.section.name ?? null,
        present: counts.PRESENT ?? 0,
        absent: counts.ABSENT ?? 0,
        late: counts.LATE ?? 0,
        halfDay: counts.HALF_DAY ?? 0,
        leave: counts.LEAVE ?? 0,
        percent: attendancePercent(counts),
      }
    })
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101))

  return { rows, totals }
}

/** Daily present-percentage series used by the dashboard and the reports page. */
export async function attendanceTrend(ctx: AppContext, from: Date, to: Date) {
  return ctx.db.$queryRaw<{ day: Date; present: bigint; total: bigint }[]>`
    SELECT "onDate" AS day,
           COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE','HALF_DAY')) AS present,
           COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE','HALF_DAY','ABSENT')) AS total
    FROM "StudentAttendance"
    WHERE "tenantId" = ${ctx.tenant.id} AND "onDate" BETWEEN ${from} AND ${to}
    GROUP BY "onDate"
    ORDER BY "onDate" ASC`
}

/** Sections that still have no attendance recorded for a date. */
export async function unmarkedSections(ctx: AppContext, dateInput: string) {
  const onDate = attendanceDate(dateInput)

  const sections = await ctx.db.section.findMany({
    where: { deletedAt: null, enrollments: { some: { isCurrent: true } } },
    select: {
      id: true,
      name: true,
      classLevel: { select: { name: true, numeric: true } },
      _count: { select: { enrollments: { where: { isCurrent: true } } } },
    },
  })

  const marked = await ctx.db.studentAttendance.groupBy({
    by: ['sectionId'],
    where: { onDate },
    _count: { _all: true },
  })
  const markedMap = new Map(marked.map((m) => [m.sectionId, m._count._all]))

  return sections
    .map((s) => ({
      id: s.id,
      label: `${s.classLevel.name} ${s.name}`,
      numeric: s.classLevel.numeric,
      enrolled: s._count.enrollments,
      marked: markedMap.get(s.id) ?? 0,
    }))
    .filter((s) => s.marked < s.enrolled)
    .sort((a, b) => a.numeric - b.numeric)
}
