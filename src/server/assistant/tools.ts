import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { getAdminDashboard } from '@/server/modules/dashboard/service'
import { attendanceReport, unmarkedSections } from '@/server/modules/attendance/service'
import { outstandingByClass, listInvoices } from '@/server/modules/finance/service'
import { listPayments } from '@/server/modules/finance/payments'
import { listStudents, getClassOptions } from '@/server/modules/students/service'
import { facultyReadinessOverview } from '@/server/modules/teacher-refresh/analytics'
import { formatMoney } from '@/lib/utils'
import { formatDay } from '@/lib/dates'

/**
 * The assistant's tools.
 *
 * This file is the security boundary of the whole feature, and it rests on one
 * decision: **the model never writes a query.** It picks a tool from this fixed
 * list and supplies validated arguments; the tool calls the same service
 * function the screens call, with the *asking user's* own `AppContext`.
 *
 * Three properties follow, none of which depend on the model behaving well:
 *
 *   1. Tenant isolation is inherited. Service functions run through the
 *      tenant-scoped client, so a question can only reach this school's rows.
 *      There is no argument anywhere below that names a tenant.
 *   2. Permissions are inherited twice over. Each service function asserts its
 *      own permission, and `toolsFor()` hides tools the caller cannot use, so
 *      the model is never offered one. An accountant cannot read results.
 *   3. There is no text-to-SQL, so a prompt-injected instruction has no
 *      mechanism to reach data: the tool surface is this file.
 *
 * Read tools answer questions. The action tool returns a **draft** and writes
 * nothing — see `drafts.ts` for why the model is not the thing that acts.
 *
 * Every figure is formatted here, on the server, from minor units. The model is
 * never asked to divide by 100 or to round a percentage, because a model that
 * is 99% reliable at arithmetic is not good enough for a fee balance.
 */

/** What a tool call produced, as the model will see it. */
export type ToolOutput = {
  /** Compact JSON for the model, with money and dates already formatted. */
  data: unknown
  /** Where a human goes to verify this. Rendered as a link beside the answer. */
  href?: string
  /** A proposed action awaiting the user's approval, if this tool drafted one. */
  draft?: {
    kind: 'notice' | 'fee_reminder' | 'attendance_nudge' | 'leave_approvals'
    summary: string
    payload: unknown
  }
}

export type AssistantTool = {
  name: string
  description: string
  /** Argument schema. Also converted to JSON Schema for the model. */
  input: z.ZodObject<z.ZodRawShape>
  /** Permission the caller must hold, or the tool does not exist for them. */
  permission: string
  /** True for the tools that propose an action rather than answer a question. */
  action?: boolean
  run: (ctx: AppContext, args: Record<string, never>) => Promise<ToolOutput>
}

