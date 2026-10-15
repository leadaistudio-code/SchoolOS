import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { forbidden } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { financialYearRange } from '@/lib/periods'
import { accountBalances, balanceSheet, generalLedger, profitAndLoss } from '@/server/modules/accounts/service'
import { naturalBalance } from '@/server/modules/accounts/math'
import { feeReportsSummary } from '@/server/modules/finance/simplicity'
import { DRILL_GROUPS, drillHref, type Drill } from './descriptor'

export const DRILL_ROWS_PER_PAGE = 50

export type DrillRow = {
  id: string
  ref: string
  href?: string | null
  date?: string
  particulars: string
  detail?: string
  /** Ledger Vouchers only. */
  debitMinor?: number
  creditMinor?: number
  balanceMinor?: number
  /** Group Summary and registers. */
  amountMinor?: number
  figures?: { label: string; minor: number }[]
  /** Ledger voucher source, so the page can link to the document. */
  source?: { type: string; id: string | null }
}

export type DerivationLine = { op: '' | '+' | '−' | '='; label: string; minor: number; href?: string }

export type DrillView = {
  drill: Drill
  /** Tally report name: Ledger Vouchers, Group Summary, Income & Expenditure, Fee Register. */
  report: string
  title: string
  periodLabel: string
  valueMinor: number
  valueLabel: string
  formula: string
  derivation: DerivationLine[]
  layout: 'vouchers' | 'amounts'
  dateLabel?: string
  rows: DrillRow[]
  totalRows: number
  page: number
  pageSize: number
  /** The figure as the source report computes it against the sum of what is listed here. */
  check: { label: string; figureMinor: number; recomputedMinor: number; note: string }
}

function need(ctx: AppContext, permission: string) {
  if (!ctx.can(permission)) throw forbidden(`You do not have permission (${permission}) to open this figure.`)
}

function slice<T>(rows: T[], page: number) {
  const start = (page - 1) * DRILL_ROWS_PER_PAGE
  return rows.slice(start, start + DRILL_ROWS_PER_PAGE)
}

function periodLabel(from: string | undefined, to: string | undefined) {
  if (from && to) return `${from} to ${to}`
  if (to) return `As on ${to}`
  if (from) return `From ${from}`
  return 'All dates'
}

/** Resolves a verified descriptor into the figure, how it is derived and the entries behind it. */
export async function resolveDrill(ctx: AppContext, drill: Drill, rawPage = 1): Promise<DrillView> {
  const page = Math.max(1, Math.floor(rawPage) || 1)
  switch (drill.k) {
    case 'ledger':
      return ledgerDrill(ctx, drill, page)
    case 'group':
      return groupDrill(ctx, drill, page)
    case 'surplus':
      return surplusDrill(ctx, drill)
    case 'fee-collected':
    case 'fee-billed':
    case 'fee-outstanding':
      return feeDrill(ctx, drill, page)
  }
}

/* ------------------------------------------------------- ledger vouchers */

