import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { attendanceDate } from '@/lib/dates'
import { accessibleStudentIds } from '@/server/scope'
import { periodOrSession, type ViewSession } from '@/server/view-session'

/**
 * Who has paid their fees, by name.
 *
 * Two questions, answered separately because they disagree on purpose:
 * - status: for one session, is each enrolled student's bill fully paid,
 *   partly paid or not paid at all (cancelled and draft invoices ignored);
 * - payers: which students paid anything between two dates, whatever session
 *   the money was for.
 */

const optionalId = z.string().trim().max(40).optional().or(z.literal('').transform(() => undefined))
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal('').transform(() => undefined))

export const FEE_STATUSES = ['paid', 'partial', 'unpaid', 'none'] as const
export type FeeStatus = (typeof FEE_STATUSES)[number]

export const FEE_STATUS_LABEL: Record<FeeStatus, string> = {
  paid: 'Fully paid',
  partial: 'Partly paid',
  unpaid: 'Not paid',
  none: 'No fees billed',
}

/** Partly paid or not paid at all. */
export const DUE_STATUS = 'due'

export const studentFeeReportSchema = z.object({
  view: z.enum(['status', 'payers', 'month']).default('status'),
  status: z.enum(['all', DUE_STATUS, ...FEE_STATUSES]).default('all'),
  /** YYYY-MM: the month whose fees the month view checks. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  classLevelId: optionalId,
  sectionId: optionalId,
  q: z.string().trim().max(100).optional().or(z.literal('').transform(() => undefined)),
  from: optionalDate,
  to: optionalDate,
})

export type StudentFeeReportFilter = z.infer<typeof studentFeeReportSchema>

export function feeStatusOf(totalMinor: number, paidMinor: number, balanceMinor: number): FeeStatus {
  if (totalMinor <= 0) return 'none'
  if (balanceMinor <= 0) return 'paid'
  return paidMinor > 0 ? 'partial' : 'unpaid'
}

type Enrolled = {
  studentId: string
  name: string
  admissionNo: string
  classLevelId: string
  className: string
  classOrder: number
  sectionId: string | null
  sectionName: string
  rollNumber: string | null
  parentPhone: string | null
}

async function enrolledStudents(ctx: AppContext, session: ViewSession, filter: StudentFeeReportFilter): Promise<Enrolled[]> {
  const allowed = await accessibleStudentIds(ctx)
  const q = filter.q
  const rows = await ctx.db.enrollment.findMany({
    where: {
      sessionId: session.id,
      ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
      ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
      ...(allowed === null ? {} : { studentId: { in: allowed } }),
      student: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { admissionNo: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    },
    select: {
      studentId: true,
      rollNumber: true,
      classLevel: { select: { id: true, name: true, numeric: true } },
      section: { select: { id: true, name: true } },
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNo: true,
          guardians: {
            orderBy: { isPrimary: 'desc' },
            take: 1,
            select: { parent: { select: { phone: true } } },
          },
        },
      },
    },
  })
  return rows.map((r) => ({
    studentId: r.studentId,
    name: `${r.student.firstName} ${r.student.lastName}`.trim(),
    admissionNo: r.student.admissionNo,
    classLevelId: r.classLevel.id,
    className: r.classLevel.name,
    classOrder: r.classLevel.numeric,
    sectionId: r.section?.id ?? null,
    sectionName: r.section?.name ?? '',
    rollNumber: r.rollNumber == null ? null : String(r.rollNumber),
    parentPhone: r.student.guardians[0]?.parent.phone ?? null,
  }))
}

const byClassThenName = (a: Enrolled, b: Enrolled) =>
  a.classOrder - b.classOrder ||
  a.className.localeCompare(b.className) ||
  a.sectionName.localeCompare(b.sectionName) ||
  a.name.localeCompare(b.name)

export type StatusRow = Enrolled & { status: FeeStatus; billedMinor: number; paidMinor: number; balanceMinor: number }

export type ClassBreakdown = {
  classLevelId: string
  className: string
  students: number
  paid: number
  partial: number
  unpaid: number
  none: number
  billedMinor: number
  paidMinor: number
  balanceMinor: number
}

export async function studentFeeStatusReport(ctx: AppContext, session: ViewSession, filter: StudentFeeReportFilter) {
  ctx.require('fees.report')
  const students = await enrolledStudents(ctx, session, filter)
  const sums = students.length
    ? await ctx.db.feeInvoice.groupBy({
        by: ['studentId'],
        where: {
          sessionId: session.id,
          status: { notIn: ['CANCELLED', 'DRAFT'] },
          studentId: { in: students.map((s) => s.studentId) },
        },
        _sum: { totalMinor: true, paidMinor: true, balanceMinor: true },
      })
    : []
  const sumOf = new Map(sums.map((s) => [s.studentId, s._sum]))

  const all: StatusRow[] = students.sort(byClassThenName).map((s) => {
    const sum = sumOf.get(s.studentId)
    const billedMinor = sum?.totalMinor ?? 0
    const paidMinor = sum?.paidMinor ?? 0
    const balanceMinor = sum?.balanceMinor ?? 0
    return { ...s, billedMinor, paidMinor, balanceMinor, status: feeStatusOf(billedMinor, paidMinor, balanceMinor) }
  })

  const counts: Record<FeeStatus, number> = { paid: 0, partial: 0, unpaid: 0, none: 0 }
  const classes = new Map<string, ClassBreakdown>()
  let billedMinor = 0
  let paidMinor = 0
  let balanceMinor = 0
  for (const r of all) {
    counts[r.status]++
    billedMinor += r.billedMinor
    paidMinor += r.paidMinor
    balanceMinor += r.balanceMinor
    const c = classes.get(r.classLevelId) ?? {
      classLevelId: r.classLevelId, className: r.className, students: 0,
      paid: 0, partial: 0, unpaid: 0, none: 0, billedMinor: 0, paidMinor: 0, balanceMinor: 0,
    }
    c.students++
    c[r.status]++
    c.billedMinor += r.billedMinor
    c.paidMinor += r.paidMinor
    c.balanceMinor += r.balanceMinor
    classes.set(r.classLevelId, c)
  }

  return {
    session,
    counts,
    totalStudents: all.length,
    billedMinor,
    paidMinor,
    balanceMinor,
    byClass: [...classes.values()],
    rows: matchStatus(all, filter.status),
  }
}

function matchStatus<T extends { status: FeeStatus }>(rows: T[], status: StudentFeeReportFilter['status']) {
  if (status === 'all') return rows
  if (status === DUE_STATUS) return rows.filter((r) => r.status === 'partial' || r.status === 'unpaid')
  return rows.filter((r) => r.status === status)
}

/** The months of a session, YYYY-MM, oldest first. */
export function sessionMonths(session: ViewSession): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  let y = Number(session.startsOn.slice(0, 4))
  let m = Number(session.startsOn.slice(5, 7))
  const endKey = session.endsOn.slice(0, 7)
  for (let guard = 0; guard < 24; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push({ key, label: monthLabel(key) })
    if (key >= endKey) break
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

export function monthLabel(key: string) {
  return new Date(`${key}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** The month to show when none is chosen: this month if it is in the session, else the session's last month. */
export function defaultReportMonth(session: ViewSession, today: string) {
  const months = sessionMonths(session)
  const now = today.slice(0, 7)
  return months.find((m) => m.key === now)?.key ?? months[months.length - 1]?.key ?? now
}

export type MonthRow = StatusRow & { overallBalanceMinor: number }

/**
 * Fees for one month: invoices falling due in that month (the month every
 * generator bills into), with each student's whole-session balance alongside.
 */
export async function studentFeeMonthReport(ctx: AppContext, session: ViewSession, filter: StudentFeeReportFilter, month: string) {
  ctx.require('fees.report')
  const students = await enrolledStudents(ctx, session, filter)
  const [y, m] = month.split('-').map(Number) as [number, number]
  const first = attendanceDate(month + '-01')
  const last = attendanceDate(`${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`)
  const ids = students.map((s) => s.studentId)
  const base = { sessionId: session.id, status: { notIn: ['CANCELLED' as const, 'DRAFT' as const] }, studentId: { in: ids } }
  const [monthSums, overallSums] = ids.length
    ? await Promise.all([
        ctx.db.feeInvoice.groupBy({
          by: ['studentId'],
          where: { ...base, dueOn: { gte: first, lte: last } },
          _sum: { totalMinor: true, paidMinor: true, balanceMinor: true },
        }),
        ctx.db.feeInvoice.groupBy({ by: ['studentId'], where: base, _sum: { balanceMinor: true } }),
      ])
    : [[], []]
  const monthOf = new Map(monthSums.map((s) => [s.studentId, s._sum]))
  const overallOf = new Map(overallSums.map((s) => [s.studentId, s._sum.balanceMinor ?? 0]))

  const all: MonthRow[] = students.sort(byClassThenName).map((s) => {
    const sum = monthOf.get(s.studentId)
    const billedMinor = sum?.totalMinor ?? 0
    const paidMinor = sum?.paidMinor ?? 0
    const balanceMinor = sum?.balanceMinor ?? 0
    return {
      ...s,
      billedMinor,
      paidMinor,
      balanceMinor,
      overallBalanceMinor: overallOf.get(s.studentId) ?? 0,
      status: feeStatusOf(billedMinor, paidMinor, balanceMinor),
    }
  })

  const counts: Record<FeeStatus, number> = { paid: 0, partial: 0, unpaid: 0, none: 0 }
  let billedMinor = 0
  let paidMinor = 0
  let balanceMinor = 0
  let overallBalanceMinor = 0
  for (const r of all) {
    counts[r.status]++
    billedMinor += r.billedMinor
    paidMinor += r.paidMinor
    balanceMinor += r.balanceMinor
    overallBalanceMinor += r.overallBalanceMinor
  }
  const rows = matchStatus(all, filter.status)
  return {
    session,
    month,
    monthLabel: monthLabel(month),
    counts,
    totalStudents: all.length,
    billedMinor,
    paidMinor,
    balanceMinor,
    overallBalanceMinor,
    rows,
    listedOverallMinor: rows.reduce((t, r) => t + r.overallBalanceMinor, 0),
  }
}

export type PayerRow = {
  studentId: string
  name: string
  admissionNo: string
  className: string
  sectionName: string
  payments: number
  amountMinor: number
  lastPaidAt: Date | null
}

const RECEIVED = ['SUCCESS', 'PARTIALLY_REFUNDED'] as const

export async function studentFeePayersReport(ctx: AppContext, session: ViewSession, filter: StudentFeeReportFilter) {
  ctx.require('fees.report')
  const period = periodOrSession(session, filter.from, filter.to)
  const restrictToClass = !!(filter.classLevelId || filter.sectionId || filter.q)
  const enrolled = await enrolledStudents(ctx, session, filter)
  const enrolledById = new Map(enrolled.map((e) => [e.studentId, e]))
  const allowed = restrictToClass ? enrolled.map((e) => e.studentId) : await accessibleStudentIds(ctx)

  const paidAt = {
    ...(period.from ? { gte: attendanceDate(period.from) } : {}),
    ...(period.to ? { lte: new Date(attendanceDate(period.to).getTime() + 86_399_000) } : {}),
  }
  const where = {
    status: { in: [...RECEIVED] },
    paidAt,
    ...(allowed === null ? {} : { studentId: { in: allowed } }),
  }

  const [grouped, byMode] = await Promise.all([
    ctx.db.feePayment.groupBy({
      by: ['studentId'],
      where,
      _sum: { amountMinor: true },
      _count: { _all: true },
      _max: { paidAt: true },
    }),
    ctx.db.feePayment.groupBy({ by: ['mode'], where, _sum: { amountMinor: true }, _count: { _all: true } }),
  ])

  // Payers not enrolled in the viewed session (arrears, leavers) still count.
  const missing = grouped.map((g) => g.studentId).filter((id) => !enrolledById.has(id))
  const others = missing.length
    ? await ctx.db.student.findMany({
        where: { id: { in: missing } },
        select: {
          id: true, firstName: true, lastName: true, admissionNo: true,
          enrollments: {
            orderBy: { joinedOn: 'desc' },
            take: 1,
            select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      })
    : []
  const otherById = new Map(others.map((o) => [o.id, o]))

  const rows: PayerRow[] = grouped
    .map((g) => {
      const e = enrolledById.get(g.studentId)
      const o = otherById.get(g.studentId)
      return {
        studentId: g.studentId,
        name: e?.name ?? (o ? `${o.firstName} ${o.lastName}`.trim() : 'Unknown student'),
        admissionNo: e?.admissionNo ?? o?.admissionNo ?? '',
        className: e?.className ?? o?.enrollments[0]?.classLevel.name ?? '',
        sectionName: e?.sectionName ?? o?.enrollments[0]?.section?.name ?? '',
        payments: g._count._all,
        amountMinor: g._sum.amountMinor ?? 0,
        lastPaidAt: g._max.paidAt,
      }
    })
    .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }) || a.name.localeCompare(b.name))

  const amountMinor = rows.reduce((t, r) => t + r.amountMinor, 0)
  const payments = rows.reduce((t, r) => t + r.payments, 0)
  return {
    session,
    period,
    rows,
    students: rows.length,
    payments,
    amountMinor,
    averageMinor: rows.length ? Math.round(amountMinor / rows.length) : 0,
    byMode: byMode
      .map((m) => ({ mode: m.mode, payments: m._count._all, amountMinor: m._sum.amountMinor ?? 0 }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
  }
}

/** Classes and sections of the viewed session, for the filters. */
export async function sessionClassOptions(ctx: AppContext, session: ViewSession) {
  const classes = await ctx.db.classLevel.findMany({
    where: { sessionId: session.id, deletedAt: null },
    orderBy: [{ numeric: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, sections: { where: { deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } } },
  })
  return classes
}