/* ------------------------------------------------------------------ helpers */

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseDay(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

const dayArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe('A calendar date as YYYY-MM-DD. Omit for today.')

/** Raw SQL returns bigint for aggregates; JSON cannot carry it. */
function num(value: bigint | number | null): number {
  return typeof value === 'bigint' ? Number(value) : (value ?? 0)
}

/* --------------------------------------------------------------- read tools */

const overview: AssistantTool = {
  name: 'school_overview',
  description:
    'Headline figures for the whole school right now: students enrolled, teaching and total staff, attendance marked today, fees collected today and this month, and total outstanding. Call this for broad questions ("how are we doing", "give me today\'s summary") or to get a total before drilling into one class.',
  permission: 'dashboard.view',
  input: z.object({}),
  async run(ctx) {
    const dash = await getAdminDashboard(ctx)
    const money = (minor: number) => formatMoney(minor, ctx.tenant.currency, ctx.tenant.locale)

    return {
      href: '/',
      data: {
        students: dash.people.students,
        teachers: dash.people.teachers,
        totalStaff: dash.people.staff,
        attendanceToday:
          dash.attendance.marked > 0
            ? {
                percent: dash.attendance.percent,
                present: dash.attendance.present,
                absent: dash.attendance.absent,
                markedFor: dash.attendance.marked,
                expected: dash.attendance.expected,
              }
            : 'No registers submitted yet today',
        collectedToday: money(dash.finance.collectedTodayMinor),
        collectedThisMonth: money(dash.finance.collectedMonthMinor),
        outstanding: money(dash.finance.outstandingMinor),
        overdueInvoices: dash.finance.overdueInvoices,
        pendingLeaveRequests: dash.pendingLeave,
      },
    }
  },
}

const missingRegisters: AssistantTool = {
  name: 'unmarked_registers',
  description:
    'Which class sections have not finished submitting attendance for a day, with how many of their students are still unmarked. This is the tool for "whose attendance is missing", "who has not marked the register", "which classes are pending".',
  permission: 'attendance.view',
  input: z.object({ date: dayArg }),
  async run(ctx, args) {
    const { date } = args as unknown as { date?: string }
    const on = parseDay(date, new Date())
    const sections = await unmarkedSections(ctx, isoDay(on))

    return {
      href: '/attendance',
      data: {
        date: formatDay(on),
        sectionsOutstanding: sections.length,
        sections: sections.map((section) => ({
          section: section.label,
          enrolled: section.enrolled,
          marked: section.marked,
          stillUnmarked: section.enrolled - section.marked,
        })),
      },
    }
  },
}

const attendanceDetail: AssistantTool = {
  name: 'attendance_report',
  description:
    'Per-student attendance over a date range, worst attendance first: present, absent, late, half day, leave and the percentage. Use for "which students have poor attendance", "how was attendance last week", or one class over time. Restrict to a class with classLevelId from list_classes.',
  permission: 'attendance.view',
  input: z.object({
    from: dayArg,
    to: dayArg,
    classLevelId: z
      .string()
      .optional()
      .describe('Restrict to one class. Get the id from list_classes; do not guess it.'),
    limit: z.number().int().min(1).max(40).optional().describe('How many students to return. Default 15.'),
  }),
  async run(ctx, args) {
    const a = args as unknown as { from?: string; to?: string; classLevelId?: string; limit?: number }
    const to = parseDay(a.to, new Date())
    const from = parseDay(a.from, new Date(to.getTime() - 6 * 86_400_000))

    const report = await attendanceReport(ctx, {
      from: isoDay(from),
      to: isoDay(to),
      ...(a.classLevelId ? { classLevelId: a.classLevelId } : {}),
    })

    return {
      href: '/attendance/reports',
      data: {
        from: formatDay(from),
        to: formatDay(to),
        studentsInRange: report.rows.length,
        totals: report.totals,
        students: report.rows.slice(0, a.limit ?? 15).map((row) => ({
          name: row.name,
          admissionNo: row.admissionNo,
          class: row.className,
          section: row.sectionName,
          present: row.present,
          absent: row.absent,
          late: row.late,
          leave: row.leave,
          percent: row.percent,
        })),
      },
    }
  },
}

const outstanding: AssistantTool = {
  name: 'fees_outstanding',
  description:
    'Fees still owed, grouped by class: the balance, how much of it is past its due date, and how many students it covers. This is the tool for "what fees are pending", "how much is outstanding", "which class owes the most", "how much is overdue".',
  permission: 'fees.view',
  input: z.object({}),
  async run(ctx) {
    const rows = await outstandingByClass(ctx)
    const money = (minor: number) => formatMoney(minor, ctx.tenant.currency, ctx.tenant.locale)
    const totalMinor = rows.reduce((sum, row) => sum + num(row.outstanding), 0)
    const overdueMinor = rows.reduce((sum, row) => sum + num(row.overdue), 0)

    return {
      href: '/finance/outstanding',
      data: {
        totalOutstanding: money(totalMinor),
        ofWhichOverdue: money(overdueMinor),
        byClass: rows.map((row) => ({
          class: row.className,
          outstanding: money(num(row.outstanding)),
          overdue: money(num(row.overdue)),
          students: num(row.students),
        })),
      },
    }
  },
}

const collections: AssistantTool = {
  name: 'fees_collected',
  description:
    'Payments actually received, most recent first, with the student, amount, mode and receipt number. Use for "how much did we collect today", "recent payments", or to check whether one family has paid.',
  permission: 'fees.view',
  input: z.object({
    search: z.string().optional().describe('Student name, admission number or receipt number.'),
    from: dayArg,
    to: dayArg,
    limit: z.number().int().min(1).max(40).optional().describe('Default 10.'),
  }),
  async run(ctx, args) {
    const a = args as unknown as { search?: string; from?: string; to?: string; limit?: number }
    const result = await listPayments(
      ctx,
      { page: 1, pageSize: a.limit ?? 10, q: a.search },
      { status: 'SUCCESS', ...(a.from ? { from: a.from } : {}), ...(a.to ? { to: a.to } : {}) },
    )
    const money = (minor: number) => formatMoney(minor, ctx.tenant.currency, ctx.tenant.locale)

    return {
      href: '/finance/payments',
      data: {
        paymentsMatching: result.total,
        totalCollected: money(result.collectedMinor),
        payments: result.rows.map((payment) => ({
          student: payment.studentName,
          admissionNo: payment.admissionNo,
          amount: money(payment.amountMinor),
          mode: payment.mode,
          receipt: payment.receiptNumber,
          paidOn: formatDay(payment.paidAt ?? payment.createdAt),
        })),
      },
    }
  },
}

const invoices: AssistantTool = {
  name: 'fees_invoices',
  description:
    'Invoices raised, filterable by status and class, with the balance and how many days overdue each is. Use when the question is about billing rather than money received — "how many invoices are overdue", "is this family invoiced", "which invoices are unpaid in Class 9".',
  permission: 'fees.view',
  input: z.object({
    status: z
      .enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'])
      .optional()
      .describe('Omit for every status. OVERDUE means past its due date and unpaid.'),
    classLevelId: z.string().optional().describe('From list_classes. Do not guess.'),
    search: z.string().optional().describe('Student name, admission number or invoice number.'),
    limit: z.number().int().min(1).max(40).optional().describe('Default 10.'),
  }),
  async run(ctx, args) {
    const a = args as unknown as {
      status?: string
      classLevelId?: string
      search?: string
      limit?: number
    }
    const result = await listInvoices(
      ctx,
      { page: 1, pageSize: a.limit ?? 10, sort: undefined, dir: 'desc', q: a.search },
      {
        ...(a.status ? { status: a.status as never } : {}),
        ...(a.classLevelId ? { classLevelId: a.classLevelId } : {}),
      },
    )
    const money = (minor: number) => formatMoney(minor, ctx.tenant.currency, ctx.tenant.locale)

    return {
      href: '/finance/invoices',
      data: {
        invoicesMatching: result.total,
        billed: money(result.totals.billed),
        collected: money(result.totals.collected),
        outstanding: money(result.totals.outstanding),
        invoices: result.rows.map((invoice) => ({
          number: invoice.number,
          student: invoice.studentName,
          class: invoice.className,
          status: invoice.status,
          due: formatDay(invoice.dueOn),
          daysOverdue: invoice.daysOverdue,
          total: money(invoice.totalMinor),
          balance: money(invoice.balanceMinor),
        })),
      },
    }
  },
}

const students: AssistantTool = {
  name: 'find_students',
  description:
    'Look up students by name, admission number, or guardian name and phone. Returns their class, section, guardian and current fee balance. Use this to resolve who the user means before answering a question about one child.',
  permission: 'students.view',
  input: z.object({
    search: z.string().min(1).describe('Name, admission number, guardian name or phone.'),
    limit: z.number().int().min(1).max(20).optional().describe('Default 8.'),
  }),
  async run(ctx, args) {
    const a = args as unknown as { search: string; limit?: number }
    const result = await listStudents(
      ctx,
      { page: 1, pageSize: a.limit ?? 8, sort: undefined, dir: 'asc', q: a.search },
      { status: 'ACTIVE' },
    )
    const money = (minor: number) => formatMoney(minor, ctx.tenant.currency, ctx.tenant.locale)

    return {
      href: '/students',
      data: {
        matches: result.total,
        students: result.rows.map((student) => ({
          name: `${student.firstName} ${student.lastName}`.trim(),
          admissionNo: student.admissionNo,
          class: student.className,
          section: student.sectionName,
          rollNumber: student.rollNumber,
          guardian: student.guardianName,
          feeBalance: money(student.dueMinor),
          openAt: `/students/${student.id}`,
        })),
      },
    }
  },
}

const classes: AssistantTool = {
  name: 'list_classes',
  description:
    'Every class and section in the current academic year with its strength, and the ids other tools need. Call this whenever a question names a class, so you pass a real classLevelId to the other tools instead of guessing one.',
  permission: 'academics.view',
  input: z.object({}),
  async run(ctx) {
    const levels = await getClassOptions(ctx)

    return {
      href: '/academics/classes',
      data: {
        classes: levels.map((level) => ({
          class: level.name,
          classLevelId: level.id,
          sections: level.sections.map((section) => ({
            section: section.name,
            sectionId: section.id,
            students: section._count.enrollments,
            capacity: section.capacity,
          })),
        })),
      },
    }
  },
}

/* -------------------------------------------------------- faculty readiness */

/**
 * Faculty knowledge-refresh readiness, for oversight roles only.
 *
 * This is internal professional-development information, so the tool is gated on
 * `teacher_refresh.view_school` (a principal / owner permission) and hidden from
 * everyone else by `toolsFor`. It deliberately hands the model only the *summary*
 * a principal asks about in conversation — the completion rate, the department
 * roll-up, and the supportive alerts that already name who could use a hand —
 * not every teacher's raw score. Minimising what crosses to the AI provider is
 * the point: the full per-teacher table lives on the dashboard behind `href`,
 * not in the model's context, and nothing here is phrased as a ranking.
 */
const facultyReadiness: AssistantTool = {
  name: 'faculty_readiness',
  description:
    'How the school\'s teacher knowledge refreshers are going: the overall completion rate, how many teachers are up to date, a per-department roll-up, and a short list of supportive alerts (who has overdue refreshers or could use a review). Use this for "how is faculty development going", "who is behind on their refreshers", "which department needs support". This is internal professional-development information — never repeat it to a parent or student, and frame it as support, not a ranking.',
  permission: 'teacher_refresh.view_school',
  input: z.object({}),
  async run(ctx) {
    const overview = await facultyReadinessOverview(ctx)
    return {
      href: '/admin/faculty-development',
      data: {
        enabled: overview.enabled,
        teachers: overview.headline.teacherCount,
        completionRate:
          overview.headline.completionRate == null
            ? 'No refreshers assigned yet'
            : `${overview.headline.completionRate}%`,
        teachersUpToDate: overview.headline.teachersUpToDate,
        teachersWithRefreshers: overview.headline.teachersWithWork,
        byDepartment: overview.departments.map((d) => ({
          department: d.department,
          teachers: d.teacherCount,
          completionRate: d.completionRate == null ? 'n/a' : `${d.completionRate}%`,
          averageReadiness: d.averagePercent == null ? 'n/a' : `${d.averagePercent}%`,
        })),
        support: overview.alerts.map((a) => ({
          teacher: a.teacherName,
          kind: a.kind === 'OVERDUE' ? 'Has overdue refreshers' : 'Additional review suggested',
          suggestion: a.message,
        })),
        note: 'Internal professional-development information. Do not share individual results with parents or students; use it to offer support, not to rank teachers.',
      },
    }
  },
}

const attendanceCompare: AssistantTool = {
  name: 'attendance_compare',
  description:
    'Compare attendance for the last seven days against the seven days before that: average present percentage, total present and absent. Use for "how is attendance this week vs last week", "are we improving".',
  permission: 'attendance.view',
  input: z.object({}),
  async run(ctx) {
    const today = new Date()
    const thisEnd = isoDay(today)
    const thisStart = isoDay(new Date(today.getTime() - 6 * 86_400_000))
    const prevEnd = isoDay(new Date(today.getTime() - 7 * 86_400_000))
    const prevStart = isoDay(new Date(today.getTime() - 13 * 86_400_000))

    async function totals(from: string, to: string) {
      const rows = await ctx.db.studentAttendance.groupBy({
        by: ['status'],
        where: { onDate: { gte: from, lte: to } },
        _count: { _all: true },
      })
      const map = Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>
      const present = (map.PRESENT ?? 0) + (map.LATE ?? 0) + (map.HALF_DAY ?? 0) * 0.5
      const absent = map.ABSENT ?? 0
      const leave = map.LEAVE ?? 0
      const marked = present + absent + leave
      const percent = marked > 0 ? Math.round((present / marked) * 100) : null
      return { present: Math.round(present), absent, leave, marked, percent }
    }

    const current = await totals(thisStart, thisEnd)
    const previous = await totals(prevStart, prevEnd)
    const delta =
      current.percent != null && previous.percent != null
        ? current.percent - previous.percent
        : null

    return {
      href: '/attendance/reports',
      data: {
        thisWeek: {
          from: formatDay(new Date(`${thisStart}T00:00:00`)),
          to: formatDay(new Date(`${thisEnd}T00:00:00`)),
          ...current,
        },
        lastWeek: {
          from: formatDay(new Date(`${prevStart}T00:00:00`)),
          to: formatDay(new Date(`${prevEnd}T00:00:00`)),
          ...previous,
        },
        changeInPresentPercent:
          delta == null ? 'Not enough data' : `${delta >= 0 ? '+' : ''}${delta} percentage points`,
      },
    }
  },
}

const feesCompare: AssistantTool = {
  name: 'fees_compare',
  description:
    'Compare fee collections: this week vs last week, and today vs the same weekday last week.',
  permission: 'fees.view',
  input: z.object({}),
  async run(ctx) {
    const today = new Date()
    const todayStr = isoDay(today)
    const weekStart = isoDay(new Date(today.getTime() - 6 * 86_400_000))
    const prevWeekEnd = isoDay(new Date(today.getTime() - 7 * 86_400_000))
    const prevWeekStart = isoDay(new Date(today.getTime() - 13 * 86_400_000))
    const lastWeekSameDay = isoDay(new Date(today.getTime() - 7 * 86_400_000))
    const money = (minor: number) => formatMoney(minor, ctx.tenant.currency, ctx.tenant.locale)

    const [thisWeek, lastWeek, todayPay, sameDayLastWeek] = await Promise.all([
      ctx.db.feePayment.aggregate({
        where: { status: 'SUCCESS', paidAt: { gte: weekStart, lte: todayStr } },
        _sum: { amountMinor: true },
      }),
      ctx.db.feePayment.aggregate({
        where: { status: 'SUCCESS', paidAt: { gte: prevWeekStart, lte: prevWeekEnd } },
        _sum: { amountMinor: true },
      }),
      ctx.db.feePayment.aggregate({
        where: { status: 'SUCCESS', paidAt: { gte: todayStr, lte: todayStr } },
        _sum: { amountMinor: true },
      }),
      ctx.db.feePayment.aggregate({
        where: { status: 'SUCCESS', paidAt: { gte: lastWeekSameDay, lte: lastWeekSameDay } },
        _sum: { amountMinor: true },
      }),
    ])

    const thisWeekMinor = num(thisWeek._sum.amountMinor)
    const lastWeekMinor = num(lastWeek._sum.amountMinor)
    const todayMinor = num(todayPay._sum.amountMinor)
    const sameDayMinor = num(sameDayLastWeek._sum.amountMinor)

    return {
      href: '/finance/payments',
      data: {
        thisWeek: money(thisWeekMinor),
        lastWeek: money(lastWeekMinor),
        weekChange:
          lastWeekMinor > 0
            ? `${Math.round(((thisWeekMinor - lastWeekMinor) / lastWeekMinor) * 100)}% vs last week`
            : 'No collections last week to compare',
        today: money(todayMinor),
        sameWeekdayLastWeek: money(sameDayMinor),
      },
    }
  },
}

const pendingLeave: AssistantTool = {
  name: 'pending_leave',
  description:
    'Leave requests waiting for approval. Call before draft_leave_approvals to get real ids.',
  permission: 'leave.approve',
  input: z.object({
    limit: z.number().int().min(1).max(20).optional().describe('Default 10.'),
  }),
  async run(ctx, args) {
    const a = args as unknown as { limit?: number }
    const rows = await ctx.db.leaveRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: a.limit ?? 10,
      select: {
        id: true,
        fromDate: true,
        toDate: true,
        reason: true,
        student: { select: { firstName: true, lastName: true } },
        staff: { select: { firstName: true, lastName: true } },
      },
    })

    return {
      href: '/leave',
      data: {
        pending: rows.length,
        requests: rows.map((row) => ({
          id: row.id,
          for: row.student
            ? `${row.student.firstName} ${row.student.lastName}`.trim()
            : row.staff
              ? `${row.staff.firstName} ${row.staff.lastName}`.trim()
              : 'Unknown',
          from: formatDay(row.fromDate),
          to: formatDay(row.toDate),
          reason: row.reason ?? 'No reason given',
        })),
      },
    }
  },
}