async function ledgerDrill(ctx: AppContext, d: Extract<Drill, { k: 'ledger' }>, page: number): Promise<DrillView> {
  need(ctx, 'accounts.view')
  // A closing-balance figure without a start date (Balance Sheet) opens on the
  // financial year of the date, with the earlier years brought forward.
  const from = d.f ?? financialYearRange(d.t).from
  const [gl, balances] = await Promise.all([
    generalLedger(ctx, { accountId: d.a, from, to: d.t }),
    accountBalances(ctx, { from, to: d.t }),
  ])
  const type = gl.account.type
  const source = balances.find((b) => b.id === gl.account.id)
  const natural = (minor: number) => naturalBalance(type, minor)
  const crNormal = type !== 'ASSET' && type !== 'EXPENSE'
  const periodMinor = natural(gl.debitMinor - gl.creditMinor)
  const value = d.v === 'period' ? periodMinor : natural(gl.closingMinor)
  const figure = source
    ? d.v === 'period' ? natural(source.debitMinor - source.creditMinor) : natural(source.closingMinor)
    : 0
  const recomputed = d.v === 'period'
    ? natural(gl.rows.reduce((t, r) => t + r.debitMinor - r.creditMinor, 0))
    : natural(gl.openingMinor + gl.rows.reduce((t, r) => t + r.debitMinor - r.creditMinor, 0))

  return {
    drill: d,
    report: 'Ledger Vouchers',
    title: `${gl.account.code} · ${gl.account.name}`,
    periodLabel: periodLabel(from, d.t),
    valueMinor: value,
    valueLabel: d.v === 'period'
      ? crNormal ? 'Net credit for the period' : 'Net debit for the period'
      : `Closing balance (${crNormal ? 'Cr' : 'Dr'} side shown positive)`,
    formula: d.v === 'period'
      ? crNormal ? 'Total credits − total debits in the period.' : 'Total debits − total credits in the period.'
      : 'Opening balance b/f + debits − credits = closing balance.',
    derivation: d.v === 'period'
      ? [
          { op: '', label: crNormal ? 'Credits' : 'Debits', minor: crNormal ? gl.creditMinor : gl.debitMinor },
          { op: '−', label: crNormal ? 'Debits' : 'Credits', minor: crNormal ? gl.debitMinor : gl.creditMinor },
          { op: '=', label: 'Net for the period', minor: periodMinor },
        ]
      : [
          { op: '', label: `Opening balance b/f on ${from}`, minor: natural(gl.openingMinor) },
          { op: crNormal ? '−' : '+', label: 'Debits', minor: gl.debitMinor },
          { op: crNormal ? '+' : '−', label: 'Credits', minor: gl.creditMinor },
          { op: '=', label: `Closing balance on ${d.t}`, minor: natural(gl.closingMinor) },
        ],
    layout: 'vouchers',
    rows: slice(gl.rows, page).map((r) => ({
      id: r.id,
      ref: r.number,
      date: toDateInput(r.date),
      particulars: r.particulars,
      detail: [r.voucherType, r.reference, r.narration].filter(Boolean).join(' · '),
      debitMinor: r.debitMinor,
      creditMinor: r.creditMinor,
      balanceMinor: r.balanceMinor,
      source: { type: r.sourceType, id: r.sourceId },
    })),
    totalRows: gl.rows.length,
    page,
    pageSize: DRILL_ROWS_PER_PAGE,
    check: {
      label: d.v === 'period' ? 'Ledger movement on the statement' : 'Ledger closing balance on the statement',
      figureMinor: figure,
      recomputedMinor: recomputed,
      note: 'Statement figure from the account balances against the sum of the vouchers listed.',
    },
  }
}

/* --------------------------------------------------------- group summary */

