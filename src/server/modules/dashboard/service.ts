import { subDays, startOfMonth } from 'date-fns'
import { attendanceDate } from '@/lib/dates'
import type { AppContext } from '@/server/context'

export type AdminDashboard = Awaited<ReturnType<typeof getAdminDashboard>>

/**
 * Every figure on the admin dashboard, computed in the database with counts and
 * aggregates. Nothing is fetched into the app to be counted in JavaScript, so
 * the page cost does not grow with the size of the school.
 */
export async function getAdminDashboard(ctx: AppContext) {
  const db = ctx.db
  // `onDate` and `dueOn` are calendar-date columns, so the comparison point
  // must be normalised the same way they are written.
  const today = attendanceDate(new Date())
  const monthStart = startOfMonth(new Date())
  const weekAgo = attendanceDate(subDays(new Date(), 6))

  const [
    studentCount,
    teacherCount,
    staffCount,
    attendanceToday,
    collectedToday,
    collectedMonth,
    outstanding,
    overdueInvoices,
    pendingLeave,
    upcomingExams,
    upcomingEvents,
    recentPayments,
    recentNotices,
    recentActivity,
    libraryIssued,
    libraryOverdue,
  ] = await Promise.all([
    db.student.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    db.staff.count({ where: { staffType: 'TEACHING', deletedAt: null } }),
    db.staff.count({ where: { deletedAt: null } }),
    db.studentAttendance.groupBy({
      by: ['status'],
      where: { onDate: today },
      _count: { _all: true },
    }),
    db.feePayment.aggregate({
      where: { status: 'SUCCESS', paidAt: { gte: today } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
    db.feePayment.aggregate({
      where: { status: 'SUCCESS', paidAt: { gte: monthStart } },
      _sum: { amountMinor: true },
    }),
    db.feeInvoice.aggregate({
      where: { status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] } },
      _sum: { balanceMinor: true },
    }),
    db.feeInvoice.count({
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
        dueOn: { lt: today },
      },
    }),
    db.leaveRequest.count({ where: { status: 'PENDING' } }),
    db.exam.findMany({
      where: { status: { in: ['SCHEDULED', 'ONGOING'] }, startsOn: { gte: today } },
      orderBy: { startsOn: 'asc' },
      take: 5,
      select: { id: true, name: true, kind: true, startsOn: true },
    }),
    db.calendarEvent.findMany({
      where: { startsAt: { gte: today } },
      orderBy: { startsAt: 'asc' },
      take: 5,
      select: { id: true, title: true, kind: true, startsAt: true },
    }),
    db.feePayment.findMany({
      where: { status: 'SUCCESS' },
      orderBy: { paidAt: 'desc' },
      take: 6,
      select: {
        id: true,
        amountMinor: true,
        mode: true,
        paidAt: true,
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
      },
    }),
    db.notice.findMany({
      where: { isPublished: true, deletedAt: null },
      orderBy: { publishOn: 'desc' },
      take: 5,
      select: { id: true, title: true, priority: true, publishOn: true },
    }),
    db.$queryRaw<{ id: string; action: string; summary: string | null; createdAt: Date; actorLabel: string | null }[]>`
      SELECT id, action, summary, "createdAt", "actorLabel"
      FROM "AuditLog"
      WHERE "tenantId" = ${ctx.tenant.id}
      ORDER BY "createdAt" DESC
      LIMIT 8`,
    db.libraryLoan.count({ where: { status: 'ISSUED' } }),
    db.libraryLoan.count({ where: { status: { in: ['ISSUED', 'OVERDUE'] }, dueOn: { lt: today } } }),
  ])

  const attendanceMap = Object.fromEntries(
    attendanceToday.map((row) => [row.status, row._count._all]),
  ) as Record<string, number | undefined>

  const present = attendanceMap.PRESENT ?? 0
  const absent = attendanceMap.ABSENT ?? 0
  const late = attendanceMap.LATE ?? 0
  const marked = present + absent + late + (attendanceMap.HALF_DAY ?? 0) + (attendanceMap.LEAVE ?? 0)

  const attendanceTrend = await db.$queryRaw<{ day: Date; present: bigint; total: bigint }[]>`
    SELECT "onDate" AS day,
           COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE','HALF_DAY')) AS present,
           COUNT(*) AS total
    FROM "StudentAttendance"
    WHERE "tenantId" = ${ctx.tenant.id} AND "onDate" >= ${weekAgo}
    GROUP BY "onDate"
    ORDER BY "onDate" ASC`

  const collectionTrend = await db.$queryRaw<{ day: Date; amount: bigint }[]>`
    SELECT date_trunc('day', "paidAt") AS day, SUM("amountMinor")::bigint AS amount
    FROM "FeePayment"
    WHERE "tenantId" = ${ctx.tenant.id} AND status = 'SUCCESS' AND "paidAt" >= ${weekAgo}
    GROUP BY 1
    ORDER BY 1 ASC`

  return {
    people: { students: studentCount, teachers: teacherCount, staff: staffCount },
    attendance: {
      present,
      absent,
      late,
      marked,
      expected: studentCount,
      percent: marked > 0 ? Math.round((present / marked) * 1000) / 10 : 0,
      trend: attendanceTrend.map((r) => ({
        day: r.day,
        percent: Number(r.total) > 0 ? Math.round((Number(r.present) / Number(r.total)) * 100) : 0,
      })),
    },
    finance: {
      collectedTodayMinor: collectedToday._sum.amountMinor ?? 0,
      paymentsToday: collectedToday._count._all,
      collectedMonthMinor: collectedMonth._sum.amountMinor ?? 0,
      outstandingMinor: outstanding._sum.balanceMinor ?? 0,
      overdueInvoices,
      trend: collectionTrend.map((r) => ({ day: r.day, amountMinor: Number(r.amount) })),
    },
    library: { issued: libraryIssued, overdue: libraryOverdue },
    pendingLeave,
    upcomingExams,
    upcomingEvents,
    recentPayments,
    recentNotices,
    recentActivity,
  }
}