const draftFeeReminder: AssistantTool = {
  name: 'draft_fee_reminder',
  description:
    'Prepare a fee reminder notice. Does NOT send — user must approve. Never say it was sent.',
  permission: 'notices.create',
  action: true,
  input: z.object({
    title: z.string().min(3).max(160).optional(),
    body: z.string().min(10).max(4000),
    audienceKind: z.enum(['ALL', 'CLASS']),
    classLevelId: z.string().optional(),
  }),
  async run(ctx, args) {
    const a = args as unknown as {
      title?: string
      body: string
      audienceKind: 'ALL' | 'CLASS'
      classLevelId?: string
    }
    let audienceLabel = 'everyone in the school'
    if (a.audienceKind === 'CLASS') {
      if (!a.classLevelId) throw new Error('Needs classLevelId from list_classes.')
      const level = await ctx.db.classLevel.findFirst({
        where: { id: a.classLevelId, deletedAt: null },
        select: { name: true },
      })
      if (!level) throw new Error('That class does not exist.')
      audienceLabel = level.name
    }
    const title = a.title ?? `Fee reminder — ${audienceLabel}`
    return {
      data: { drafted: true, audience: audienceLabel },
      draft: {
        kind: 'fee_reminder',
        summary: `Fee reminder “${title}” to ${audienceLabel}`,
        payload: { title, body: a.body, audienceKind: a.audienceKind, classLevelId: a.classLevelId },
      },
    }
  },
}