async function groupDrill(ctx: AppContext, d: Extract<Drill, { k: 'group' }>, page: number): Promise<DrillView> {
  need(ctx, 'accounts.view')
  const group = DRILL_GROUPS[d.g]
  const tenant = ctx.tenant.id
  const ledgerLink = (id: string, v: 'period' | 'closing', f?: string) => drillHref(tenant, { k: 'ledger', a: id, f, t: d.t, v })

  if (group.basis === 'period') {
    const from = d.f ?? financialYearRange(d.t).from
    const pl = await profitAndLoss(ctx, { from, to: d.t })
    const list = d.g === 'income' ? pl.income
      : d.g === 'direct' ? pl.directExpenses
      : d.g === 'indirect' ? pl.indirectExpenses
      : pl.expenses
    const figure = d.g === 'income' ? pl.incomeMinor
      : d.g === 'direct' ? pl.directMinor
      : d.g === 'indirect' ? pl.indirectMinor
      : pl.expenseMinor
    const rows: DrillRow[] = list.map((r) => ({
      id: r.id,
      ref: r.code,
      href: ledgerLink(r.id, 'period', from),
      particulars: r.name,
      amountMinor: r.amountMinor,
    }))
    const recomputed = list.reduce((t, r) => t + r.amountMinor, 0)
    return {
      drill: d,
      report: 'Group Summary',
      title: group.label,
      periodLabel: periodLabel(from, d.t),
      valueMinor: figure,
      valueLabel: `${group.label} for the period`,
      formula: d.g === 'income'
        ? 'Sum of (credits − debits) on every Income ledger in the period.'
        : 'Sum of (debits − credits) on every ledger in the group in the period.',
      derivation: [],
      layout: 'amounts',
      rows: slice(rows, page),
      totalRows: rows.length,
      page,
      pageSize: DRILL_ROWS_PER_PAGE,
      check: {
        label: `${group.label} on the Profit & Loss`,
        figureMinor: figure,
        recomputedMinor: recomputed,
        note: 'Profit & Loss group total against the sum of the ledgers listed.',
      },
    }
  }

  const bs = await balanceSheet(ctx, { asOf: d.t })
  const fy = financialYearRange(d.t)
  if (d.g === 'assets') {
    const rows: DrillRow[] = bs.assets.map((r) => ({
      id: r.id,
      ref: r.code,
      href: ledgerLink(r.id, 'closing'),
      particulars: r.name,
      amountMinor: r.amountMinor,
    }))
    return {
      drill: d,
      report: 'Group Summary',
      title: group.label,
      periodLabel: periodLabel(undefined, d.t),
      valueMinor: bs.assetsMinor,
      valueLabel: 'Closing balance of every asset ledger',
      formula: 'Sum of the debit closing balances of every Asset ledger on the date.',
      derivation: [],
      layout: 'amounts',
      rows: slice(rows, page),
      totalRows: rows.length,
      page,
      pageSize: DRILL_ROWS_PER_PAGE,
      check: {
        label: 'Assets on the Balance Sheet',
        figureMinor: bs.assetsMinor,
        recomputedMinor: bs.assets.reduce((t, r) => t + r.amountMinor, 0),
        note: 'Balance Sheet total against the sum of the ledgers listed.',
      },
    }
  }

  const rows: DrillRow[] = [
    ...bs.liabilities.map((r) => ({ id: r.id, ref: r.code, href: ledgerLink(r.id, 'closing'), particulars: r.name, detail: 'Liabilities', amountMinor: r.amountMinor })),
    ...bs.equity.map((r) => ({ id: r.id, ref: r.code, href: ledgerLink(r.id, 'closing'), particulars: r.name, detail: 'Capital Account', amountMinor: r.amountMinor })),
    {
      id: 'surplus-bf',
      ref: 'I&E b/f',
      particulars: 'Surplus brought forward (earlier years)',
      detail: `Income less expenses before ${fy.from}`,
      amountMinor: bs.retainedSurplusMinor,
    },
    {
      id: 'surplus-cy',
      ref: 'I&E',
      href: drillHref(tenant, { k: 'surplus', l: 'net', f: fy.from, t: d.t }),
      particulars: 'Surplus for the current year',
      detail: `Income & Expenditure ${fy.from} to ${d.t}`,
      amountMinor: bs.currentSurplusMinor,
    },
  ].filter((r) => r.amountMinor !== 0)
  return {
    drill: d,
    report: 'Group Summary',
    title: group.label,
    periodLabel: periodLabel(undefined, d.t),
    valueMinor: bs.fundsMinor,
    valueLabel: 'Liabilities + Capital Account + Income & Expenditure surplus',
    formula: 'Credit closing balances of Liability and Capital ledgers, plus the surplus brought forward and the surplus for the current year.',
    derivation: [
      { op: '', label: 'Liabilities', minor: bs.liabilitiesMinor },
      { op: '+', label: 'Capital Account', minor: bs.equityMinor },
      { op: '+', label: 'Surplus brought forward', minor: bs.retainedSurplusMinor },
      { op: '+', label: 'Surplus for the current year', minor: bs.currentSurplusMinor, href: drillHref(tenant, { k: 'surplus', l: 'net', f: fy.from, t: d.t }) },
      { op: '=', label: 'Liabilities & Funds', minor: bs.fundsMinor },
    ],
    layout: 'amounts',
    rows: slice(rows, page),
    totalRows: rows.length,
    page,
    pageSize: DRILL_ROWS_PER_PAGE,
    check: {
      label: 'Liabilities & Funds on the Balance Sheet',
      figureMinor: bs.fundsMinor,
      recomputedMinor: rows.reduce((t, r) => t + (r.amountMinor ?? 0), 0),
      note: 'Balance Sheet total against the sum of the lines listed.',
    },
  }
}

/* --------------------------------------------------- surplus (I&E result) */

