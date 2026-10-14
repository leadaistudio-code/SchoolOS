import { financialYearRange } from '@/lib/periods'

/**
 * Lightweight BI analytics (phase 7): pure rules shared by the service, the
 * page and the tests. Nothing here touches the database.
 *
 * Ledger widgets (cash flow, expense distribution) read LedgerMonthSummary, a
 * per-month total of journal lines that is refreshed when new entries appear.
 * Register widgets (dues aging, fixed asset WDV) read the fee and asset
 * registers directly through existing indexes; both are small per school.
 */

// ------------------------------------------------------------------ periods

export type MonthKey = string // YYYY-MM

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/
export const MAX_MONTHS = 36

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === 'string' && MONTH_RE.test(value)
}

export function monthOf(iso: string): MonthKey {
  return iso.slice(0, 7)
}

export function firstDay(month: MonthKey): string {
  return `${month}-01`
}

export function lastDay(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = []
  for (let m = from; m <= to && out.length <= MAX_MONTHS; m = addMonths(m, 1)) out.push(m)
  return out
}

export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

export type AnalyticsPeriod = { fromMonth: MonthKey; toMonth: MonthKey; from: string; to: string; months: MonthKey[]; isDefault: boolean }

/**
 * Whole calendar months only, so every ledger figure comes straight from the
 * monthly summary. Defaults to the financial year to date.
 */
export function resolvePeriod(raw: { from?: string; to?: string }, today: string): AnalyticsPeriod {
  const fy = financialYearRange(today)
  const defFrom = monthOf(fy.from)
  const defTo = monthOf(today)
  let fromMonth = isMonthKey(raw.from) ? raw.from : defFrom
  let toMonth = isMonthKey(raw.to) ? raw.to : defTo
  if (fromMonth > toMonth) [fromMonth, toMonth] = [toMonth, fromMonth]
  if (monthsBetween(fromMonth, toMonth).length > MAX_MONTHS) fromMonth = addMonths(toMonth, -(MAX_MONTHS - 1))
  return {
    fromMonth,
    toMonth,
    from: firstDay(fromMonth),
    to: lastDay(toMonth),
    months: monthsBetween(fromMonth, toMonth),
    isDefault: fromMonth === defFrom && toMonth === defTo,
  }
}

// ---------------------------------------------------------- summary refresh

export type SummaryState = { entryCount: number; watermark: Date | null } | null
export type RefreshMode = 'none' | 'incremental' | 'full'

/**
 * Journal entries are never edited or deleted by the app (corrections post a
 * reversal), so new entries are the only change to fold in. If the count does
 * not add up (a deleted entry, or one committed late with an older timestamp),
 * the summary is rebuilt from scratch rather than trusted. `newer` counts
 * entries created after the watermark (all of them when there is none).
 */
export function planRefresh(state: SummaryState, current: { count: number; newer: number }, force = false): RefreshMode {
  if (force || !state) return 'full'
  if (current.count !== state.entryCount + current.newer) return 'full'
  return current.newer === 0 ? 'none' : 'incremental'
}

// --------------------------------------------------------------- cash flow

export const CASH_FLOW_GROUPS = [
  { key: 'fees', label: 'Fee receipts', sources: ['FEE_PAYMENT'] },
  { key: 'refunds', label: 'Fee refunds', sources: ['FEE_REFUND'] },
  { key: 'expenses', label: 'Expenses', sources: ['EXPENSE'] },
  { key: 'payroll', label: 'Salaries', sources: ['PAYROLL'] },
  { key: 'vendors', label: 'Vendor payments', sources: ['VENDOR_PAYMENT', 'PURCHASE_VOUCHER', 'DEBIT_NOTE', 'VENDOR_ADJUSTMENT'] },
  { key: 'store', label: 'School store', sources: ['STORE_SALE', 'STORE_PURCHASE', 'STORE_STOCK'] },
  { key: 'assets', label: 'Fixed assets', sources: ['FIXED_ASSET', 'DEPRECIATION'] },
  { key: 'manual', label: 'Manual journals & transfers', sources: ['MANUAL'] },
] as const

export type CashFlowGroupKey = (typeof CASH_FLOW_GROUPS)[number]['key']

export function cashFlowGroupOf(sourceType: string): CashFlowGroupKey {
  return CASH_FLOW_GROUPS.find((g) => (g.sources as readonly string[]).includes(sourceType))?.key ?? 'manual'
}

export type SummaryRow = { month: MonthKey; accountId: string; sourceType: string; debitMinor: number; creditMinor: number; lineCount: number }

export type CashFlowGroupTotal = { key: CashFlowGroupKey; label: string; inflowMinor: number; outflowMinor: number; netMinor: number; lines: number }

/**
 * Receipts and payments through the cash and bank ledgers, by where the entry
 * came from. A debit to a cash or bank ledger is money in; a credit is money
 * out. A transfer between two of them shows on both sides and nets to zero.
 */