const draftAttendanceNudge: AssistantTool = {
  name: 'draft_attendance_nudge',
  description:
    'Prepare a notice nudging staff to mark attendance. Does NOT send — user must approve.',
  permission: 'notices.create',
  action: true,
  input: z.object({
    body: z.string().min(10).max(4000),
    audienceKind: z.enum(['ALL', 'CLASS']),
    classLevelId: z.string().optional(),
  }),
  async run(ctx, args) {
    const a = args as unknown as {
      body: string
      audienceKind: 'ALL' | 'CLASS'
      classLevelId?: string
    }
    let audienceLabel = 'all staff'
    if (a.audienceKind === 'CLASS') {
      if (!a.classLevelId) throw new Error('Needs classLevelId from list_classes.')
      const level = await ctx.db.classLevel.findFirst({
        where: { id: a.classLevelId, deletedAt: null },
        select: { name: true },
      })
      if (!level) throw new Error('That class does not exist.')
      audienceLabel = level.name
    }
    const title = `Attendance register — ${formatDay(new Date())}`
    return {
      data: { drafted: true, audience: audienceLabel },
      draft: {
        kind: 'attendance_nudge',
        summary: `Attendance nudge to ${audienceLabel}`,
        payload: { title, body: a.body, audienceKind: a.audienceKind, classLevelId: a.classLevelId },
      },
    }
  },
}

