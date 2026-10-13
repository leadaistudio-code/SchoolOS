import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { defaultRange, profitAndLoss } from '@/server/modules/accounts/service'
import { AccountsTabs, isoParam, Metric, moneyFmt, PeriodFilter } from '../ui'

export const metadata = { title: 'Profit & loss' }

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('accounts.view')
  const params = await searchParams
  const def = defaultRange()
  const from = isoParam(params.from, def.from)
  const to = isoParam(params.to, def.to)
  const pl = await profitAndLoss(ctx, { from, to })
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const surplus = pl.surplusMinor >= 0
  const pct = (part: number) => (pl.incomeMinor > 0 ? `${Math.round((part / pl.incomeMinor) * 100)}% of income` : undefined)
  const amount = (minor: number) => (minor < 0 ? `(${money(-minor)})` : money(minor))

  const Rows = ({ rows }: { rows: typeof pl.income }) =>
    rows.length === 0 ? (
      <li className="px-6 py-2 text-sm text-ink-muted">Nothing posted in this period.</li>
    ) : (
      <>
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-6 py-1.5 text-sm">
            <Link href={`/accounts/ledger?account=${r.id}&from=${from}&to=${to}`} className="text-ink-muted hover:text-[var(--brand-600)]">
              {r.name}
            </Link>
            <span className="tnum">{amount(r.amountMinor)}</span>
          </li>
        ))}
      </>
    )

  const Heading = ({ label, total, tone }: { label: string; total: number; tone?: string }) => (
    <li className={`flex items-center justify-between bg-surface-2 px-4 py-2 text-sm font-semibold ${tone ?? ''}`}>
      <span>{label}</span>
      <span className="tnum">{amount(total)}</span>
    </li>
  )

  const Result = ({ label, total, hint }: { label: string; total: number; hint?: string }) => (
    <li className="flex items-center justify-between border-y-2 border-line-strong px-4 py-2.5 text-sm font-semibold">
      <span>
        {label}
        {hint ? <span className="ml-2 text-xs font-normal text-ink-subtle">{hint}</span> : null}
      </span>
      <span className={`tnum ${total < 0 ? 'text-[var(--danger)]' : 'text-success'}`}>{amount(total)}</span>
    </li>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Income & expenditure"
        description="Profit and loss for the period: income, less direct expenses for gross surplus, less indirect expenses for net surplus."
        actions={
          <a href={`/api/v1/accounts/export?report=profit-loss&from=${from}&to=${to}`} className="text-sm font-medium text-[var(--brand-600)] hover:underline">
            Download CSV
          </a>
        }
      />
      <AccountsTabs active="/accounts/profit-loss" />
      <PeriodFilter from={from} to={to} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Total income" value={money(pl.incomeMinor)} />
        <Metric label="Direct expenses" value={money(pl.directMinor)} hint={pct(pl.directMinor)} />
        <Metric
          label="Gross surplus"
          value={money(pl.grossSurplusMinor)}
          tone={pl.grossSurplusMinor >= 0 ? 'success' : 'danger'}
          hint={pct(pl.grossSurplusMinor)}
        />
        <Metric label="Indirect expenses" value={money(pl.indirectMinor)} hint={pct(pl.indirectMinor)} />
        <Metric
          label={surplus ? 'Net surplus' : 'Net deficit'}
          value={money(pl.surplusMinor)}
          tone={surplus ? 'success' : 'danger'}
          hint={pct(pl.surplusMinor)}
        />
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">
          <Heading label="Income" total={pl.incomeMinor} />
          <Rows rows={pl.income} />
          <Heading label="Less: Direct expenses" total={pl.directMinor} />
          <Rows rows={pl.directExpenses} />
          <Result label="Gross surplus" total={pl.grossSurplusMinor} hint="Income minus the cost of teaching delivery" />
          <Heading label="Less: Indirect expenses" total={pl.indirectMinor} />
          <Rows rows={pl.indirectExpenses} />
          <Result label={surplus ? 'Net surplus' : 'Net deficit'} total={pl.surplusMinor} />
        </ul>
      </Card>
      <p className="text-xs text-ink-subtle">
        Cash basis: fees count as income when received (or when a cheque clears), and advance fees stay a liability until billed.
        Each expense head is direct or indirect; change it under{' '}
        <Link href="/finance/expenses/heads" className="text-[var(--brand-600)] hover:underline">Expense heads</Link>.
      </p>
    </div>
  )
}
