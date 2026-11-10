import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/prisma'
import { attendanceDate } from '@/lib/dates'
import { financialYearRange, schoolToday } from '@/lib/periods'
import { istDayBounds } from '@/server/modules/finance/dashboard'
import type { GroupSchool } from './access'

/*
 * Group figures are cash basis: money in is fees received (less completed
 * refunds) plus shop sales; money out is recorded expenses plus salaries paid
 * through payroll. Payroll never writes expense rows, so the two do not
 * overlap unless a school also types salaries in as expenses by hand.
 *
 * Every query here runs on the unscoped client with an explicit
 * `tenantId IN (...)`. Callers must pass only ids from groupScopeFor().
 */

const RECEIVED = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const
const PRESENT = new Set(['PRESENT', 'LATE', 'HALF_DAY'])

export type Range = { from: string; to: string }

export type Figures = {
  students: number
  admissions: number
  teachingStaff: number
  otherStaff: number
  monthlySalaryBillMinor: number
  attendanceMarked: number
  attendancePresent: number
  feesMinor: number
  refundsMinor: number
  otherIncomeMinor: number
  directExpenseMinor: number
  indirectExpenseMinor: number
  salariesMinor: number
  outstandingMinor: number
  overdueMinor: number
}

export type Totals = Figures & {
  staff: number
  incomeMinor: number
  expenseMinor: number
  costMinor: number
  profitMinor: number
  /** Profit as a share of income, 0–100; null when there was no income. */
  marginPct: number | null
  /** Students present today as a share of those marked, 0–100. */
  attendancePct: number | null
}

export type SchoolRow = GroupSchool & Totals

const ZERO: Figures = {
  students: 0,
  admissions: 0,
  teachingStaff: 0,
  otherStaff: 0,
  monthlySalaryBillMinor: 0,
  attendanceMarked: 0,
  attendancePresent: 0,
  feesMinor: 0,
  refundsMinor: 0,
  otherIncomeMinor: 0,
  directExpenseMinor: 0,
  indirectExpenseMinor: 0,
  salariesMinor: 0,
  outstandingMinor: 0,
  overdueMinor: 0,
}

export function withTotals(f: Figures): Totals {
  const incomeMinor = f.feesMinor - f.refundsMinor + f.otherIncomeMinor
  const expenseMinor = f.directExpenseMinor + f.indirectExpenseMinor
  const costMinor = expenseMinor + f.salariesMinor
  const profitMinor = incomeMinor - costMinor
  return {
    ...f,
    staff: f.teachingStaff + f.otherStaff,
    incomeMinor,
    expenseMinor,
    costMinor,
    profitMinor,
    marginPct: incomeMinor > 0 ? Math.round((profitMinor / incomeMinor) * 1000) / 10 : null,
    attendancePct: f.attendanceMarked > 0 ? Math.round((f.attendancePresent / f.attendanceMarked) * 1000) / 10 : null,
  }
}

/** Adds the schools up. Every figure is a count or an amount, so a plain sum is right. */
export function combine(rows: Figures[]): Totals {
  const sum = { ...ZERO }
  for (const row of rows) for (const key of Object.keys(ZERO) as (keyof Figures)[]) sum[key] += row[key]
  return withTotals(sum)
}

const n = (v: number | bigint | null | undefined) => Number(v ?? 0)

