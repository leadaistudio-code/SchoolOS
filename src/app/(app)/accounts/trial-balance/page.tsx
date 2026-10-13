import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { ACCOUNT_TYPES, defaultRange, trialBalance } from '@/server/modules/accounts/service'
import { AccountsTabs, isoParam, Metric, moneyFmt, PeriodFilter } from '../ui'

export const metadata = { title: 'Trial balance' }

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('accounts.view')
  const params = await searchParams
  const def = defaultRange()
  const from = isoParam(params.from, def.from)
  const to = isoParam(params.to, def.to)
  const tb = await trialBalance(ctx, { from, to })
  const { money, drCr } = moneyFmt(ctx.tenant.currency || 'INR')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trial balance"
        description="Closing balance of every account. Total debits must equal total credits."
        actions={
          <div className="flex items-center gap-3 text-sm">
            <a href={`/api/v1/accounts/export?report=trial-balance&from=${from}&to=${to}`} className="font-medium text-[var(--brand-600)] hover:underline">
              Download CSV
            </a>
            {ctx.can('fees.tally') ? (
              <Link href="/finance/tally/trial-balance" className="font-medium text-[var(--brand-600)] hover:underline">
                Compare with Tally
              </Link>
            ) : null}
          </div>
        }
      />
      <AccountsTabs active="/accounts/trial-balance" />
      <PeriodFilter from={from} to={to} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Period" value={`${from} → ${to}`} />
        <Metric label="Closing debit" value={money(tb.totals.closingDrMinor)} />
        <Metric label="Closing credit" value={money(tb.totals.closingCrMinor)} />
        <Metric
          label="Balanced"
          value={tb.totals.differenceMinor === 0 ? 'Yes' : `Off by ${drCr(tb.totals.differenceMinor)}`}
          tone={tb.totals.differenceMinor === 0 ? 'success' : 'danger'}
          hint={tb.totals.differenceMinor !== 0 ? 'Opening balances entered in the chart of accounts do not net to zero' : undefined}
        />
      </div>

      <Card className="overflow-hidden">
        {tb.rows.length === 0 ? (
          <EmptyState title="No balances yet" description="Post receipts, expenses or vouchers to see the trial balance." />
        ) : (
          <TableWrap sticky>
            <Table>
              <THead sticky>
                <tr>
                  <TH>Account</TH>
                  <TH align="right">Opening</TH>
                  <TH align="right">Debit</TH>
                  <TH align="right">Credit</TH>
                  <TH align="right">Closing Dr</TH>
                  <TH align="right">Closing Cr</TH>
                </tr>
              </THead>
              <TBody>
                {ACCOUNT_TYPES.filter((t) => tb.rows.some((r) => r.type === t.type)).flatMap((t) => [
                  <tr key={`g:${t.type}`} className="bg-surface-2">
                    <td colSpan={6} className="px-3 py-2 text-sm font-semibold text-ink">{t.label}</td>
                  </tr>,
                  ...tb.rows.filter((r) => r.type === t.type).map((r) => (
                    <TR key={r.id}>
                      <TD className="pl-6">
                        <Link href={`/accounts/ledger?account=${r.id}&from=${from}&to=${to}`} className="text-ink hover:text-[var(--brand-600)]">
                          {r.code} · {r.name}
                        </Link>
                      </TD>
                      <TD align="right">{drCr(r.openingMinor)}</TD>
                      <TD align="right">{r.debitMinor ? money(r.debitMinor) : ''}</TD>
                      <TD align="right">{r.creditMinor ? money(r.creditMinor) : ''}</TD>
                      <TD align="right">{r.closingMinor > 0 ? money(r.closingMinor) : ''}</TD>
                      <TD align="right">{r.closingMinor < 0 ? money(r.closingMinor) : ''}</TD>
                    </TR>
                  )),
                ])}
                <tr className="border-t-2 border-line-strong font-semibold">
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right tnum">{money(tb.totals.debitMinor)}</td>
                  <td className="px-3 py-2 text-right tnum">{money(tb.totals.creditMinor)}</td>
                  <td className="px-3 py-2 text-right tnum">{money(tb.totals.closingDrMinor)}</td>
                  <td className="px-3 py-2 text-right tnum">{money(tb.totals.closingCrMinor)}</td>
                </tr>
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