async function surplusDrill(ctx: AppContext, d: Extract<Drill, { k: 'surplus' }>): Promise<DrillView> {
  need(ctx, 'accounts.view')
  const pl = await profitAndLoss(ctx, { from: d.f, to: d.t })
  const tenant = ctx.tenant.id
  const group = (g: 'income' | 'direct' | 'indirect') => drillHref(tenant, { k: 'group', g, f: d.f, t: d.t })
  const gross = d.l === 'gross'
  const value = gross ? pl.grossSurplusMinor : pl.surplusMinor
  const parts: DrillRow[] = [
    { id: 'income', ref: 'Income', href: group('income'), particulars: 'Income', amountMinor: pl.incomeMinor },
    { id: 'direct', ref: 'Direct', href: group('direct'), particulars: 'Less: Direct Expenses', amountMinor: -pl.directMinor },
    ...(gross ? [] : [{ id: 'indirect', ref: 'Indirect', href: group('indirect'), particulars: 'Less: Indirect Expenses', amountMinor: -pl.indirectMinor }]),
  ]
  return {
    drill: d,
    report: 'Income & Expenditure',
    title: gross ? 'Gross surplus' : value < 0 ? 'Net deficit' : 'Net surplus',
    periodLabel: periodLabel(d.f, d.t),
    valueMinor: value,
    valueLabel: gross ? 'Income less Direct Expenses' : 'Excess of income over expenditure',
    formula: gross ? 'Income − Direct Expenses.' : 'Income − Direct Expenses − Indirect Expenses.',
    derivation: [
      { op: '', label: 'Income', minor: pl.incomeMinor, href: group('income') },
      { op: '−', label: 'Direct Expenses', minor: pl.directMinor, href: group('direct') },
      ...(gross ? [] : [{ op: '−' as const, label: 'Indirect Expenses', minor: pl.indirectMinor, href: group('indirect') }]),
      { op: '=', label: gross ? 'Gross surplus' : 'Net surplus', minor: value },
    ],
    layout: 'amounts',
    rows: parts,
    totalRows: parts.length,
    page: 1,
    pageSize: DRILL_ROWS_PER_PAGE,
    check: {
      label: gross ? 'Gross surplus on the Profit & Loss' : 'Net surplus on the Profit & Loss',
      figureMinor: value,
      recomputedMinor: parts.reduce((t, r) => t + (r.amountMinor ?? 0), 0),
      note: 'Statement result against the group totals listed.',
    },
  }
}

/* ------------------------------------------------------------ fee figures */

type FeeDrill = Extract<Drill, { k: 'fee-collected' | 'fee-billed' | 'fee-outstanding' }>

/** Same date window as the fee reports summary: whole days, inclusive. */
function feeDateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined
  return {
    ...(from ? { gte: attendanceDate(from) } : {}),
    ...(to ? { lte: new Date(attendanceDate(to).getTime() + 86_399_999) } : {}),
  }
}

const studentName = (s: { firstName: string; lastName: string; admissionNo: string }) =>
  `${s.firstName} ${s.lastName}`.trim() + ` (${s.admissionNo})`

