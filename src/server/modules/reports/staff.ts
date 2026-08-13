import type { AppContext } from '@/server/context'
import { ratio, type ReportRange } from './range'

export type StaffReport = Awaited<ReturnType<typeof staffReport>>

type StaffAttendanceRow = {
  id: string
  firstName: string
  lastName: string
  employeeCode: string
  staffType: string
  designation: string | null
  department: string | null
  present: number
  absent: number
  late: number
  halfDay: number
  leave: number
}

/**
 * Staff attendance, leave and establishment.
 *
 * Attendance is counted against days that were actually marked, not against
 * the calendar. A school that has not marked a fortnight should see a smaller
 * denominator and a note, not a roll of people who look absent.
 */
export async function staffReport(ctx: AppContext, range: ReportRange) {
  ctx.require('reports.view')

  const db = ctx.db
  const tenantId = ctx.tenant.id

  const [headcount, byType, byDepartment, totals, markedDays, rows, leaveByType, pendingLeave, longestServing] =
    await Promise.all([
      db.staff.count({ where: { deletedAt: null, leftOn: null } }),
      db.staff.groupBy({
        by: ['staffType'],
        where: { deletedAt: null, leftOn: null },
        _count: { _all: true },
      }),
      db.staff.groupBy({
        by: ['department'],
        where: { deletedAt: null, leftOn: null },
        _count: { _all: true },
      }),
      db.staffAttendance.groupBy({
        by: ['status'],
        where: { onDate: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      }),
      db.staffAttendance
        .findMany({
          where: { onDate: { gte: range.from, lte: range.to } },
          distinct: ['onDate'],
          select: { onDate: true },
        })
        .then((days) => days.length),
      db.$queryRaw<StaffAttendanceRow[]>`
        SELECT st.id, st."firstName", st."lastName", st."employeeCode",
               st."staffType"::text AS "staffType", st.designation, st.department,
               (COUNT(*) FILTER (WHERE a.status = 'PRESENT'))::int AS present,
               (COUNT(*) FILTER (WHERE a.status = 'ABSENT'))::int AS absent,
               (COUNT(*) FILTER (WHERE a.status = 'LATE'))::int AS late,
               (COUNT(*) FILTER (WHERE a.status = 'HALF_DAY'))::int AS "halfDay",
               (COUNT(*) FILTER (WHERE a.status = 'LEAVE'))::int AS "leave"
        FROM "StaffAttendance" a
        JOIN "Staff" st ON st.id = a."staffId" AND st."deletedAt" IS NULL
        WHERE a."tenantId" = ${tenantId}
          AND a."onDate" >= ${range.from}
          AND a."onDate" <= ${range.to}
        GROUP BY st.id, st."firstName", st."lastName", st."employeeCode",
                 st."staffType", st.designation, st.department
        ORDER BY st."lastName" ASC, st."firstName" ASC`,
      db.$queryRaw<{
        name: string
        requests: number
        approved: number
        rejected: number
        days: number
      }[]>`
        SELECT COALESCE(lt.name, 'Unspecified') AS name,
               COUNT(*)::int AS requests,
               (COUNT(*) FILTER (WHERE lr.status = 'APPROVED'))::int AS approved,
               (COUNT(*) FILTER (WHERE lr.status = 'REJECTED'))::int AS rejected,
               COALESCE(SUM(
                 CASE WHEN lr.status = 'APPROVED'
                      THEN (lr."toDate"::date - lr."fromDate"::date) + 1
                      ELSE 0 END
               ), 0)::int AS days
        FROM "LeaveRequest" lr
        LEFT JOIN "LeaveType" lt ON lt.id = lr."leaveTypeId"
        WHERE lr."tenantId" = ${tenantId}
          AND lr."applicantType" = 'STAFF'
          AND lr."fromDate" <= ${range.to}
          AND lr."toDate" >= ${range.from}
        GROUP BY COALESCE(lt.name, 'Unspecified')
        ORDER BY requests DESC`,
      db.leaveRequest.count({ where: { applicantType: 'STAFF', status: 'PENDING' } }),
      db.staff.findMany({
        where: { deletedAt: null, leftOn: null, joinedOn: { not: null } },
        orderBy: { joinedOn: 'asc' },
        take: 8,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          designation: true,
          department: true,
          joinedOn: true,
        },
      }),
    ])

  const count = (status: string) =>
    totals.find((t) => t.status === status)?._count._all ?? 0

  const present = count('PRESENT')
  const late = count('LATE')
  const halfDay = count('HALF_DAY')
  const absent = count('ABSENT')
  const leave = count('LEAVE')
  const marked = present + late + halfDay + absent + leave

  const attendance = rows.map((r) => {
    const scored = r.present + r.late + r.halfDay + r.absent + r.leave
    return {
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      employeeCode: r.employeeCode,
      staffType: r.staffType,
      designation: r.designation,
      department: r.department,
      present: r.present,
      absent: r.absent,
      late: r.late,
      halfDay: r.halfDay,
      leave: r.leave,
      days: scored,
      percent: ratio(r.present + r.late + r.halfDay, scored),
    }
  })

  return {
    range,
    summary: {
      headcount,
      teaching: byType.find((t) => t.staffType === 'TEACHING')?._count._all ?? 0,
      nonTeaching: headcount - (byType.find((t) => t.staffType === 'TEACHING')?._count._all ?? 0),
      markedDays,
      marked,
      present,
      absent,
      late,
      leave,
      /** Present, late and half-days over everything marked in the range. */
      attendanceRate: ratio(present + late + halfDay, marked),
      pendingLeave,
      /** Staff with no attendance record at all in this range. */
      unmarkedStaff: Math.max(0, headcount - rows.length),
    },
    byType: byType
      .map((t) => ({ type: t.staffType, count: t._count._all }))
      .sort((a, b) => b.count - a.count),
    byDepartment: byDepartment
      .map((d) => ({ department: d.department || 'Not recorded', count: d._count._all }))
      .sort((a, b) => b.count - a.count),
    attendance,
    /** The people a head of school would want to talk to first. */
    lowestAttendance: [...attendance]
      .filter((a) => a.percent !== null && a.days >= 5)
      .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))
      .slice(0, 10),
    leaveByType,
    longestServing,
  }
}
