import type { AppContext } from '@/server/context'
import { attendanceDate } from '@/lib/dates'
import { monthLabel, monthsBetween, ratio, type ReportRange } from './range'

export type CollectionReport = Awaited<ReturnType<typeof collectionReport>>

type MonthRow = { month: string; amount: number; count: number }

const AGEING_ORDER = ['Not yet due', '1-30 days', '31-60 days', '61-90 days', 'Over 90 days']

/**
 * Fee collection and arrears.
 *
 * Two clocks run in this report and they are labelled apart wherever it is
 * shown: money *received* is counted inside the chosen range, while money
 * *owed* is a balance as of today. Blending them would let a school read a
 * healthy quarter as a healthy ledger.
 *
 * Every figure is aggregated in the database. A term of payments for a large
 * school is tens of thousands of rows and none of them are worth shipping
 * into Node to be added up.
 */
export async function collectionReport(ctx: AppContext, range: ReportRange) {
  ctx.require('reports.view')

  const db = ctx.db
  const tenantId = ctx.tenant.id
  const today = attendanceDate(new Date())

  // Ageing boundaries are computed here rather than as SQL intervals, so the
  // query compares a date column against plain date parameters.
  const [edge30, edge60, edge90] = [30, 60, 90].map((days) => {
    const edge = new Date(today)
    edge.setUTCDate(edge.getUTCDate() - days)
    return edge
  })

  const [
    collected,
    billed,
    outstanding,
    overdue,
    byMode,
    collectedByMonth,
    billedByMonth,
    byHead,
    byClass,
    ageing,
    defaulters,
  ] = await Promise.all([
    db.feePayment.aggregate({
      where: { status: 'SUCCESS', paidAt: { gte: range.from, lt: range.toExclusive } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
    db.feeInvoice.aggregate({
      where: { cancelledAt: null, issuedOn: { gte: range.from, lte: range.to } },
      _sum: { totalMinor: true, discountMinor: true },
      _count: { _all: true },
    }),
    db.feeInvoice.aggregate({
      where: { cancelledAt: null, balanceMinor: { gt: 0 } },
      _sum: { balanceMinor: true },
      _count: { _all: true },
    }),
    db.feeInvoice.aggregate({
      where: { cancelledAt: null, balanceMinor: { gt: 0 }, dueOn: { lt: today } },
      _sum: { balanceMinor: true },
      _count: { _all: true },
    }),
    db.feePayment.groupBy({
      by: ['mode'],
      where: { status: 'SUCCESS', paidAt: { gte: range.from, lt: range.toExclusive } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
    db.$queryRaw<MonthRow[]>`
      SELECT to_char(date_trunc('month', p."paidAt"), 'YYYY-MM') AS month,
             COALESCE(SUM(p."amountMinor"), 0)::float8 AS amount,
             COUNT(*)::int AS count
      FROM "FeePayment" p
      WHERE p."tenantId" = ${tenantId}
        AND p.status = 'SUCCESS'
        AND p."paidAt" >= ${range.from}
        AND p."paidAt" < ${range.toExclusive}
      GROUP BY 1
      ORDER BY 1`,
    db.$queryRaw<MonthRow[]>`
      SELECT to_char(date_trunc('month', i."issuedOn"), 'YYYY-MM') AS month,
             COALESCE(SUM(i."totalMinor"), 0)::float8 AS amount,
             COUNT(*)::int AS count
      FROM "FeeInvoice" i
      WHERE i."tenantId" = ${tenantId}
        AND i."cancelledAt" IS NULL
        AND i."issuedOn" >= ${range.from}
        AND i."issuedOn" <= ${range.to}
      GROUP BY 1
      ORDER BY 1`,
    db.feeInvoiceLine.groupBy({
      by: ['feeHeadId'],
      where: { invoice: { cancelledAt: null, issuedOn: { gte: range.from, lte: range.to } } },
      _sum: { amountMinor: true, discountMinor: true },
      _count: { _all: true },
    }),
    // The class comes from the current enrolment, not the invoice: an invoice
    // has no class of its own.
    db.$queryRaw<
      {
        id: string
        name: string
        numeric: number
        students: number
        billed: number
        collected: number
        outstanding: number
      }[]
    >`
      SELECT cl.id, cl.name, cl.numeric,
             COUNT(DISTINCT i."studentId")::int AS students,
             COALESCE(SUM(i."totalMinor"), 0)::float8 AS billed,
             COALESCE(SUM(i."paidMinor"), 0)::float8 AS collected,
             COALESCE(SUM(i."balanceMinor"), 0)::float8 AS outstanding
      FROM "FeeInvoice" i
      JOIN "Enrollment" e
        ON e."studentId" = i."studentId" AND e."tenantId" = i."tenantId" AND e."isCurrent" = true
      JOIN "ClassLevel" cl ON cl.id = e."classLevelId"
      WHERE i."tenantId" = ${tenantId} AND i."cancelledAt" IS NULL
      GROUP BY cl.id, cl.name, cl.numeric
      ORDER BY cl.numeric ASC`,
    db.$queryRaw<{ bucket: string; invoices: number; amount: number }[]>`
      SELECT CASE
               WHEN i."dueOn" >= ${today} THEN 'Not yet due'
               WHEN i."dueOn" >= ${edge30} THEN '1-30 days'
               WHEN i."dueOn" >= ${edge60} THEN '31-60 days'
               WHEN i."dueOn" >= ${edge90} THEN '61-90 days'
               ELSE 'Over 90 days'
             END AS bucket,
             COUNT(*)::int AS invoices,
             COALESCE(SUM(i."balanceMinor"), 0)::float8 AS amount
      FROM "FeeInvoice" i
      WHERE i."tenantId" = ${tenantId}
        AND i."cancelledAt" IS NULL
        AND i."balanceMinor" > 0
      GROUP BY 1`,
    db.feeInvoice.groupBy({
      by: ['studentId'],
      where: { cancelledAt: null, balanceMinor: { gt: 0 } },
      _sum: { balanceMinor: true },
      _min: { dueOn: true },
      _count: { _all: true },
      orderBy: { _sum: { balanceMinor: 'desc' } },
      take: 15,
    }),
  ])

  const students = defaulters.length
    ? await db.student.findMany({
        where: { id: { in: defaulters.map((d) => d.studentId) } },
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
    : []
  const studentById = new Map(students.map((s) => [s.id, s]))

  const headIds = byHead.map((h) => h.feeHeadId).filter((id): id is string => !!id)
  const heads = headIds.length
    ? await db.feeHead.findMany({
        where: { id: { in: headIds } },
        select: { id: true, name: true, code: true },
      })
    : []
  const headById = new Map(heads.map((h) => [h.id, h]))

  const collectedMinor = collected._sum.amountMinor ?? 0
  const billedMinor = billed._sum.totalMinor ?? 0

  const collectedIndex = new Map(collectedByMonth.map((r) => [r.month, r]))
  const billedIndex = new Map(billedByMonth.map((r) => [r.month, r]))

  return {
    range,
    summary: {
      collectedMinor,
      billedMinor,
      discountMinor: billed._sum.discountMinor ?? 0,
      outstandingMinor: outstanding._sum.balanceMinor ?? 0,
      overdueMinor: overdue._sum.balanceMinor ?? 0,
      invoicesIssued: billed._count._all,
      paymentsTaken: collected._count._all,
      invoicesOutstanding: outstanding._count._all,
      invoicesOverdue: overdue._count._all,
      /** Of everything billed inside this range, how much has been settled. */
      realisation: ratio(collectedMinor, billedMinor),
    },
    trend: monthsBetween(range.from, range.to).map((month) => ({
      month,
      label: monthLabel(month),
      collectedMinor: collectedIndex.get(month)?.amount ?? 0,
      billedMinor: billedIndex.get(month)?.amount ?? 0,
      payments: collectedIndex.get(month)?.count ?? 0,
    })),
    byMode: byMode
      .map((m) => ({ mode: m.mode, amountMinor: m._sum.amountMinor ?? 0, count: m._count._all }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
    byHead: byHead
      .map((h) => ({
        id: h.feeHeadId,
        name: h.feeHeadId ? (headById.get(h.feeHeadId)?.name ?? 'Removed head') : 'Ad-hoc line',
        code: h.feeHeadId ? (headById.get(h.feeHeadId)?.code ?? '—') : '—',
        billedMinor: (h._sum.amountMinor ?? 0) - (h._sum.discountMinor ?? 0),
        lines: h._count._all,
      }))
      .sort((a, b) => b.billedMinor - a.billedMinor),
    byClass: byClass.map((c) => ({
      id: c.id,
      name: c.name,
      students: c.students,
      billedMinor: c.billed,
      collectedMinor: c.collected,
      outstandingMinor: c.outstanding,
      realisation: ratio(c.collected, c.billed),
    })),
    ageing: AGEING_ORDER.map((bucket) => {
      const row = ageing.find((a) => a.bucket === bucket)
      return { bucket, invoices: row?.invoices ?? 0, amountMinor: row?.amount ?? 0 }
    }),
    defaulters: defaulters.map((d) => {
      const student = studentById.get(d.studentId)
      const enrolment = student?.enrollments[0]
      return {
        studentId: d.studentId,
        name: student ? `${student.firstName} ${student.lastName}`.trim() : 'Unknown student',
        admissionNo: student?.admissionNo ?? '—',
        className: enrolment ? `${enrolment.classLevel.name} ${enrolment.section.name}`.trim() : '—',
        outstandingMinor: d._sum.balanceMinor ?? 0,
        invoices: d._count._all,
        oldestDueOn: d._min.dueOn,
      }
    }),
  }
}