const draftLeaveApprovals: AssistantTool = {
  name: 'draft_leave_approvals',
  description:
    'Prepare approval of pending leave requests. Call pending_leave first. Does NOT approve until user confirms.',
  permission: 'leave.approve',
  action: true,
  input: z.object({
    leaveRequestIds: z.array(z.string().min(8)).min(1).max(10),
    decisionNote: z.string().max(500).optional(),
  }),
  async run(ctx, args) {
    const a = args as unknown as { leaveRequestIds: string[]; decisionNote?: string }
    const rows = await ctx.db.leaveRequest.findMany({
      where: { id: { in: a.leaveRequestIds }, status: 'PENDING' },
      select: {
        id: true,
        student: { select: { firstName: true, lastName: true } },
        staff: { select: { firstName: true, lastName: true } },
      },
    })
    if (rows.length === 0) {
      throw new Error('None of those requests are still pending. Call pending_leave.')
    }
    const names = rows.map((r) =>
      r.student
        ? `${r.student.firstName} ${r.student.lastName}`.trim()
        : r.staff
          ? `${r.staff.firstName} ${r.staff.lastName}`.trim()
          : 'Request',
    )
    return {
      data: { willApprove: rows.length, names },
      draft: {
        kind: 'leave_approvals',
        summary: `Approve ${rows.length} leave request${rows.length === 1 ? '' : 's'} (${names.join(', ')})`,
        payload: { leaveRequestIds: rows.map((r) => r.id), decisionNote: a.decisionNote },
      },
    }
  },
}

