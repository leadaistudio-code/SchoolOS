import Link from 'next/link'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import {
  AgingChart,
  CashFlowByMonthChart,
  CashFlowBySourceChart,
  ExpenseDonut,
  RebuildSummaryButton,
  WdvTrendChart,
} from '@/components/accounting/analytics-charts'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { getAnalyticsDashboard, getDrilldown, type DrillResult } from '@/server/modules/accounting/analytics-service'
import { drillParam, monthLabel, parseDrill, sliceColor as paletteAt, type Drill } from '@/server/modules/accounting/analytics'
import { AccountsTabs, Metric, moneyFmt } from '../ui'
import { AuditPane, stamp } from './audit-pane'

export const metadata = { title: 'Accounting analytics' }

const MODE_COPY = {
  none: 'no new entries since the last check',
  incremental: 'months with new entries recomputed',
  full: 'rebuilt from the whole journal',
  busy: 'another refresh was running; showing the figures as they stood',
  failed: 'could not be refreshed; showing the figures as they stood',
} as const

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('accounts.view')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Accounting analytics" />
        <AccountsTabs active="/accounts/analytics" />
        <Notice tone="info" title="Not enabled">Accounting analytics are switched off for this school.</Notice>
      </div>
    )
  }
  const params = await searchParams
  const data = await getAnalyticsDashboard(ctx, { from: params.from, to: params.to })
  const { period } = data
  const currency = ctx.tenant.currency || 'INR'
  const { money } = moneyFmt(currency)
  const signed = (minor: number) => (minor < 0 ? `(${money(minor)})` : money(minor))

  const base = { from: period.fromMonth, to: period.toMonth }
  const href = (d?: Drill) => `/accounts/analytics?${new URLSearchParams({ ...base, ...(d ? { drill: drillParam(d) } : {}) })}${d ? '#audit' : ''}`
  const closeHref = href()

  const drill = parseDrill(params.drill)
  let audit: DrillResult | null = null
  let auditError: string | null = null
  if (drill) {
    try {
      audit = await getDrilldown(ctx, drill, base, params.page)
    } catch (err) {
      if (!(err instanceof ApiException)) throw err
      auditError = err.message
    }
  }

  const { cashFlow, expenses, aging, wdv, freshness } = data
  const lastWdv = wdv.points.at(-1)
  const sliceColor = new Map(expenses.heads.filter((h) => h.amountMinor > 0).map((h, i) => [h.id, paletteAt(i)]))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounting analytics"
        description="Cash flow, fee dues aging, expense distribution and fixed asset values. Click any figure to see what it is made of."
        actions={ctx.can('accounts.manage') ? <RebuildSummaryButton /> : null}
      />
      <AccountsTabs active="/accounts/analytics" />

      <Card className="no-print p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-ink-muted">From month</span>
            <Input type="month" name="from" defaultValue={period.fromMonth} required className="mt-1 w-44" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">To month</span>
            <Input type="month" name="to" defaultValue={period.toMonth} required className="mt-1 w-44" />
          </label>
          <Button type="submit" variant="secondary">Apply</Button>
          {period.isDefault ? <span className="pb-2 text-xs text-ink-subtle">Financial year to date</span> : (
            <Link href="/accounts/analytics" className="pb-2 text-sm text-[var(--brand-600)] hover:underline">Financial year to date</Link>
          )}
        </form>
      </Card>

      {freshness.stale ? (
        <Notice tone="warning" title="Figures may be out of date">
          The ledger summary {MODE_COPY[freshness.outcome.mode]}. Last brought up to date {stamp(freshness.refreshedAt)}. Reload the page to try again.
        </Notice>
      ) : null}
      <p className="text-xs text-ink-subtle">
        Not real-time. Cash flow and expenses come from a monthly ledger summary checked when this page loaded ({stamp(freshness.refreshedAt)}:{' '}
        {MODE_COPY[freshness.outcome.mode]}
        {freshness.outcome.monthsRefreshed ? `, ${freshness.outcome.monthsRefreshed} month${freshness.outcome.monthsRefreshed === 1 ? '' : 's'}` : ''}
        {freshness.outcome.mode !== 'none' ? ` in ${freshness.outcome.durationMs} ms` : ''}). Dues and asset values were read from their registers at{' '}
        {stamp(data.generatedAt)}. Entries posted after that show on the next load.
      </p>

      {auditError ? <Notice tone="danger" title="Cannot open this breakdown">{auditError}</Notice> : null}
      {audit ? <AuditPane result={audit} money={money} closeHref={closeHref} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ------------------------------------------------------ cash flow */}
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Cash flow breakdown</CardTitle>
              <Link href={href({ metric: 'cash_flow', key: 'all' })} className="text-sm font-medium text-[var(--brand-600)] hover:underline">
                Audit all cash and bank movements
              </Link>
            </div>
            <p className="text-sm text-ink-muted">
              Money in and out of {cashFlow.accounts.map((a) => a.name).join(', ') || 'cash and bank'}, by where each entry came from.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Link href={href({ metric: 'cash_flow', key: 'all' })} className="block"><Metric label="Opening cash and bank" value={signed(cashFlow.openingMinor)} hint={`on ${period.from}`} /></Link>
              <Link href={href({ metric: 'cash_flow', key: 'all' })} className="block"><Metric label="Money in (receipts)" value={money(cashFlow.inflowMinor)} /></Link>
              <Link href={href({ metric: 'cash_flow', key: 'all' })} className="block"><Metric label="Money out (payments)" value={money(cashFlow.outflowMinor)} /></Link>
              <Link href={href({ metric: 'cash_flow', key: 'all' })} className="block">
                <Metric label="Closing cash and bank" value={signed(cashFlow.closingMinor)} tone={cashFlow.closingMinor < 0 ? 'danger' : undefined} hint={`on ${period.to}`} />
              </Link>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-medium text-ink">By source</p>
                <CashFlowBySourceChart
                  currency={currency}
                  data={cashFlow.groups.map((g) => ({ key: g.key, label: g.label, inflowMinor: g.inflowMinor, outflowMinor: g.outflowMinor, href: href({ metric: 'cash_flow', key: g.key }) }))}
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-ink">By month</p>
                <CashFlowByMonthChart
                  currency={currency}
                  data={cashFlow.months.map((m) => ({ label: monthLabel(m.month), inflowMinor: m.inflowMinor, outflowMinor: m.outflowMinor, netMinor: m.netMinor, href: href({ metric: 'cash_flow', key: m.month }) }))}
                />
              </div>
            </div>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Source</TH>
                    <TH align="right">Money in</TH>
                    <TH align="right">Money out</TH>
                    <TH align="right">Net</TH>
                  </tr>
                </THead>
                <TBody>
                  {cashFlow.groups.map((g) => (
                    <TR key={g.key}>
                      <TD>
                        <Link href={href({ metric: 'cash_flow', key: g.key })} className="text-[var(--brand-600)] hover:underline">{g.label}</Link>
                      </TD>
                      <TD align="right" className="tnum">{g.inflowMinor ? money(g.inflowMinor) : '—'}</TD>
                      <TD align="right" className="tnum">{g.outflowMinor ? money(g.outflowMinor) : '—'}</TD>
                      <TD align="right" className={`tnum ${g.netMinor < 0 ? 'text-[var(--danger)]' : ''}`}>{g.netMinor ? signed(g.netMinor) : '—'}</TD>
                    </TR>
                  ))}
                  <TR>
                    <TD className="font-semibold">Total</TD>
                    <TD align="right" className="tnum font-semibold">{money(cashFlow.inflowMinor)}</TD>
                    <TD align="right" className="tnum font-semibold">{money(cashFlow.outflowMinor)}</TD>
                    <TD align="right" className="tnum font-semibold">{signed(cashFlow.netMinor)}</TD>
                  </TR>
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------ dues aging */}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Dues aging</CardTitle>
            <p className="text-sm text-ink-muted">Unpaid fee invoice balances by days past the due date, as at {data.today}.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {aging ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link href={href({ metric: 'aging', key: 'all' })} className="block"><Metric label="Outstanding dues" value={money(aging.outstandingMinor)} hint="all open invoices" /></Link>
                  <Link href={href({ metric: 'aging', key: 'overdue' })} className="block">
                    <Metric label="Overdue" value={money(aging.overdueMinor)} tone={aging.overdueMinor > 0 ? 'danger' : undefined} hint="past the due date" />
                  </Link>
                </div>
                <AgingChart
                  currency={currency}
                  data={aging.buckets.map((b) => ({ key: b.key, label: b.label, valueMinor: b.amountMinor, overdue: b.inAging, href: href({ metric: 'aging', key: b.key }) }))}
                />
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {aging.buckets.map((b) => (
                    <li key={b.key} className="flex items-center justify-between py-1.5">
                      <Link href={href({ metric: 'aging', key: b.key })} className="text-[var(--brand-600)] hover:underline">
                        {b.label} <span className="text-xs text-ink-subtle">{b.range}</span>
                      </Link>
                      <span className="tnum">
                        {money(b.amountMinor)} <span className="text-xs text-ink-subtle">· {b.invoices} invoices</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Notice tone="info" title="Needs fee access">Dues aging lists student fee balances, so it needs the “View student fee accounts and dues” permission.</Notice>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------ expense distribution */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Expense distribution</CardTitle>
              <Link href={href({ metric: 'expense', key: 'all' })} className="text-sm font-medium text-[var(--brand-600)] hover:underline">Audit all expenses</Link>
            </div>
            <p className="text-sm text-ink-muted">Posted expenses by ledger head; totals match the Profit &amp; loss for {period.from} to {period.to}.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ExpenseDonut
              currency={currency}
              centerValue={money(expenses.totalMinor)}
              data={expenses.heads.map((h) => ({ key: h.id, label: h.name, valueMinor: h.amountMinor, href: href({ metric: 'expense', key: h.id }) }))}
            />
            {expenses.heads.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing posted to expense ledgers in this period.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-sm">
                {expenses.heads.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 py-1.5">
                    <Link href={href({ metric: 'expense', key: h.id })} className="flex min-w-0 items-center gap-2 text-[var(--brand-600)] hover:underline">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: sliceColor.get(h.id) ?? 'var(--border)' }} />
                      <span className="truncate">{h.code} · {h.name}</span>
                    </Link>
                    <span className="shrink-0 tnum">
                      {signed(h.amountMinor)} <span className="text-xs text-ink-subtle">{h.sharePct}%</span>
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between py-1.5 font-semibold">
                  <span>Total</span>
                  <span className="tnum">{signed(expenses.totalMinor)}</span>
                </li>
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------------- WDV trend */}
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader>
            <CardTitle>Fixed asset written-down value</CardTitle>
            <p className="text-sm text-ink-muted">Book value of assets held at each month end, from the asset register and posted depreciation runs (up to {wdv.upTo}).</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {wdv.points.length === 0 || wdv.points.every((p) => p.assets === 0) ? (
              <p className="text-sm text-ink-muted">No fixed assets were held in this period.</p>
            ) : (
              <>
                {lastWdv ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Link href={href({ metric: 'wdv', key: lastWdv.month })} className="block"><Metric label="Written-down value" value={money(lastWdv.wdvMinor)} hint={`at ${lastWdv.day < wdv.upTo ? lastWdv.day : wdv.upTo}`} tone="success" /></Link>
                    <Link href={href({ metric: 'wdv', key: lastWdv.month })} className="block"><Metric label="Cost of assets held" value={money(lastWdv.costMinor)} hint={`${lastWdv.assets} assets`} /></Link>
                    <Link href={href({ metric: 'wdv', key: lastWdv.month })} className="block"><Metric label="Accumulated depreciation" value={money(lastWdv.accumulatedMinor)} hint="brought forward + posted runs" /></Link>
                  </div>
                ) : null}
                <WdvTrendChart
                  currency={currency}
                  data={wdv.points.map((p) => ({ label: monthLabel(p.month), wdvMinor: p.wdvMinor, costMinor: p.costMinor, href: href({ metric: 'wdv', key: p.month }) }))}
                />
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {wdv.points.map((p) => (
                    <Link key={p.month} href={href({ metric: 'wdv', key: p.month })} className="text-[var(--brand-600)] hover:underline">
                      {monthLabel(p.month)}: {money(p.wdvMinor)}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
