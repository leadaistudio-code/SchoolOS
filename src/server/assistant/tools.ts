import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { getAdminDashboard, getTeacherDashboard } from '@/server/modules/dashboard/service'
import { attendanceReport, unmarkedSections } from '@/server/modules/attendance/service'
import { outstandingByClass, listInvoices } from '@/server/modules/finance/service'
import { listExpenses, categoryLabel } from '@/server/modules/finance/expenses'
import { listPayments } from '@/server/modules/finance/payments'
import { listStudents, getClassOptions } from '@/server/modules/students/service'
import { facultyReadinessOverview } from '@/server/modules/teacher-refresh/analytics'
import {
  learningInsightsOverview,
} from '@/server/modules/ai-assessment/insights'
import { assignmentAnalytics } from '@/server/modules/assessments/evaluation'
import { listPayslips, payrollSummary } from '@/server/modules/staff/payroll'
import { formatMoney } from '@/lib/utils'
import { attendanceDate, formatDay, toDateInput } from '@/lib/dates'
import { hasSchoolWideScope, isTeacherScoped } from '@/lib/rbac/roles'
import { studentIdScopeWhere } from '@/server/scope'

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
    'Headline figures for the caller right now. School admins and principals get the whole school; teachers get only their assigned students and classes. Call this for broad questions ("how are we doing", "give me today\'s summary").',
  permission: 'dashboard.view',
  input: z.object({}),
  async run(ctx) {
    if (isTeacherScoped(ctx.user.roleKeys)) {
      const dash = await getTeacherDashboard(ctx)
      return {
        href: '/',
        data: {
          scope: 'Your assigned classes only',
          students: dash.studentCount,
          classes: dash.classCount,
          sections: dash.sectionCount,
          subjects: dash.subjects,
          feeStatus: {
            note: 'Paid vs unpaid student counts only — rupee amounts are not available to teachers',
            paidStudents: dash.paidCount,
            unpaidStudents: dash.unpaidCount,
          },
        },
      }
    }

    if (!hasSchoolWideScope(ctx.user.roleKeys)) {
      return {
        href: '/',
        data: {
          scope: 'Role dashboard',
          note: 'Open the home dashboard for figures that apply to your role. School-wide overview is for school leadership.',
        },
      }
    }

    const dash = await getAdminDashboard(ctx)
    const money = (minor: number) => formatMoney(minor, ctx.tenant.currency, ctx.tenant.locale)

    return {
      href: '/',
      data: {
        scope: 'Whole school',
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

const learningTopicGaps: AssistantTool = {
  name: 'learning_topic_gaps',
  description:
    'School or class learning insights from recent published assessment papers: weakest syllabus topics, chapter averages, papers that show topic gaps, and a short supportive list of students who scored under 40% on a recent paper. Use for "where are we weak academically", "which topics need reteaching", "who may need academic attention". Frame as observations from marked papers, never as medical or diagnostic conclusions. Do not invent scores.',
  permission: 'assessments.view',
  input: z.object({}),
  async run(ctx) {
    const overview = await learningInsightsOverview(ctx)
    return {
      href: '/assessments/insights',
      data: {
        windowDays: overview.windowDays,
        weakestTopics: overview.schoolGaps.slice(0, 10).map((t) => ({
          topic: t.name,
          chapter: t.chapter,
          marksEarnedPercent: t.successRate == null ? 'n/a' : `${t.successRate}%`,
          questions: t.questions,
        })),
        strongestTopics: overview.schoolStrengths.slice(0, 5).map((t) => ({
          topic: t.name,
          chapter: t.chapter,
          marksEarnedPercent: t.successRate == null ? 'n/a' : `${t.successRate}%`,
        })),
        papersWithGaps: overview.papersWithGaps.slice(0, 8).map((p) => ({
          title: p.title,
          class: p.className,
          subject: p.subject,
          gapTopics: p.gaps.slice(0, 4).map((g) => g.name),
          analyticsPath: `/assessments/${p.assessmentId}/evaluate/${p.assignmentId}/analytics`,
        })),
        mayNeedCheckIn: overview.needsAttention.slice(0, 10).map((s) => ({
          student: s.name,
          admissionNo: s.admissionNo,
          lowPapers: s.lowPapers,
          papersSeen: s.papers,
          latestPercent: `${s.lastPercent}%`,
          latestPaper: s.lastTitle,
        })),
        note: overview.note,
      },
    }
  },
}

const assignmentTopicGaps: AssistantTool = {
  name: 'assignment_topic_gaps',
  description:
    'Topic gap report for one assessment assignment (one sitting of a paper): class average, pass rate, weakest topics, and a link to the analytics screen. Use when the user names a specific assignment id or asks about gaps on a particular paper. Arguments: assignmentId (required). Frame as observations, not diagnoses.',
  permission: 'assessments.view',
  input: z.object({
    assignmentId: z
      .string()
      .min(1)
      .describe('The assessment assignment id (the sitting), not the paper id alone.'),
  }),
  async run(ctx, args) {
    const assignmentId = String(
      (args as unknown as { assignmentId?: string }).assignmentId ?? '',
    )
    const data = await assignmentAnalytics(ctx, assignmentId)
    return {
      href: `/assessments/${data.assessment.id}/evaluate/${data.assignmentId}/analytics`,
      data: {
        paper: data.assessment.title,
        marked: data.summary.marked,
        submitted: data.summary.submitted,
        average: data.summary.average,
        passRate:
          data.summary.passRate == null ? 'n/a' : `${data.summary.passRate}%`,
        weakestTopics: data.gaps.slice(0, 10).map((t) => ({
          topic: t.name,
          chapter: t.chapter,
          marksEarnedPercent: t.successRate == null ? 'n/a' : `${t.successRate}%`,
          questions: t.questions,
        })),
        remedialGeneratePath: data.remedialHref,
        note: 'Observations from one paper. A low topic score can reflect a hard question, not only weak understanding.',
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
      const scope = await studentIdScopeWhere(ctx)
      const rows = await ctx.db.studentAttendance.groupBy({
        by: ['status'],
        where: { onDate: { gte: from, lte: to }, ...scope },
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
    const scope = await studentIdScopeWhere(ctx)

    const [thisWeek, lastWeek, todayPay, sameDayLastWeek] = await Promise.all([
      ctx.db.feePayment.aggregate({
        where: { status: 'SUCCESS', paidAt: { gte: weekStart, lte: todayStr }, ...scope },
        _sum: { amountMinor: true },
      }),
      ctx.db.feePayment.aggregate({
        where: { status: 'SUCCESS', paidAt: { gte: prevWeekStart, lte: prevWeekEnd }, ...scope },
        _sum: { amountMinor: true },
      }),
      ctx.db.feePayment.aggregate({
        where: { status: 'SUCCESS', paidAt: { gte: todayStr, lte: todayStr }, ...scope },
        _sum: { amountMinor: true },
      }),
      ctx.db.feePayment.aggregate({
        where: {
          status: 'SUCCESS',
          paidAt: { gte: lastWeekSameDay, lte: lastWeekSameDay },
          ...scope,
        },
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

const expensesReport: AssistantTool = {
  name: 'expenses_report',
  description:
    'School expenses recorded in a date range: total spent, breakdown by category, and recent expense rows. Use for "how much was today\'s expense", "what did we spend this month", "expense records".',
  permission: 'expenses.view',
  input: z.object({
    from: dayArg,
    to: dayArg,
    limit: z.number().int().min(1).max(40).optional().describe('Default 15.'),
  }),
  async run(ctx, args) {
    const a = args as unknown as { from?: string; to?: string; limit?: number }
    const to = parseDay(a.to, new Date())
    const from = parseDay(a.from, to)
    const result = await listExpenses(
      ctx,
      { page: 1, pageSize: a.limit ?? 15, dir: 'desc', sort: 'expenseDate' },
      { from: isoDay(from), to: isoDay(to) },
    )
    const money = (minor: number) => formatMoney(minor, ctx.tenant.currency, ctx.tenant.locale)

    return {
      href: '/finance/expenses',
      data: {
        from: formatDay(from),
        to: formatDay(to),
        expensesMatching: result.total,
        totalSpent: money(result.totalMinor),
        byCategory: result.byCategory.map((row) => ({
          category: categoryLabel(row.category),
          count: row.count,
          amount: money(row.amountMinor),
        })),
        expenses: result.rows.map((row) => ({
          date: row.expenseDateInput,
          title: row.title,
          category: categoryLabel(row.category),
          amount: money(row.amountMinor),
          vendor: row.vendor,
        })),
      },
    }
  },
}

const payrollMonth: AssistantTool = {
  name: 'payroll_month',
  description:
    'Staff payroll for a calendar month: how many people are on salary, payslips drafted/published/paid, totals, and which teachers or staff have not been paid yet (or have no salary structure). Use for "who has not got salary this month", "payroll status", "salary not paid".',
  permission: 'staff.payroll',
  input: z.object({
    year: z.number().int().min(2000).max(2100).optional().describe('Defaults to the current year.'),
    month: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe('Calendar month 1-12. Defaults to the current month.'),
  }),
  async run(ctx, args) {
    const a = args as unknown as { year?: number; month?: number }
    const now = new Date()
    const year = a.year ?? now.getFullYear()
    const month = a.month ?? now.getMonth() + 1
    const money = (minor: number) => formatMoney(minor, ctx.tenant.currency, ctx.tenant.locale)

    const [summary, payslips, teachingStaff] = await Promise.all([
      payrollSummary(ctx, year, month),
      listPayslips(ctx, { periodYear: year, periodMonth: month }),
      ctx.db.staff.findMany({
        where: { deletedAt: null, leftOn: null, staffType: 'TEACHING' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          salaryStructures: { select: { id: true }, take: 1 },
        },
        orderBy: { firstName: 'asc' },
      }),
    ])

    const paidIds = new Set(payslips.filter((p) => p.status === 'PAID').map((p) => p.staffId))
    const anyPayslipIds = new Set(payslips.map((p) => p.staffId))

    const teachersNotPaid = teachingStaff
      .filter((s) => !paidIds.has(s.id))
      .map((s) => ({
        name: `${s.firstName} ${s.lastName}`,
        employeeCode: s.employeeCode,
        hasSalaryStructure: s.salaryStructures.length > 0,
        payslipStatus: anyPayslipIds.has(s.id)
          ? (payslips.find((p) => p.staffId === s.id)?.status ?? 'UNKNOWN')
          : 'NONE',
      }))

    return {
      href: '/staff/payroll',
      data: {
        period: `${year}-${String(month).padStart(2, '0')}`,
        headcount: summary.headcount,
        onSalary: summary.onSalary,
        withoutSalaryStructure: summary.withoutSalary,
        payslipsGenerated: summary.generated,
        paidCount: summary.paidCount,
        draftTotal: money(summary.draftMinor),
        publishedTotal: money(summary.publishedMinor),
        paidTotal: money(summary.paidMinor),
        teachersNotPaidYet: teachersNotPaid.slice(0, 40),
        teachersNotPaidCount: teachersNotPaid.length,
      },
    }
  },
}

const examsOnDate: AssistantTool = {
  name: 'exams_on_date',
  description:
    'Exam papers scheduled on a calendar day: subject, class, teacher, time and room. Use for "what are the exam papers today", "exams tomorrow", "which papers are scheduled".',
  permission: 'exams.view',
  input: z.object({ date: dayArg }),
  async run(ctx, args) {
    const { date } = args as unknown as { date?: string }
    const on = parseDay(date, new Date())
    const day = attendanceDate(isoDay(on))

    const papers = await ctx.db.examSubject.findMany({
      where: {
        examDate: day,
        exam: { status: { not: 'ARCHIVED' } },
      },
      orderBy: [{ startTime: 'asc' }, { classSubject: { subject: { name: 'asc' } } }],
      select: {
        examDate: true,
        startTime: true,
        endTime: true,
        roomName: true,
        maxMarks: true,
        exam: { select: { id: true, name: true, status: true } },
        classSubject: {
          select: {
            classLevel: { select: { name: true } },
            subject: { select: { name: true, code: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
      },
    })

    return {
      href: '/exams',
      data: {
        date: formatDay(on),
        papersScheduled: papers.length,
        papers: papers.map((paper) => ({
          exam: paper.exam.name,
          examStatus: paper.exam.status,
          class: paper.classSubject.classLevel.name,
          subject: paper.classSubject.subject.name,
          teacher: paper.classSubject.teacher
            ? `${paper.classSubject.teacher.firstName} ${paper.classSubject.teacher.lastName}`
            : 'Unassigned',
          time:
            paper.startTime || paper.endTime
              ? `${paper.startTime ?? '—'}–${paper.endTime ?? '—'}`
              : null,
          room: paper.roomName,
          maxMarks: paper.maxMarks,
        })),
      },
    }
  },
}

const pendingExamMarks: AssistantTool = {
  name: 'pending_exam_marks',
  description:
    'Exam subjects that still need marks entered: which teacher owns the subject and how many marks are already saved. Use for "which teachers have not updated exam marks", "marks pending", "who has not entered marks".',
  permission: 'exams.marks',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Default 25.'),
  }),
  async run(ctx, args) {
    const a = args as unknown as { limit?: number }
    const exams = await ctx.db.exam.findMany({
      where: { status: { in: ['SCHEDULED', 'ONGOING', 'MARKS_ENTRY'] } },
      orderBy: { startsOn: 'desc' },
      take: 20,
      select: {
        id: true,
        name: true,
        status: true,
        subjects: {
          select: {
            id: true,
            examDate: true,
            classSubject: {
              select: {
                classLevel: { select: { name: true } },
                subject: { select: { name: true } },
                teacher: { select: { firstName: true, lastName: true } },
              },
            },
            _count: { select: { marks: true } },
          },
        },
      },
    })

    const pending = exams.flatMap((exam) =>
      exam.subjects
        .filter((subject) => subject._count.marks === 0)
        .map((subject) => ({
          exam: exam.name,
          examStatus: exam.status,
          class: subject.classSubject.classLevel.name,
          subject: subject.classSubject.subject.name,
          teacher: subject.classSubject.teacher
            ? `${subject.classSubject.teacher.firstName} ${subject.classSubject.teacher.lastName}`
            : 'Unassigned',
          examDate: subject.examDate ? toDateInput(subject.examDate) : null,
          marksEntered: subject._count.marks,
        })),
    )

    const byTeacher = new Map<string, number>()
    for (const row of pending) {
      byTeacher.set(row.teacher, (byTeacher.get(row.teacher) ?? 0) + 1)
    }

    return {
      href: '/exams',
      data: {
        subjectsStillWithoutMarks: pending.length,
        teachersWithPendingMarks: [...byTeacher.entries()]
          .map(([teacher, subjects]) => ({ teacher, subjectsPending: subjects }))
          .sort((a, b) => b.subjectsPending - a.subjectsPending),
        subjects: pending.slice(0, a.limit ?? 25),
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
  learningTopicGaps,
  assignmentTopicGaps,
  pendingLeave,
  expensesReport,
  payrollMonth,
  examsOnDate,
  pendingExamMarks,
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