const draftNotice: AssistantTool = {
  name: 'draft_notice',
  description:
    'Prepare a notice for the user to review — a fee reminder to one class, an announcement to everyone. This does NOT send anything: it returns a draft the user must approve in the interface. In your reply, say the draft is ready for them to review and send. Never say a notice has been sent, scheduled, or delivered.',
  permission: 'notices.create',
  action: true,
  input: z.object({
    title: z.string().min(3).max(160).describe('Subject line.'),
    body: z.string().min(10).max(4000).describe('The message in full, written ready to send.'),
    audienceKind: z
      .enum(['ALL', 'CLASS'])
      .describe('ALL for the whole school. CLASS for one class, with classLevelId.'),
    classLevelId: z
      .string()
      .optional()
      .describe('Required when audienceKind is CLASS. Get it from list_classes; never invent one.'),
  }),
  async run(ctx, args) {
    const a = args as unknown as {
      title: string
      body: string
      audienceKind: 'ALL' | 'CLASS'
      classLevelId?: string
    }

    // Resolve the class here so an invalid id fails now, while the user is
    // watching, rather than at approval time.
    let audienceLabel = 'everyone in the school'
    if (a.audienceKind === 'CLASS') {
      if (!a.classLevelId) throw new Error('A class notice needs a classLevelId from list_classes.')
      const level = await ctx.db.classLevel.findFirst({
        where: { id: a.classLevelId, deletedAt: null },
        select: { name: true },
      })
      if (!level) throw new Error('That class does not exist. Call list_classes and use a real id.')
      audienceLabel = level.name
    }

    return {
      data: {
        drafted: true,
        audience: audienceLabel,
        reminder: 'Nothing has been sent. The user must approve this draft.',
      },
      draft: {
        kind: 'notice',
        summary: `“${a.title}” to ${audienceLabel}`,
        payload: a,
      },
    }
  },
}

/* ------------------------------------------------------------------ registry */

const ALL_TOOLS: AssistantTool[] = [
  overview,
  missingRegisters,
  attendanceDetail,
  attendanceCompare,
  outstanding,
  collections,
  feesCompare,
  invoices,
  students,
  classes,
  facultyReadiness,
  pendingLeave,
  draftNotice,
  draftFeeReminder,
  draftAttendanceNudge,
  draftLeaveApprovals,
]

/**
 * The tools this particular user gets.
 *
 * Filtering here, rather than relying only on the service functions, is about
 * answer quality as much as security: a teacher whose assistant has no
 * `fees_outstanding` tool is told "I can't see fee information" instead of
 * watching the model call it and relay a permission error.
 */
export function toolsFor(ctx: AppContext): AssistantTool[] {
  return ALL_TOOLS.filter((tool) => ctx.can(tool.permission))
}

export function findTool(name: string): AssistantTool | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name)
}

/** Names only, for logging and tests. */
export const TOOL_NAMES = ALL_TOOLS.map((tool) => tool.name)
