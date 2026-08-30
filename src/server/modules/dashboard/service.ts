import { subDays, startOfMonth } from 'date-fns'
import { attendanceDate } from '@/lib/dates'
import type { AppContext } from '@/server/context'
import {
  accessibleStudentIds,
  teachingClassLevelIds,
  teachingClassSubjectIds,
} from '@/server/scope'
import { headcountGrowth } from './growth'

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
    parentCount,
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
    billed,
    pendingDue,
    overdueDue,
    staffDirectory,
    recentLeads,
    leadsThisWeek,
    openLeads,
  ] = await Promise.all([
    db.student.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    db.staff.count({ where: { staffType: 'TEACHING', deletedAt: null } }),
    db.staff.count({ where: { deletedAt: null } }),
    db.parent.count({ where: { deletedAt: null } }),
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
    // Billing split. Three slices of one billed total, so the donut adds up:
    // what has been paid, what is not due yet, and what is late.
    db.feeInvoice.aggregate({
      where: { cancelledAt: null },
      _sum: { paidMinor: true, totalMinor: true },
    }),
    db.feeInvoice.aggregate({
      where: { cancelledAt: null, balanceMinor: { gt: 0 }, dueOn: { gte: today } },
      _sum: { balanceMinor: true },
    }),
    db.feeInvoice.aggregate({
      where: { cancelledAt: null, balanceMinor: { gt: 0 }, dueOn: { lt: today } },
      _sum: { balanceMinor: true },
    }),
    // The staff shown on the dashboard are the people a parent or a colleague
    // would want to reach, so leadership and teaching come before the rest.
    db.staff.findMany({
      where: { deletedAt: null, leftOn: null },
      orderBy: [{ staffType: 'asc' }, { firstName: 'asc' }],
      take: 8,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        designation: true,
        department: true,
        email: true,
        phone: true,
        staffType: true,
        gender: true,
      },
    }),
    db.admissionLead.findMany({
      where: { deletedAt: null, convertedStudentId: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        studentName: true,
        parentName: true,
        phone: true,
        source: true,
        stage: true,
        createdAt: true,
        nextFollowUpOn: true,
        interestedClassId: true,
      },
    }),
    db.admissionLead.count({
      where: { deletedAt: null, createdAt: { gte: subDays(new Date(), 7) } },
    }),
    db.admissionLead.count({
      where: { deletedAt: null, convertedStudentId: null, stage: { notIn: ['LOST', 'ENROLLED'] } },
    }),
  ])

  const attendanceMap = Object.fromEntries(
    attendanceToday.map((row) => [row.status, row._count._all]),
  ) as Record<string, number | undefined>

  const present = attendanceMap.PRESENT ?? 0
  const absent = attendanceMap.ABSENT ?? 0
  const late = attendanceMap.LATE ?? 0
  const marked = present + absent + late + (attendanceMap.HALF_DAY ?? 0) + (attendanceMap.LEAVE ?? 0)

  // Head-count history for the KPI sparklines. Three small grouped queries,
  // run together after the counts they are anchored to.
  const [studentGrowth, staffGrowth, parentGrowth, leadClasses] = await Promise.all([
    headcountGrowth(ctx, 'Student', studentCount),
    headcountGrowth(ctx, 'Staff', staffCount),
    headcountGrowth(ctx, 'Parent', parentCount),
    db.classLevel.findMany({
      where: { id: { in: recentLeads.map((l) => l.interestedClassId).filter((id): id is string => !!id) } },
      select: { id: true, name: true },
    }),
  ])

  const classNameById = new Map(leadClasses.map((c) => [c.id, c.name]))

  const attendanceTrend = await db.$queryRaw<{ day: Date; present: bigint; total: bigint }[]>`
    SELECT "onDate" AS day,
           COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE','HALF_DAY')) AS present,
           COUNT(*) AS total
    FROM "StudentAttendance"
    WHERE "tenantId" = ${ctx.tenant.id} AND "onDate" >= ${weekAgo}
    GROUP BY "onDate"
    ORDER BY "onDate" ASC`

  // Attendance by month, to sit under the head-count bars on the academic
  // overview. Weekends and holidays never enter the table, so the percentage
  // is over days that actually had a register.
  const attendanceByMonth = await db.$queryRaw<{ month: Date; present: bigint; total: bigint }[]>`
    SELECT date_trunc('month', "onDate") AS month,
           COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE','HALF_DAY')) AS present,
           COUNT(*) AS total
    FROM "StudentAttendance"
    WHERE "tenantId" = ${ctx.tenant.id}
      AND "onDate" >= date_trunc('month', now()) - interval '11 months'
    GROUP BY 1
    ORDER BY 1 ASC`

  const collectionTrend = await db.$queryRaw<{ day: Date; amount: bigint }[]>`
    SELECT date_trunc('day', "paidAt") AS day, SUM("amountMinor")::bigint AS amount
    FROM "FeePayment"
    WHERE "tenantId" = ${ctx.tenant.id} AND status = 'SUCCESS' AND "paidAt" >= ${weekAgo}
    GROUP BY 1
    ORDER BY 1 ASC`

  const paidMinor = billed._sum.paidMinor ?? 0
  const pendingMinor = pendingDue._sum.balanceMinor ?? 0
  const overdueMinor = overdueDue._sum.balanceMinor ?? 0

  return {
    people: {
      students: studentCount,
      teachers: teacherCount,
      staff: staffCount,
      parents: parentCount,
      growth: { students: studentGrowth, staff: staffGrowth, parents: parentGrowth },
    },
    academic: buildAcademicSeries(studentGrowth.series, staffGrowth.series, attendanceByMonth),
    attendance: {
      present,
      absent,
      late,
      marked,
      expected: studentCount,
      percent: marked > 0 ? Math.round((present / marked) * 1000) / 10 : 0,
      halfDay: attendanceMap.HALF_DAY ?? 0,
      leave: attendanceMap.LEAVE ?? 0,
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
      billing: {
        collectedMinor: paidMinor,
        pendingMinor,
        overdueMinor,
        billedMinor: billed._sum.totalMinor ?? 0,
      },
    },
    staffDirectory,
    admissions: {
      thisWeek: leadsThisWeek,
      open: openLeads,
      leads: recentLeads.map((lead) => ({
        id: lead.id,
        studentName: lead.studentName,
        parentName: lead.parentName,
        phone: lead.phone,
        source: lead.source,
        stage: lead.stage,
        createdAt: lead.createdAt,
        nextFollowUpOn: lead.nextFollowUpOn,
        className: lead.interestedClassId
          ? (classNameById.get(lead.interestedClassId) ?? null)
          : null,
      })),
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

/** Scoped dashboard for teacher-only accounts. */
export async function getTeacherDashboard(ctx: AppContext) {
  const studentIds = await accessibleStudentIds(ctx)
  const classLevelIds = await teachingClassLevelIds(ctx)
  const subjectIds = await teachingClassSubjectIds(ctx)
  const ids = studentIds ?? []

  const today = attendanceDate(new Date())

  const [studentCount, classes, subjects, outstanding, overdueCount, sections] = await Promise.all([
    ctx.db.student.count({
      where: { status: 'ACTIVE', deletedAt: null, id: { in: ids } },
    }),
    classLevelIds && classLevelIds.length > 0
      ? ctx.db.classLevel.findMany({
          where: { id: { in: classLevelIds }, deletedAt: null },
          orderBy: { numeric: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    subjectIds && subjectIds.length > 0
      ? ctx.db.classSubject.findMany({
          where: { id: { in: subjectIds } },
          select: {
            classLevel: { select: { name: true } },
            subject: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    ctx.db.feeInvoice.aggregate({
      where: {
        studentId: { in: ids },
        balanceMinor: { gt: 0 },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      _sum: { balanceMinor: true },
    }),
    ctx.db.feeInvoice.count({
      where: {
        studentId: { in: ids },
        balanceMinor: { gt: 0 },
        dueOn: { lt: today },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
    }),
    ctx.db.section.count({
      where: {
        deletedAt: null,
        ...(classLevelIds && classLevelIds.length > 0 ? { classLevelId: { in: classLevelIds } } : {}),
      },
    }),
  ])

  return {
    studentCount,
    classCount: classes.length,
    sectionCount: sections,
    classes,
    subjects: subjects.map((s) => `${s.subject.name} · ${s.classLevel.name}`),
    outstandingMinor: outstanding._sum.balanceMinor ?? 0,
    overdueCount,
  }
}

type MonthlyAttendance = { month: Date; present: bigint; total: bigint }

export type AcademicPoint = {
  label: string
  students: number
  staff: number
  attendance: number | null
}

/**
 * Joins head count and attendance onto one monthly axis.
 *
 * Attendance is null rather than zero for a month with no register: a school
 * that was closed did not have nought percent attendance, and a line dropping
 * to the floor over the summer holidays would read as a catastrophe.
 */
function buildAcademicSeries(
  students: { label: string; value: number }[],
  staff: { label: string; value: number }[],
  attendance: MonthlyAttendance[],
): AcademicPoint[] {
  const byLabel = new Map<string, number>()
  for (const row of attendance) {
    const label = row.month.toLocaleDateString('en-IN', { month: 'short' })
    const total = Number(row.total)
    if (total > 0) byLabel.set(label, Math.round((Number(row.present) / total) * 100))
  }

  return students.map((point, index) => ({
    label: point.label,
    students: point.value,
    staff: staff[index]?.value ?? 0,
    attendance: byLabel.get(point.label) ?? null,
  }))
}