/** Per-school figures for `range`, plus head counts and balances as of today. */
export async function groupFigures(schools: GroupSchool[], range: Range): Promise<{ rows: SchoolRow[]; total: Totals; expenseByCategory: { category: string; amountMinor: number }[] }> {
  const ids = schools.map((s) => s.tenantId)
  if (ids.length === 0) return { rows: [], total: combine([]), expenseByCategory: [] }

  const inGroup = { tenantId: { in: ids } }
  const fromDay = attendanceDate(range.from)
  const toDay = attendanceDate(range.to)
  const since = istDayBounds(range.from).gte
  const until = istDayBounds(range.to).lt
  const today = attendanceDate(schoolToday())

  const [students, admissions, staff, attendance, fees, refunds, sales, expenses, categories, payroll, outstanding, overdue] =
    await Promise.all([
      prisma.student.groupBy({ by: ['tenantId'], where: { ...inGroup, status: 'ACTIVE', deletedAt: null }, _count: { _all: true } }),
      prisma.student.groupBy({
        by: ['tenantId'],
        where: { ...inGroup, deletedAt: null, admissionDate: { gte: fromDay, lte: toDay } },
        _count: { _all: true },
      }),
      prisma.staff.groupBy({
        by: ['tenantId', 'staffType'],
        where: { ...inGroup, deletedAt: null, leftOn: null },
        _count: { _all: true },
        _sum: { salaryMinor: true },
      }),
      prisma.studentAttendance.groupBy({ by: ['tenantId', 'status'], where: { ...inGroup, onDate: today }, _count: { _all: true } }),
      prisma.feePayment.groupBy({
        by: ['tenantId'],
        where: { ...inGroup, status: { in: [...RECEIVED] }, paidAt: { gte: since, lt: until } },
        _sum: { amountMinor: true },
      }),
      prisma.feeRefund.groupBy({
        by: ['tenantId'],
        where: { ...inGroup, status: 'SUCCESS', completedAt: { gte: since, lt: until } },
        _sum: { amountMinor: true },
      }),
      // Bills added to fees arrive later as fee receipts and are counted there.
      prisma.storeSale.groupBy({
        by: ['tenantId'],
        where: { ...inGroup, status: 'COMPLETED', paymentMode: { notIn: ['FEE_ACCOUNT', 'SPLIT'] }, soldAt: { gte: since, lt: until } },
        _sum: { totalMinor: true },
      }),
      prisma.schoolExpense.groupBy({
        by: ['tenantId', 'nature'],
        where: { ...inGroup, deletedAt: null, expenseDate: { gte: fromDay, lte: toDay } },
        _sum: { amountMinor: true },
      }),
      prisma.schoolExpense.groupBy({
        by: ['category'],
        where: { ...inGroup, deletedAt: null, expenseDate: { gte: fromDay, lte: toDay } },
        _sum: { amountMinor: true },
      }),
      prisma.staffPayslip.groupBy({
        by: ['tenantId'],
        where: { ...inGroup, status: 'PAID', paidAt: { gte: since, lt: until } },
        _sum: { netMinor: true },
      }),
      prisma.feeInvoice.groupBy({
        by: ['tenantId'],
        where: { ...inGroup, cancelledAt: null, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] } },
        _sum: { balanceMinor: true },
      }),
      prisma.feeInvoice.groupBy({
        by: ['tenantId'],
        where: { ...inGroup, cancelledAt: null, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] }, dueOn: { lt: today } },
        _sum: { balanceMinor: true },
      }),
    ])
  const splitPaid = await prisma.storeSalePayment.groupBy({
    by: ['tenantId'],
    where: { ...inGroup, mode: { not: 'FEE_ACCOUNT' }, sale: { status: 'COMPLETED', soldAt: { gte: since, lt: until } } },
    _sum: { amountMinor: true },
  })

  const rows = schools.map((school): SchoolRow => {
    const t = school.tenantId
    const mine = <T extends { tenantId: string }>(list: T[]) => list.filter((r) => r.tenantId === t)
    const one = <T extends { tenantId: string }>(list: T[]) => list.find((r) => r.tenantId === t)
    const staffRows = mine(staff)
    const attendanceRows = mine(attendance)
    const expenseRows = mine(expenses)
    return {
      ...school,
      ...withTotals({
        students: one(students)?._count._all ?? 0,
        admissions: one(admissions)?._count._all ?? 0,
        teachingStaff: staffRows.filter((r) => r.staffType === 'TEACHING').reduce((s, r) => s + r._count._all, 0),
        otherStaff: staffRows.filter((r) => r.staffType !== 'TEACHING').reduce((s, r) => s + r._count._all, 0),
        monthlySalaryBillMinor: staffRows.reduce((s, r) => s + n(r._sum.salaryMinor), 0),
        attendanceMarked: attendanceRows.filter((r) => r.status !== 'HOLIDAY').reduce((s, r) => s + r._count._all, 0),
        attendancePresent: attendanceRows.filter((r) => PRESENT.has(r.status)).reduce((s, r) => s + r._count._all, 0),
        feesMinor: n(one(fees)?._sum.amountMinor),
        refundsMinor: n(one(refunds)?._sum.amountMinor),
        otherIncomeMinor: n(one(sales)?._sum.totalMinor) + n(one(splitPaid)?._sum.amountMinor),
        directExpenseMinor: n(expenseRows.find((r) => r.nature === 'DIRECT')?._sum.amountMinor),
        indirectExpenseMinor: n(expenseRows.find((r) => r.nature === 'INDIRECT')?._sum.amountMinor),
        salariesMinor: n(one(payroll)?._sum.netMinor),
        outstandingMinor: n(one(outstanding)?._sum.balanceMinor),
        overdueMinor: n(one(overdue)?._sum.balanceMinor),
      }),
    }
  })

  return {
    rows,
    total: combine(rows),
    expenseByCategory: categories
      .map((c) => ({ category: c.category as string, amountMinor: n(c._sum.amountMinor) }))
      .filter((c) => c.amountMinor > 0)
      .sort((a, b) => b.amountMinor - a.amountMinor),
  }
}

