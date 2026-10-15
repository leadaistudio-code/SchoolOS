import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Notice } from '@/components/ui/states'
import { LinkTabs } from '@/components/ui/tabs'
import { defaultRange, profitAndLoss } from '@/server/modules/accounts/service'
import { viewedPeriodOr } from '@/server/view-session'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { provisionalProfitAndLoss } from '@/server/modules/accounting/expense-approval-service'
import { STATUS_LABEL, stageNumber } from '@/server/modules/accounting/expense-approval'
import { drillHref } from '@/server/drill/descriptor'
import { DrillFigure } from '@/components/drill-figure'
import { AccountsTabs, isoParam, Metric, moneyFmt, PeriodFilter } from '../ui'

export const metadata = { title: 'Profit & loss' }

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('accounts.view')
  const params = await searchParams
  const def = await viewedPeriodOr(ctx, defaultRange())
  const from = isoParam(params.from, def.from)
  const to = isoParam(params.to, def.to)
  const flags = await getAccountingFlags(ctx.db)
  const provisional = flags.module && params.view === 'provisional'
  const { actual: pl, projection } = provisional
    ? await provisionalProfitAndLoss(ctx, { from, to })
    : { actual: await profitAndLoss(ctx, { from, to }), projection: null }
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const viewHref = (view?: string) => `/accounts/profit-loss?${new URLSearchParams({ from, to, ...(view ? { view } : {}) })}`
  const surplus = pl.surplusMinor >= 0
  const pct = (part: number) => (pl.incomeMinor > 0 ? `${Math.round((part / pl.incomeMinor) * 100)}% of income` : undefined)
  const amount = (minor: number) => (minor < 0 ? `(${money(-minor)})` : money(minor))
  const drill = {
    group: (g: 'income' | 'direct' | 'indirect') => drillHref(ctx.tenant.id, { k: 'group', g, f: from, t: to }),
    surplus: (l: 'gross' | 'net') => drillHref(ctx.tenant.id, { k: 'surplus', l, f: from, t: to }),
    ledger: (a: string) => drillHref(ctx.tenant.id, { k: 'ledger', a, f: from, t: to, v: 'period' }),
  }

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
            <DrillFigure href={drill.ledger(r.id)}>{amount(r.amountMinor)}</DrillFigure>
          </li>
        ))}
      </>
    )

  const ProvisionalRows = ({ direct }: { direct: boolean }) => {
    const items = (projection?.items ?? []).filter((i) => (i.expenseNature === 'DIRECT') === direct)
    return items.map((i) => (
      <li key={i.requestId} className="flex items-center justify-between bg-warning-bg px-6 py-1.5 text-sm">
        <Link href={`/accounts/expense-approvals/${i.requestId}`} className="text-ink-muted hover:text-[var(--brand-600)]">
          <span className="font-medium text-warning">[Provisional]</span> {i.accountName}: {i.title}
          <span className="ml-2 text-xs text-ink-subtle">{i.number} · stage {stageNumber(i.status)} · {STATUS_LABEL[i.status]}</span>
        </Link>
        <span className="tnum italic">{amount(i.amountMinor)}</span>
      </li>
    ))
  }

  const Heading = ({ label, total, tone, href }: { label: string; total: number; tone?: string; href?: string }) => (
    <li className={`flex items-center justify-between bg-surface-2 px-4 py-2 text-sm font-semibold ${tone ?? ''}`}>
      <span>{label}</span>
      <DrillFigure href={href}>{amount(total)}</DrillFigure>
    </li>
  )

  const Result = ({ label, total, hint, href }: { label: string; total: number; hint?: string; href?: string }) => (
    <li className="flex items-center justify-between border-y-2 border-line-strong px-4 py-2.5 text-sm font-semibold">
      <span>
        {label}
        {hint ? <span className="ml-2 text-xs font-normal text-ink-subtle">{hint}</span> : null}
      </span>
      <DrillFigure href={href} className={total < 0 ? 'text-[var(--danger)]' : 'text-success'}>{amount(total)}</DrillFigure>
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
      <PeriodFilter from={from} to={to} extra={{ view: provisional ? 'provisional' : undefined }} />
      {flags.module ? (
        <LinkTabs
          label="Basis"
          items={[
            { href: viewHref(), label: 'Actuals only', active: !provisional },
            { href: viewHref('provisional'), label: 'Include provisional (under approval)', active: provisional },
          ]}
        />
      ) : null}

      {projection ? (
        <>
          <Notice tone="warning" title="Estimate, not audited">
            Provisional rows are expenses submitted for approval and not yet posted (stages 2 to 5). They are not in any ledger, and they may still be
            returned, rejected or changed. Drafts, returned, rejected and withdrawn expenses are left out. Each counts once.
          </Notice>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Actual income" value={money(projection.actualIncomeMinor)} />
            <Metric label="Actual expenses" value={money(projection.actualExpenseMinor)} hint="posted only" />
            <Metric label="Provisional expenses" value={money(projection.provisionalMinor)} hint={`${projection.items.length} under approval`} />
            <Metric
              label={projection.projectedSurplusMinor >= 0 ? 'Projected net surplus' : 'Projected net deficit'}
              value={money(projection.projectedSurplusMinor)}
              tone={projection.projectedSurplusMinor >= 0 ? 'success' : 'danger'}
              hint="estimate"
            />
            <Metric
              label="Variance from actual surplus"
              value={amount(projection.varianceMinor)}
              tone={projection.varianceMinor < 0 ? 'danger' : undefined}
              hint={`actual ${pl.surplusMinor < 0 ? 'deficit' : 'surplus'} ${money(pl.surplusMinor)}`}
            />
          </div>
        </>
      ) : (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Total income" value={money(pl.incomeMinor)} href={drill.group('income')} />
        <Metric label="Direct expenses" value={money(pl.directMinor)} hint={pct(pl.directMinor)} href={drill.group('direct')} />
        <Metric
          label="Gross surplus"
          value={money(pl.grossSurplusMinor)}
          tone={pl.grossSurplusMinor >= 0 ? 'success' : 'danger'}
          hint={pct(pl.grossSurplusMinor)}
          href={drill.surplus('gross')}
        />
        <Metric label="Indirect expenses" value={money(pl.indirectMinor)} hint={pct(pl.indirectMinor)} href={drill.group('indirect')} />
        <Metric
          label={surplus ? 'Net surplus' : 'Net deficit'}
          value={money(pl.surplusMinor)}
          tone={surplus ? 'success' : 'danger'}
          hint={pct(pl.surplusMinor)}
          href={drill.surplus('net')}
        />
      </div>
      )}

      {projection ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            <Heading label="Income" total={pl.incomeMinor} href={drill.group('income')} />
            <Rows rows={pl.income} />
            <Heading label="Less: Direct expenses (actual + provisional)" total={projection.projectedDirectMinor} />
            <Rows rows={pl.directExpenses} />
            <ProvisionalRows direct />
            <Result label="Projected gross surplus" total={projection.projectedGrossSurplusMinor} hint="estimate" />
            <Heading label="Less: Indirect expenses (actual + provisional)" total={projection.projectedIndirectMinor} />
            <Rows rows={pl.indirectExpenses} />
            <ProvisionalRows direct={false} />
            <Result label={surplus ? 'Actual net surplus' : 'Actual net deficit'} total={pl.surplusMinor} hint="posted entries only" href={drill.surplus('net')} />
            <Result
              label={projection.projectedSurplusMinor >= 0 ? 'Projected net surplus' : 'Projected net deficit'}
              total={projection.projectedSurplusMinor}
              hint="estimate, including expenses under approval"
            />
          </ul>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            <Heading label="Income" total={pl.incomeMinor} href={drill.group('income')} />
            <Rows rows={pl.income} />
            <Heading label="Less: Direct expenses" total={pl.directMinor} href={drill.group('direct')} />
            <Rows rows={pl.directExpenses} />
            <Result label="Gross surplus" total={pl.grossSurplusMinor} hint="Income minus the cost of teaching delivery" href={drill.surplus('gross')} />
            <Heading label="Less: Indirect expenses" total={pl.indirectMinor} href={drill.group('indirect')} />
            <Rows rows={pl.indirectExpenses} />
            <Result label={surplus ? 'Net surplus' : 'Net deficit'} total={pl.surplusMinor} href={drill.surplus('net')} />
          </ul>
        </Card>
      )}
      <p className="text-xs text-ink-subtle">
        Cash basis: fees count as income when received (or when a cheque clears), and advance fees stay a liability until billed.
        Each expense head is direct or indirect; change it under{' '}
        <Link href="/finance/expenses/heads" className="text-[var(--brand-600)] hover:underline">Expense heads</Link>.
      </p>
    </div>
  )
}
