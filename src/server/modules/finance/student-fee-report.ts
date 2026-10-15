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

export const studentFeeReportSchema = z.object({
  view: z.enum(['status', 'payers']).default('status'),
  status: z.enum(['all', ...FEE_STATUSES]).default('all'),
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
    rows: filter.status === 'all' ? all : all.filter((r) => r.status === filter.status),
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
