import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Notice } from '@/components/ui/states'
import { balanceSheet } from '@/server/modules/accounts/service'
import { financialYearRange, schoolToday } from '@/lib/periods'
import { viewedPeriodOr } from '@/server/view-session'
import { drillHref } from '@/server/drill/descriptor'
import { DrillFigure } from '@/components/drill-figure'
import { AccountsTabs, isoParam, moneyFmt, PeriodFilter } from '../ui'

export const metadata = { title: 'Balance sheet' }

type Row = { id: string; name: string; amountMinor: number }

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('accounts.view')
  const params = await searchParams
  const asOf = isoParam(params.to, (await viewedPeriodOr(ctx, { from: '', to: schoolToday() })).to)
  const bs = await balanceSheet(ctx, { asOf })
  const { money, signed } = moneyFmt(ctx.tenant.currency || 'INR')
  const ledgerDrill = (a: string) => drillHref(ctx.tenant.id, { k: 'ledger', a, t: asOf, v: 'closing' })
  const fyFrom = financialYearRange(asOf).from

  const Group = ({ title, rows, extra }: { title: string; rows: Row[]; extra?: { label: string; amount: number; href?: string }[] }) => (
    <div>
      <h3 className="bg-surface-2 px-4 py-2 text-sm font-semibold">{title}</h3>
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between px-4 py-2 text-sm">
            <Link href={`/accounts/ledger?account=${r.id}&to=${asOf}`} className="hover:text-[var(--brand-600)]">{r.name}</Link>
            <DrillFigure href={ledgerDrill(r.id)}>{signed(r.amountMinor)}</DrillFigure>
          </li>
        ))}
        {(extra ?? []).filter((e) => e.amount !== 0).map((e) => (
          <li key={e.label} className="flex justify-between px-4 py-2 text-sm">
            <span>{e.label}</span>
            <DrillFigure href={e.href}>{signed(e.amount)}</DrillFigure>
          </li>
        ))}
        {rows.length === 0 && !(extra ?? []).some((e) => e.amount !== 0) ? (
          <li className="px-4 py-2 text-sm text-ink-muted">—</li>
        ) : null}
      </ul>
    </div>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Balance sheet"
        description={`What the school owns and owes as on ${asOf}.`}
        actions={
          <a href={`/api/v1/accounts/export?report=balance-sheet&to=${asOf}`} className="text-sm font-medium text-[var(--brand-600)] hover:underline">
            Download CSV
          </a>
        }
      />
      <AccountsTabs active="/accounts/balance-sheet" />
      <PeriodFilter to={asOf} single />

      {bs.openingDifferenceMinor !== 0 ? (
        <Notice tone="warning" title="Opening balances do not match">
          Assets differ from liabilities + capital by {signed(bs.openingDifferenceMinor)}. Check the opening balances in the
          chart of accounts (usually set Capital / Opening Balance to the difference).
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex justify-between border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-base font-semibold">Liabilities & funds</h2>
            <DrillFigure href={drillHref(ctx.tenant.id, { k: 'group', g: 'funds', t: asOf })} className="font-semibold">{money(bs.fundsMinor)}</DrillFigure>
          </div>
          <Group
            title="Capital & reserves"
            rows={bs.equity}
            extra={[
              { label: 'Surplus brought forward (earlier years)', amount: bs.retainedSurplusMinor },
              {
                label: 'Surplus for the current year',
                amount: bs.currentSurplusMinor,
                href: drillHref(ctx.tenant.id, { k: 'surplus', l: 'net', f: fyFrom, t: asOf }),
              },
            ]}
          />
          <Group title="Liabilities" rows={bs.liabilities} />
        </Card>
        <Card className="overflow-hidden">
          <div className="flex justify-between border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-base font-semibold">Assets</h2>
            <DrillFigure href={drillHref(ctx.tenant.id, { k: 'group', g: 'assets', t: asOf })} className="font-semibold">{money(bs.assetsMinor)}</DrillFigure>
          </div>
          <Group title="Assets" rows={bs.assets} />
        </Card>
      </div>
    </div>
  )
}