export function cashFlowBreakdown(rows: SummaryRow[], cashAccountIds: Set<string>, months: MonthKey[]) {
  const groups = new Map<CashFlowGroupKey, CashFlowGroupTotal>(
    CASH_FLOW_GROUPS.map((g) => [g.key, { key: g.key, label: g.label, inflowMinor: 0, outflowMinor: 0, netMinor: 0, lines: 0 }]),
  )
  const byMonth = new Map(months.map((m) => [m, { month: m, inflowMinor: 0, outflowMinor: 0, netMinor: 0 }]))
  for (const r of rows) {
    if (!cashAccountIds.has(r.accountId)) continue
    const g = groups.get(cashFlowGroupOf(r.sourceType))!
    g.inflowMinor += r.debitMinor
    g.outflowMinor += r.creditMinor
    g.lines += r.lineCount
    const m = byMonth.get(r.month)
    if (m) {
      m.inflowMinor += r.debitMinor
      m.outflowMinor += r.creditMinor
    }
  }
  for (const g of groups.values()) g.netMinor = g.inflowMinor - g.outflowMinor
  for (const m of byMonth.values()) m.netMinor = m.inflowMinor - m.outflowMinor
  const list = [...groups.values()]
  const inflowMinor = list.reduce((s, g) => s + g.inflowMinor, 0)
  const outflowMinor = list.reduce((s, g) => s + g.outflowMinor, 0)
  return { groups: list, months: [...byMonth.values()], inflowMinor, outflowMinor, netMinor: inflowMinor - outflowMinor }
}

// ------------------------------------------------------ expense distribution

export type ExpenseAccount = { id: string; code: string; name: string; expenseNature: string | null }

/** Natural (debit) balance moved in the period per expense ledger, as in the P&L. */
export function expenseDistribution(rows: SummaryRow[], accounts: ExpenseAccount[]) {
  const by = new Map<string, { debit: number; credit: number; lines: number }>()
  for (const r of rows) {
    const cur = by.get(r.accountId) ?? { debit: 0, credit: 0, lines: 0 }
    cur.debit += r.debitMinor
    cur.credit += r.creditMinor
    cur.lines += r.lineCount
    by.set(r.accountId, cur)
  }
  const heads = accounts
    .map((a) => {
      const m = by.get(a.id) ?? { debit: 0, credit: 0, lines: 0 }
      return { ...a, amountMinor: m.debit - m.credit, lines: m.lines }
    })
    .filter((h) => h.amountMinor !== 0)
    .sort((a, b) => b.amountMinor - a.amountMinor || a.code.localeCompare(b.code))
  const totalMinor = heads.reduce((s, h) => s + h.amountMinor, 0)
  return {
    heads: heads.map((h) => ({ ...h, sharePct: totalMinor > 0 ? Math.round((h.amountMinor / totalMinor) * 1000) / 10 : 0 })),
    totalMinor,
  }
}

// ---------------------------------------------------------------- dues aging

export const AGING_BUCKETS = [
  { key: 'not_due', label: 'Not yet due', range: 'due today or later', inAging: false },
  { key: 'd0_30', label: '0–30 days', range: '1 to 30 days past the due date', inAging: true },
  { key: 'd31_60', label: '31–60 days', range: '31 to 60 days past the due date', inAging: true },
  { key: 'd60_plus', label: '60+ days', range: 'more than 60 days past the due date', inAging: true },
] as const

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]['key']

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Inclusive due-date bounds for a bucket, as at `today`. Overdue means due before today. */
export function agingRange(key: AgingBucketKey, today: string): { gte?: string; lte?: string } {
  switch (key) {
    case 'not_due':
      return { gte: today }
    case 'd0_30':
      return { gte: shiftDay(today, -30), lte: shiftDay(today, -1) }
    case 'd31_60':
      return { gte: shiftDay(today, -60), lte: shiftDay(today, -31) }
    case 'd60_plus':
      return { lte: shiftDay(today, -61) }
  }
}

export function daysOverdue(dueOn: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000)
}

export function agingBucketOf(dueOn: string, today: string): AgingBucketKey {
  const days = daysOverdue(dueOn, today)
  if (days <= 0) return 'not_due'
  if (days <= 30) return 'd0_30'
  if (days <= 60) return 'd31_60'
  return 'd60_plus'
}

/** Invoice statuses that can still carry dues. */
export const OPEN_INVOICE_EXCLUDED = ['CANCELLED', 'DRAFT'] as const

// ----------------------------------------------------------------- WDV trend

export type WdvAsset = { id: string; costMinor: number; openingAccumulatedMinor: number; capitalisedOn: string; disposedOn: string | null }
export type WdvLine = { assetId: string; amountMinor: number; periodEnd: string }

/** Assets held at the end of `day`: capitalised by then and not yet disposed of. */
export function heldOn(asset: WdvAsset, day: string): boolean {
  return asset.capitalisedOn <= day && (!asset.disposedOn || asset.disposedOn > day)
}