async function feeDrill(ctx: AppContext, d: FeeDrill, page: number): Promise<DrillView> {
  need(ctx, 'fees.report')
  const dates = feeDateFilter(d.f, d.t)
  const summary = await feeReportsSummary(ctx, d.f, d.t)
  const skip = (page - 1) * DRILL_ROWS_PER_PAGE
  const student = { select: { firstName: true, lastName: true, admissionNo: true } }

  if (d.k === 'fee-collected') {
    const where: Prisma.FeePaymentWhereInput = {
      status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] },
      ...(dates ? { paidAt: dates } : {}),
      ...(d.m ? { mode: d.m } : {}),
    }
    const [payments, agg] = await Promise.all([
      ctx.db.feePayment.findMany({
        where,
        orderBy: [{ paidAt: 'desc' }, { id: 'asc' }],
        skip,
        take: DRILL_ROWS_PER_PAGE,
        select: { id: true, amountMinor: true, mode: true, paidAt: true, reference: true, student, receipt: { select: { number: true } } },
      }),
      ctx.db.feePayment.aggregate({ where, _sum: { amountMinor: true }, _count: { _all: true } }),
    ])
    const modeLabel = d.m ? d.m.toLowerCase().replace('_', ' ') : null
    const figure = d.m
      ? summary.byMode.find((m) => m.mode === d.m)?._sum.amountMinor ?? 0
      : summary.collectedMinor
    return {
      drill: d,
      report: 'Fee Receipts Register',
      title: modeLabel ? `Fees collected · ${modeLabel}` : 'Fees collected',
      periodLabel: periodLabel(d.f, d.t),
      valueMinor: figure,
      valueLabel: 'Successful fee receipts',
      formula: 'Sum of successful and partly refunded fee receipts dated in the period (refunds are reported separately).',
      derivation: [],
      layout: 'amounts',
      dateLabel: 'Paid on',
      rows: payments.map((p) => ({
        id: p.id,
        ref: p.receipt?.number ?? 'Receipt',
        href: `/finance/payments/${p.id}`,
        date: p.paidAt ? toDateInput(p.paidAt) : undefined,
        particulars: studentName(p.student),
        detail: [p.mode.toLowerCase().replace('_', ' '), p.reference].filter(Boolean).join(' · '),
        amountMinor: p.amountMinor,
      })),
      totalRows: agg._count._all,
      page,
      pageSize: DRILL_ROWS_PER_PAGE,
      check: {
        label: modeLabel ? `Collected by ${modeLabel} on the fee report` : 'Collected on the fee report',
        figureMinor: figure,
        recomputedMinor: agg._sum.amountMinor ?? 0,
        note: 'Fee report figure against the sum of every receipt in this register.',
      },
    }
  }

  const outstanding = d.k === 'fee-outstanding'
  const where: Prisma.FeeInvoiceWhereInput = {
    status: { not: 'CANCELLED' },
    ...(dates ? { issuedOn: dates } : {}),
    ...(outstanding ? { balanceMinor: { not: 0 } } : {}),
  }
  const [invoices, agg] = await Promise.all([
    ctx.db.feeInvoice.findMany({
      where,
      orderBy: outstanding ? [{ dueOn: 'asc' }, { id: 'asc' }] : [{ issuedOn: 'desc' }, { id: 'asc' }],
      skip,
      take: DRILL_ROWS_PER_PAGE,
      select: { id: true, number: true, title: true, issuedOn: true, dueOn: true, totalMinor: true, paidMinor: true, balanceMinor: true, student },
    }),
    ctx.db.feeInvoice.aggregate({ where, _sum: { totalMinor: true, balanceMinor: true }, _count: { _all: true } }),
  ])
  const figure = outstanding ? summary.outstandingMinor : summary.billedMinor
  return {
    drill: d,
    report: 'Fee Invoices Register',
    title: outstanding ? 'Fees outstanding' : 'Fees billed',
    periodLabel: periodLabel(d.f, d.t),
    valueMinor: figure,
    valueLabel: outstanding ? 'Balance still due on the invoices' : 'Invoice totals raised',
    formula: outstanding
      ? 'Sum of the unpaid balance on every invoice issued in the period that is not cancelled.'
      : 'Sum of the total of every invoice issued in the period that is not cancelled (after concessions, including late fee).',
    derivation: [],
    layout: 'amounts',
    dateLabel: outstanding ? 'Due on' : 'Issued on',
    rows: invoices.map((i) => ({
      id: i.id,
      ref: i.number,
      href: `/finance/invoices/${i.id}`,
      date: toDateInput(outstanding ? i.dueOn : i.issuedOn),
      particulars: studentName(i.student),
      detail: i.title,
      figures: outstanding ? [{ label: 'Billed', minor: i.totalMinor }, { label: 'Paid', minor: i.paidMinor }] : undefined,
      amountMinor: outstanding ? i.balanceMinor : i.totalMinor,
    })),
    totalRows: agg._count._all,
    page,
    pageSize: DRILL_ROWS_PER_PAGE,
    check: {
      label: outstanding ? 'Outstanding on the fee report' : 'Expected billing on the fee report',
      figureMinor: figure,
      recomputedMinor: (outstanding ? agg._sum.balanceMinor : agg._sum.totalMinor) ?? 0,
      note: 'Fee report figure against the sum of every invoice in this register.',
    },
  }
}
