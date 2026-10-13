import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { accessibleStudentIds } from '@/server/scope'
import { attendanceDate } from '@/lib/dates'
import { financialYearRange, schoolToday } from '@/lib/periods'

/** Financial-year months in order, April first. */
export const FY_MONTHS = ['04', '05', '06', '07', '08', '09', '10', '11', '12', '01', '02', '03'] as const
export const FY_MONTH_LABELS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

/** ₹5,000 overdue is what schools typically treat as a serious defaulter. */
const HIGH_OVERDUE_MINOR = 5_000_00

export const duesGridFilterSchema = z.object({
  fy: z.coerce.number().int().min(2000).max(2100).optional().catch(undefined),
  classLevelId: z.string().optional(),
  filter: z.enum(['defaulters', 'high', 'zero', 'all']).optional().catch(undefined),
  q: z.string().trim().max(80).optional(),
})

export type MonthCell = { billedMinor: number; balanceMinor: number; overdue: boolean } | null

export async function monthlyDuesGrid(ctx: AppContext, input: z.infer<typeof duesGridFilterSchema>) {
  ctx.require('fees.accounts')
  const today = schoolToday()
  const current = financialYearRange(today)
  const startYear = input.fy ?? Number(current.from.slice(0, 4))
  const from = `${startYear}-04-01`
  const to = `${startYear + 1}-03-31`
  const allowed = await accessibleStudentIds(ctx)

  const rows = await ctx.db.$queryRaw<{ studentId: string; month: string; billed: bigint | number; balance: bigint | number; overdue: bigint | number }[]>`
    SELECT "studentId",
           to_char("dueOn", 'MM') AS month,
           SUM("totalMinor") AS billed,
           SUM("balanceMinor") AS balance,
           SUM(CASE WHEN "dueOn" < ${attendanceDate(today)} THEN "balanceMinor" ELSE 0 END) AS overdue
    FROM "FeeInvoice"
    WHERE "tenantId" = ${ctx.tenant.id}
      AND "status"::text NOT IN ('CANCELLED', 'DRAFT')
      AND "dueOn" >= ${attendanceDate(from)}
      AND "dueOn" <= ${attendanceDate(to)}
    GROUP BY 1, 2`

  const allowedSet = allowed === null ? null : new Set(allowed)
  const byStudent = new Map<string, { cells: Map<string, MonthCell>; billed: number; balance: number; overdue: number }>()
  for (const r of rows) {
    if (allowedSet && !allowedSet.has(r.studentId)) continue
    const s = byStudent.get(r.studentId) ?? { cells: new Map(), billed: 0, balance: 0, overdue: 0 }
    const billed = Number(r.billed)
    const balance = Number(r.balance)
    const overdue = Number(r.overdue)
    s.cells.set(r.month, { billedMinor: billed, balanceMinor: balance, overdue: overdue > 0 })
    s.billed += billed
    s.balance += balance
    s.overdue += overdue
    byStudent.set(r.studentId, s)
  }

  const students = await ctx.db.student.findMany({
    where: {
      id: { in: [...byStudent.keys()] },
      deletedAt: null,
      ...(input.classLevelId ? { enrollments: { some: { isCurrent: true, classLevelId: input.classLevelId } } } : {}),
      ...(input.q
        ? {
            OR: [
              { firstName: { contains: input.q, mode: 'insensitive' } },
              { lastName: { contains: input.q, mode: 'insensitive' } },
              { admissionNo: { contains: input.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        select: {
          rollNumber: true,
          classLevel: { select: { name: true, numeric: true } },
          section: { select: { name: true } },
        },
      },
    },
  })

  const filter = input.filter ?? 'all'
  const list = students
    .map((s) => {
      const agg = byStudent.get(s.id)!
      const e = s.enrollments[0]
      return {
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`,
        admissionNo: s.admissionNo,
        className: e ? `${e.classLevel.name}${e.section ? ` ${e.section.name}` : ''}` : '',
        classOrder: e?.classLevel.numeric ?? 999,
        roll: e?.rollNumber ?? 9999,
        months: FY_MONTHS.map((m) => agg.cells.get(m) ?? null),
        billedMinor: agg.billed,
        balanceMinor: agg.balance,
        overdueMinor: agg.overdue,
      }
    })
    .filter((r) =>
      filter === 'defaulters' ? r.overdueMinor > 0
        : filter === 'high' ? r.overdueMinor >= HIGH_OVERDUE_MINOR
          : filter === 'zero' ? r.balanceMinor <= 0
            : true)
    .sort((a, b) => a.classOrder - b.classOrder || a.className.localeCompare(b.className) || a.roll - b.roll || a.name.localeCompare(b.name))

  const monthTotals = FY_MONTHS.map((_, i) => ({
    billedMinor: list.reduce((t, r) => t + (r.months[i]?.billedMinor ?? 0), 0),
    balanceMinor: list.reduce((t, r) => t + (r.months[i]?.balanceMinor ?? 0), 0),
  }))

  return {
    fyStart: startYear,
    fyLabel: `${startYear}-${String(startYear + 1).slice(2)}`,
    rows: list,
    monthTotals,
    totals: {
      billedMinor: list.reduce((t, r) => t + r.billedMinor, 0),
      balanceMinor: list.reduce((t, r) => t + r.balanceMinor, 0),
      overdueMinor: list.reduce((t, r) => t + r.overdueMinor, 0),
      defaulters: list.filter((r) => r.overdueMinor > 0).length,
    },
  }
}

export async function classOptions(ctx: AppContext) {
  return ctx.db.classLevel.findMany({
    where: { deletedAt: null, session: { isCurrent: true } },
    orderBy: [{ numeric: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  })
}
