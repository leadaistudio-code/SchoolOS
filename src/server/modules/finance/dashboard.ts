import type { AppContext } from '@/server/context'
import { attendanceDate } from '@/lib/dates'
import { financialYearRange, schoolToday } from '@/lib/periods'
import { runLateFeeRules } from './jobs'

const RECEIVED = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const
const IST_OFFSET_MS = 330 * 60_000

/**
 * UTC instants bounding a school (IST) calendar day. Counter payments are
 * stored at UTC midnight of their date and gateway payments at the real
 * instant; both fall inside these bounds for the day the school means.
 */
export function istDayBounds(iso: string) {
  const start = new Date(attendanceDate(iso).getTime() - IST_OFFSET_MS)
  return { gte: start, lt: new Date(start.getTime() + 86_400_000) }
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Collected vs billed for the last `months` months, oldest first. */
export async function collectionTrend(ctx: AppContext, months = 6) {
  ctx.require('fees.view')
  const today = schoolToday()
  let y = Number(today.slice(0, 4))
  let m = Number(today.slice(5, 7))
  const keys: string[] = []
  for (let i = 0; i < months; i++) {
    keys.unshift(monthKey(y, m))
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  const first = `${keys[0]}-01`
  const since = istDayBounds(first).gte

  const [collected, billed] = await Promise.all([
    ctx.db.$queryRaw<{ month: string; total: bigint | number | null }[]>`
      SELECT to_char(("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month,
             SUM("amountMinor") AS total
      FROM "FeePayment"
      WHERE "tenantId" = ${ctx.tenant.id}
        AND "status"::text IN ('SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND "paidAt" >= ${since}
      GROUP BY 1`,
    ctx.db.$queryRaw<{ month: string; total: bigint | number | null }[]>`
      SELECT to_char("dueOn", 'YYYY-MM') AS month, SUM("totalMinor") AS total
      FROM "FeeInvoice"
      WHERE "tenantId" = ${ctx.tenant.id}
        AND "status"::text NOT IN ('CANCELLED', 'DRAFT')
        AND "dueOn" >= ${attendanceDate(first)}
        AND "dueOn" <= ${attendanceDate(today)}
      GROUP BY 1`,
  ])
  const c = new Map(collected.map((r) => [r.month, Number(r.total ?? 0)]))
  const b = new Map(billed.map((r) => [r.month, Number(r.total ?? 0)]))
  return keys.map((k) => ({
    month: k,
    label: new Date(`${k}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }),
    collectedMinor: c.get(k) ?? 0,
    billedMinor: b.get(k) ?? 0,
  }))
}

/** How this month's money came in: by mode, and office counter vs online. */
export async function channelBreakdown(ctx: AppContext) {
  ctx.require('fees.view')
  const today = schoolToday()
  const since = istDayBounds(`${today.slice(0, 7)}-01`).gte
  const rows = await ctx.db.feePayment.groupBy({
    by: ['mode', 'provider'],
    where: { status: { in: [...RECEIVED] }, paidAt: { gte: since } },
    _sum: { amountMinor: true },
    _count: { _all: true },
  })
  const byMode = new Map<string, { amountMinor: number; count: number }>()
  let officeMinor = 0
  let onlineMinor = 0
  for (const r of rows) {
    const amount = r._sum.amountMinor ?? 0
    const cur = byMode.get(r.mode) ?? { amountMinor: 0, count: 0 }
    cur.amountMinor += amount
    cur.count += r._count._all
    byMode.set(r.mode, cur)
    if (r.provider === 'manual') officeMinor += amount
    else onlineMinor += amount
  }
  return {
    modes: [...byMode.entries()]
      .map(([mode, v]) => ({ mode, ...v }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
    officeMinor,
    onlineMinor,
  }
}

/** Students with the largest overdue balance. */
export async function topDefaulters(ctx: AppContext, take = 5) {
  ctx.require('fees.accounts')
  const today = attendanceDate(schoolToday())
  const grouped = await ctx.db.feeInvoice.groupBy({
    by: ['studentId'],
    where: { balanceMinor: { gt: 0 }, dueOn: { lt: today }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
    _sum: { balanceMinor: true },
    _count: { _all: true },
    _min: { dueOn: true },
    orderBy: { _sum: { balanceMinor: 'desc' } },
    take,
  })
  const students = await ctx.db.student.findMany({
    where: { id: { in: grouped.map((g) => g.studentId) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
      },
    },
  })
  const byId = new Map(students.map((s) => [s.id, s]))
  return grouped.map((g) => {
    const s = byId.get(g.studentId)
    const e = s?.enrollments[0]
    return {
      studentId: g.studentId,
      name: s ? `${s.firstName} ${s.lastName}` : 'Unknown student',
      admissionNo: s?.admissionNo ?? '',
      className: e ? `${e.classLevel.name}${e.section ? ` ${e.section.name}` : ''}` : '',
      overdueMinor: g._sum.balanceMinor ?? 0,
      invoices: g._count._all,
      oldestDue: g._min.dueOn,
    }
  })
}

/** Everything the counter took on one day, for the cashier's closing sheet. */
export async function dayEndSheet(ctx: AppContext, iso: string) {
  ctx.require('fees.report')
  const bounds = istDayBounds(iso)
  const payments = await ctx.db.feePayment.findMany({
    where: {
      paidAt: bounds,
      status: { in: [...RECEIVED, 'PENDING', 'REVERSED', 'FAILED'] },
      OR: [{ status: { not: 'FAILED' } }, { mode: 'CHEQUE', provider: 'manual' }],
    },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      amountMinor: true,
      mode: true,
      status: true,
      provider: true,
      reference: true,
      providerPaymentId: true,
      billBookNo: true,
      collectedById: true,
      createdAt: true,
      receipt: { select: { number: true } },
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNo: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      },
    },
  })
  const collectorIds = [...new Set(payments.map((p) => p.collectedById).filter((v): v is string => !!v))]
  const collectors = await ctx.db.user.findMany({
    where: { id: { in: collectorIds } },
    select: { id: true, firstName: true, lastName: true },
  })
  const collectorName = new Map(collectors.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))

  const received = payments.filter((p) => (RECEIVED as readonly string[]).includes(p.status))
  const byMode = new Map<string, { amountMinor: number; count: number }>()
  const byCollector = new Map<string, { amountMinor: number; count: number; cashMinor: number }>()
  for (const p of received) {
    const m = byMode.get(p.mode) ?? { amountMinor: 0, count: 0 }
    m.amountMinor += p.amountMinor
    m.count++
    byMode.set(p.mode, m)
    const who = p.provider === 'manual' ? collectorName.get(p.collectedById ?? '') ?? 'Unknown' : 'Online / app'
    const c = byCollector.get(who) ?? { amountMinor: 0, count: 0, cashMinor: 0 }
    c.amountMinor += p.amountMinor
    c.count++
    if (p.mode === 'CASH') c.cashMinor += p.amountMinor
    byCollector.set(who, c)
  }
  const sum = (list: typeof payments) => list.reduce((t, p) => t + p.amountMinor, 0)
  const pendingCheques = payments.filter((p) => p.status === 'PENDING' && p.mode === 'CHEQUE')
  return {
    date: iso,
    rows: payments.map((p) => {
      const e = p.student.enrollments[0]
      return {
        id: p.id,
        receiptNumber: p.receipt?.number ?? '',
        student: `${p.student.firstName} ${p.student.lastName}`,
        admissionNo: p.student.admissionNo,
        className: e ? `${e.classLevel.name}${e.section ? ` ${e.section.name}` : ''}` : '',
        mode: p.mode,
        status: p.status,
        provider: p.provider,
        reference: p.reference ?? p.providerPaymentId ?? '',
        billBookNo: p.billBookNo ?? '',
        collector: p.provider === 'manual' ? collectorName.get(p.collectedById ?? '') ?? '' : 'Online',
        amountMinor: p.amountMinor,
        time: p.createdAt,
      }
    }),
    totalMinor: sum(received),
    cashMinor: byMode.get('CASH')?.amountMinor ?? 0,
    byMode: [...byMode.entries()].map(([mode, v]) => ({ mode, ...v })).sort((a, b) => b.amountMinor - a.amountMinor),
    byCollector: [...byCollector.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amountMinor - a.amountMinor),
    pendingChequeMinor: sum(pendingCheques),
    pendingChequeCount: pendingCheques.length,
    cancelledMinor: sum(payments.filter((p) => p.status === 'REVERSED')),
    cancelledCount: payments.filter((p) => p.status === 'REVERSED').length,
  }
}

/**
 * Fees collected against direct and indirect spend, month by month for the
 * financial year so far, plus this month's totals and net surplus.
 */
export async function incomeVsExpense(ctx: AppContext) {
  ctx.require('expenses.view')
  const today = schoolToday()
  const fy = financialYearRange(today)
  const since = istDayBounds(fy.from).gte

  const [collected, spent] = await Promise.all([
    ctx.db.$queryRaw<{ month: string; total: bigint | number | null }[]>`
      SELECT to_char(("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month,
             SUM("amountMinor") AS total
      FROM "FeePayment"
      WHERE "tenantId" = ${ctx.tenant.id}
        AND "status"::text IN ('SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND "paidAt" >= ${since}
      GROUP BY 1`,
    ctx.db.$queryRaw<{ month: string; nature: string; total: bigint | number | null }[]>`
      SELECT to_char("expenseDate", 'YYYY-MM') AS month, "nature"::text AS nature, SUM("amountMinor") AS total
      FROM "SchoolExpense"
      WHERE "tenantId" = ${ctx.tenant.id}
        AND "deletedAt" IS NULL
        AND "expenseDate" >= ${attendanceDate(fy.from)}
        AND "expenseDate" <= ${attendanceDate(today)}
      GROUP BY 1, 2`,
  ])

  const start = Number(fy.from.slice(0, 4))
  const currentKey = today.slice(0, 7)
  const months: { key: string; label: string; incomeMinor: number; directMinor: number; indirectMinor: number }[] = []
  for (let i = 0; i < 12; i++) {
    const m = ((i + 3) % 12) + 1
    const key = monthKey(m >= 4 ? start : start + 1, m)
    const pick = (nature: string) => Number(spent.find((r) => r.month === key && r.nature === nature)?.total ?? 0)
    months.push({
      key,
      label: new Date(`${key}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }),
      incomeMinor: Number(collected.find((r) => r.month === key)?.total ?? 0),
      directMinor: pick('DIRECT'),
      indirectMinor: pick('INDIRECT'),
    })
    if (key === currentKey) break
  }
  const sum = (k: 'incomeMinor' | 'directMinor' | 'indirectMinor') => months.reduce((t, m) => t + m[k], 0)
  const thisMonth = months[months.length - 1] ?? { incomeMinor: 0, directMinor: 0, indirectMinor: 0 }
  return {
    months,
    month: {
      incomeMinor: thisMonth.incomeMinor,
      directMinor: thisMonth.directMinor,
      indirectMinor: thisMonth.indirectMinor,
      netMinor: thisMonth.incomeMinor - thisMonth.directMinor - thisMonth.indirectMinor,
    },
    fy: {
      incomeMinor: sum('incomeMinor'),
      directMinor: sum('directMinor'),
      indirectMinor: sum('indirectMinor'),
      netMinor: sum('incomeMinor') - sum('directMinor') - sum('indirectMinor'),
    },
  }
}

/** "Apply late fines now" from the dashboard; same rules as the nightly job. */
export async function applyLateFinesNow(ctx: AppContext) {
  ctx.require('fees.structure')
  return runLateFeeRules({
    tenantId: ctx.tenant.id,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim() || 'School user',
  })
}