/**
 * Book written-down value at each month end: cost, less depreciation brought
 * forward, less depreciation in runs posted for periods ending by that day.
 * Between runs the value stays flat; nothing is estimated.
 */
export function wdvSeries(assets: WdvAsset[], lines: WdvLine[], months: MonthKey[]) {
  const byAsset = new Map<string, WdvLine[]>()
  for (const l of lines) byAsset.set(l.assetId, [...(byAsset.get(l.assetId) ?? []), l])
  return months.map((month) => {
    const day = lastDay(month)
    let costMinor = 0
    let accumulatedMinor = 0
    let count = 0
    for (const a of assets) {
      if (!heldOn(a, day)) continue
      count++
      costMinor += a.costMinor
      accumulatedMinor += a.openingAccumulatedMinor + (byAsset.get(a.id) ?? []).filter((l) => l.periodEnd <= day).reduce((s, l) => s + l.amountMinor, 0)
    }
    return { month, day, assets: count, costMinor, accumulatedMinor, wdvMinor: costMinor - accumulatedMinor }
  })
}

// ---------------------------------------------------------------- drilldown

/**
 * cash_flow: a source group, one month (all sources) or `all`.
 * expense: one expense ledger id or `all`.
 * aging: one bucket, `overdue` (the three overdue buckets) or `all`.
 * wdv: one month end.
 */
export type Drill =
  | { metric: 'cash_flow'; key: CashFlowGroupKey | MonthKey | 'all' }
  | { metric: 'expense'; key: string }
  | { metric: 'aging'; key: AgingBucketKey | 'overdue' | 'all' }
  | { metric: 'wdv'; key: MonthKey }

export function parseDrill(raw: unknown): Drill | null {
  if (typeof raw !== 'string') return null
  const i = raw.indexOf(':')
  if (i < 1) return null
  const metric = raw.slice(0, i)
  const key = raw.slice(i + 1)
  if (metric === 'cash_flow' && (key === 'all' || isMonthKey(key) || CASH_FLOW_GROUPS.some((g) => g.key === key))) return { metric, key }
  if (metric === 'expense' && /^[a-zA-Z0-9_-]{1,40}$/.test(key)) return { metric, key }
  if (metric === 'aging' && (key === 'overdue' || key === 'all' || AGING_BUCKETS.some((b) => b.key === key))) {
    return { metric, key: key as AgingBucketKey | 'overdue' | 'all' }
  }
  if (metric === 'wdv' && isMonthKey(key)) return { metric, key }
  return null
}

export function drillParam(d: Drill): string {
  return `${d.metric}:${d.key}`
}

/** Slice colours for head-wise charts and their legends, in order. */
export const SLICE_PALETTE = [
  'var(--chart-students)',
  'var(--chart-fees)',
  'var(--chart-pending)',
  'var(--chart-admissions)',
  'var(--chart-transport)',
  'var(--chart-staff)',
  'var(--chart-leave)',
  'var(--chart-late)',
  'var(--chart-parents)',
  'var(--chart-overdue)',
] as const

export function sliceColor(i: number): string {
  return SLICE_PALETTE[i % SLICE_PALETTE.length]!
}

/** What each metric counts, for the audit pane. */
export const METRIC_DEFINITIONS = {
  cash_flow: {
    name: 'Cash flow by source',
    formula: 'Money in = sum of debits to cash and bank ledgers; money out = sum of credits to them; net = in − out. Grouped by the source of each journal entry.',
    included: 'Posted journal lines on the CASH and BANK ledgers and any ledger a payment mode is mapped to, dated within the period, including reversal entries (which offset the originals).',
    excluded: 'Lines on any other ledger; expenses still under approval; fee invoices not yet paid; opening balances (shown separately as opening cash).',
  },
  expense: {
    name: 'Expense by ledger head',
    formula: 'Amount = debits − credits on the expense ledger for entries dated within the period (the same figure as the Profit & loss).',
    included: 'Every posted journal line on the ledger, from any source (expenses, salaries, depreciation, store, manual journals), including reversals.',
    excluded: 'Expenses still under approval (see the provisional P&L); expenses recorded while the ledger was not auto-posting.',
  },
  aging: {
    name: 'Fee dues aging',
    formula: 'Outstanding = sum of invoice balances; days overdue = today − due date. 0–30, 31–60 and 60+ count only overdue invoices.',
    included: 'Fee invoices with a balance above zero that are issued, partly paid or overdue.',
    excluded: 'Cancelled and draft invoices; fully paid invoices; advance fees and credits not yet applied. Always as at today: past dates cannot be aged from current balances.',
  },
  wdv: {
    name: 'Fixed asset written-down value',
    formula: 'WDV at a month end = cost − depreciation brought forward − depreciation in posted runs for periods ending on or before that day.',
    included: 'Assets capitalised on or before the month end and not disposed of by then.',
    excluded: 'Cancelled assets; assets disposed of on or before the month end; depreciation runs not yet approved and posted.',
  },
} as const