export type TrendMonth = { key: string; label: string; incomeMinor: number; costMinor: number; profitMinor: number }

/** Money in and out, month by month, for the financial year so far. */
export async function groupTrend(tenantIds: string[]): Promise<TrendMonth[]> {
  if (tenantIds.length === 0) return []
  const today = schoolToday()
  const fy = financialYearRange(today)
  const since = istDayBounds(fy.from).gte
  const sinceDay = attendanceDate(fy.from)
  const ids = Prisma.join(tenantIds)
  const ist = (col: string) => Prisma.raw(`to_char(("${col}" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`)
  type Row = { month: string; total: bigint | number | null }

  const [fees, refunds, sales, expenses, payroll] = await Promise.all([
    prisma.$queryRaw<Row[]>`SELECT ${ist('paidAt')} AS month, SUM("amountMinor") AS total FROM "FeePayment"
      WHERE "tenantId" IN (${ids}) AND "status"::text IN ('SUCCESS','PARTIALLY_REFUNDED','REFUNDED') AND "paidAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT ${ist('completedAt')} AS month, SUM("amountMinor") AS total FROM "FeeRefund"
      WHERE "tenantId" IN (${ids}) AND "status"::text = 'SUCCESS' AND "completedAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT month, SUM(total) AS total FROM (
        SELECT ${ist('soldAt')} AS month, "totalMinor" AS total FROM "StoreSale"
        WHERE "tenantId" IN (${ids}) AND "status"::text = 'COMPLETED' AND "paymentMode" NOT IN ('FEE_ACCOUNT', 'SPLIT') AND "soldAt" >= ${since}
        UNION ALL
        SELECT to_char((s."soldAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month, p."amountMinor" AS total
        FROM "StoreSalePayment" p JOIN "StoreSale" s ON s.id = p."saleId"
        WHERE p."tenantId" IN (${ids}) AND p.mode <> 'FEE_ACCOUNT' AND s."status"::text = 'COMPLETED' AND s."soldAt" >= ${since}
      ) t GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT to_char("expenseDate", 'YYYY-MM') AS month, SUM("amountMinor") AS total FROM "SchoolExpense"
      WHERE "tenantId" IN (${ids}) AND "deletedAt" IS NULL AND "expenseDate" >= ${sinceDay} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT ${ist('paidAt')} AS month, SUM("netMinor") AS total FROM "StaffPayslip"
      WHERE "tenantId" IN (${ids}) AND "status"::text = 'PAID' AND "paidAt" >= ${since} GROUP BY 1`,
  ])

  const at = (rows: Row[], key: string) => n(rows.find((r) => r.month === key)?.total)
  const start = Number(fy.from.slice(0, 4))
  const out: TrendMonth[] = []
  for (let i = 0; i < 12; i++) {
    const m = ((i + 3) % 12) + 1
    const key = `${m >= 4 ? start : start + 1}-${String(m).padStart(2, '0')}`
    if (key > today.slice(0, 7)) break
    const incomeMinor = at(fees, key) - at(refunds, key) + at(sales, key)
    const costMinor = at(expenses, key) + at(payroll, key)
    out.push({
      key,
      label: new Date(`${key}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }),
      incomeMinor,
      costMinor,
      profitMinor: incomeMinor - costMinor,
    })
  }
  return out
}
