import type { AppContext } from '@/server/context'
import { attendanceDate, toDateInput } from '@/lib/dates'
import type { AnalyticsPeriod, MonthKey } from './analytics'

/**
 * Headline KPIs for the analytics dashboard, read only from the
 * LedgerMonthSummary pre-aggregate (never the journal), with the same
 * definitions as the Profit & Loss: income is credit − debit on INCOME
 * ledgers, expenses debit − credit on EXPENSE ledgers, split by the ledger's
 * expense nature (anything not DIRECT is indirect).
 */
export type KpiAccount = { id: string; type: string; expenseNature: string | null; systemKey: string | null; openingBalanceMinor: number }
export type KpiSummaryRow = { month: MonthKey; accountId: string; debitMinor: number; creditMinor: number }
export type KpiMonth = { month: MonthKey; incomeMinor: number; directMinor: number; indirectMinor: number; surplusMinor: number }

export function kpisFromSummary(rows: KpiSummaryRow[], accounts: KpiAccount[], months: MonthKey[]) {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const perMonth = new Map<MonthKey, KpiMonth>(months.map((m) => [m, { month: m, incomeMinor: 0, directMinor: 0, indirectMinor: 0, surplusMinor: 0 }]))
  for (const r of rows) {
    const a = byId.get(r.accountId)
    const m = perMonth.get(r.month)
    if (!a || !m) continue
    if (a.type === 'INCOME') m.incomeMinor += r.creditMinor - r.debitMinor
    else if (a.type === 'EXPENSE') {
      if (a.expenseNature === 'DIRECT') m.directMinor += r.debitMinor - r.creditMinor
      else m.indirectMinor += r.debitMinor - r.creditMinor
    }
  }
  const list = [...perMonth.values()].map((m) => ({ ...m, surplusMinor: m.incomeMinor - m.directMinor - m.indirectMinor }))
  const sum = (k: keyof Omit<KpiMonth, 'month'>) => list.reduce((s, m) => s + m[k], 0)
  return {
    months: list,
    incomeMinor: sum('incomeMinor'),
    directMinor: sum('directMinor'),
    indirectMinor: sum('indirectMinor'),
    expenseMinor: sum('directMinor') + sum('indirectMinor'),
    grossSurplusMinor: sum('incomeMinor') - sum('directMinor'),
    surplusMinor: sum('surplusMinor'),
  }
}

export type KpiStrip = ReturnType<typeof kpisFromSummary> & {
  /** Sundry Creditors closing balance (Cr positive) at the period end; null if the ledger does not exist. */
  payablesMinor: number | null
  payablesAccountId: string | null
  measured: { queries: number; ms: number; cached: boolean }
}

const TTL_MS = 60_000
const MAX_ENTRIES = 500
const cache = new Map<string, { at: number; value: Omit<KpiStrip, 'measured'> & { queries: number; ms: number } }>()

/** Test hook: drop cached KPIs. */
export function clearKpiCache() {
  cache.clear()
}

/**
 * KPI strip for one school and period. Cached in memory for a minute per
 * school and period (the summary itself is checked on every page load), so a
 * burst of reloads reads the database once. Two queries when not cached.
 */
export async function getKpiStrip(ctx: AppContext, period: AnalyticsPeriod, now = Date.now()): Promise<KpiStrip> {
  ctx.require('accounts.view')
  const key = `${ctx.tenant.id}:${period.from}:${period.to}`
  const hit = cache.get(key)
  if (hit && now - hit.at < TTL_MS) {
    const { queries, ms, ...value } = hit.value
    return { ...value, measured: { queries: 0, ms: 0, cached: true } }
  }

  const started = performance.now()
  const [accounts, grouped] = await Promise.all([
    ctx.db.ledgerAccount.findMany({
      where: { OR: [{ type: { in: ['INCOME', 'EXPENSE'] } }, { systemKey: 'SUNDRY_CREDITORS' }] },
      select: { id: true, type: true, expenseNature: true, systemKey: true, openingBalanceMinor: true },
    }),
    ctx.db.ledgerMonthSummary.groupBy({
      by: ['month', 'accountId'],
      where: { month: { lte: attendanceDate(period.to) } },
      _sum: { debitMinor: true, creditMinor: true },
    }),
  ])
  const n = (v: bigint | number | null | undefined) => Number(v ?? 0)
  const inPeriod: KpiSummaryRow[] = []
  const creditors = accounts.find((a) => a.systemKey === 'SUNDRY_CREDITORS') ?? null
  let creditorsMovement = 0
  for (const g of grouped) {
    const month = toDateInput(g.month).slice(0, 7) as MonthKey
    const debitMinor = n(g._sum.debitMinor)
    const creditMinor = n(g._sum.creditMinor)
    if (creditors && g.accountId === creditors.id) creditorsMovement += creditMinor - debitMinor
    if (month >= period.fromMonth) inPeriod.push({ month, accountId: g.accountId, debitMinor, creditMinor })
  }
  const kpis = kpisFromSummary(inPeriod, accounts, period.months)
  const ms = Math.round(performance.now() - started)
  const value = {
    ...kpis,
    payablesMinor: creditors ? creditorsMovement - creditors.openingBalanceMinor : null,
    payablesAccountId: creditors?.id ?? null,
    queries: 2,
    ms,
  }
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  cache.set(key, { at: now, value })
  const { queries, ms: _ms, ...rest } = value
  return { ...rest, measured: { queries, ms, cached: false } }
}
