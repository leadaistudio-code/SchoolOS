import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { formatDay } from '@/lib/dates'
import { accountOptions, defaultRange, generalLedger } from '@/server/modules/accounts/service'
import { viewedPeriodOr } from '@/server/view-session'
import { AccountsTabs, isoParam, Metric, moneyFmt, PeriodFilter, SOURCE_LABEL, sourceHref } from '../ui'

export const metadata = { title: 'General ledger' }

const GROUPS = [
  { type: 'ASSET', label: 'Assets' },
  { type: 'LIABILITY', label: 'Liabilities' },
  { type: 'EQUITY', label: 'Capital' },
  { type: 'INCOME', label: 'Income' },
  { type: 'EXPENSE', label: 'Expenses' },
]

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('accounts.view')
  const params = await searchParams
  const def = await viewedPeriodOr(ctx, defaultRange())
  const from = isoParam(params.from, def.from)
  const to = isoParam(params.to, def.to)
  const accounts = await accountOptions(ctx, { includeInactive: true })
  const accountId = accounts.some((a) => a.id === params.account)
    ? params.account!
    : accounts.find((a) => a.systemKey === 'CASH')?.id ?? accounts[0]?.id
  const ledger = accountId ? await generalLedger(ctx, { accountId, from, to }) : null
  const { money, drCr } = moneyFmt(ctx.tenant.currency || 'INR')

  return (
    <div className="space-y-4">
      <PageHeader
        title="General ledger"
        description="Every entry posted to one account, with a running balance — like a Tally ledger."
        actions={
          ledger ? (
            <a
              href={`/api/v1/accounts/export?report=ledger&account=${ledger.account.id}&from=${from}&to=${to}`}
              className="text-sm font-medium text-[var(--brand-600)] hover:underline"
            >
              Download CSV
            </a>
          ) : null
        }
      />
      <AccountsTabs active="/accounts/ledger" />

      <PeriodFilter from={from} to={to}>
        <label className="block text-sm">
          <span className="text-ink-muted">Account</span>
          <Select name="account" defaultValue={accountId} className="mt-1 w-72">
            {GROUPS.map((g) => (
              <optgroup key={g.type} label={g.label}>
                {accounts.filter((a) => a.type === g.type).map((a) => (
                  <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </label>
      </PeriodFilter>

      {!ledger ? (
        <Card><EmptyState title="No accounts yet" description="Open the chart of accounts to get started." /></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Opening balance" value={drCr(ledger.openingMinor)} hint={`as on ${from}`} />
            <Metric label="Total debit" value={money(ledger.debitMinor)} />
            <Metric label="Total credit" value={money(ledger.creditMinor)} />
            <Metric label="Closing balance" value={drCr(ledger.closingMinor)} hint={`as on ${to}`} />
          </div>
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-base font-semibold">{ledger.account.code} · {ledger.account.name}</h2>
            </div>
            {ledger.rows.length === 0 ? (
              <EmptyState title="No entries in this period" description="Change the dates or pick another account." />
            ) : (
              <TableWrap sticky>
                <Table>
                  <THead sticky>
                    <tr>
                      <TH>Date</TH>
                      <TH>Voucher</TH>
                      <TH>Particulars</TH>
                      <TH>Narration</TH>
                      <TH align="right">Debit</TH>
                      <TH align="right">Credit</TH>
                      <TH align="right">Balance</TH>
                    </tr>
                  </THead>
                  <TBody>
                    <tr className="bg-surface-2 text-sm">
                      <td className="px-3 py-2" colSpan={6}>Opening balance</td>
                      <td className="px-3 py-2 text-right tnum">{drCr(ledger.openingMinor)}</td>
                    </tr>
                    {ledger.rows.map((r) => {
                      const href = sourceHref(r.sourceType, r.sourceId)
                      return (
                        <TR key={r.id}>
                          <TD className="whitespace-nowrap">{formatDay(r.date)}</TD>
                          <TD>
                            <Link href={`/accounts/journals/${r.entryId}`} className="text-[var(--brand-600)] hover:underline">
                              {r.number}
                            </Link>
                            <span className="block text-xs text-ink-subtle">
                              {SOURCE_LABEL[r.sourceType]}
                              {r.reference ? (href ? <> · <Link href={href} className="hover:underline">{r.reference}</Link></> : ` · ${r.reference}`) : null}
                            </span>
                          </TD>
                          <TD className="text-sm">{r.particulars}</TD>
                          <TD className="max-w-72 text-sm text-ink-muted">{r.narration}</TD>
                          <TD align="right">{r.debitMinor ? money(r.debitMinor) : ''}</TD>
                          <TD align="right">{r.creditMinor ? money(r.creditMinor) : ''}</TD>
                          <TD align="right" className="whitespace-nowrap">{drCr(r.balanceMinor)}</TD>
                        </TR>
                      )
                    })}
                    <tr className="border-t-2 border-line-strong font-semibold">
                      <td className="px-3 py-2" colSpan={4}>Closing balance</td>
                      <td className="px-3 py-2 text-right tnum">{money(ledger.debitMinor)}</td>
                      <td className="px-3 py-2 text-right tnum">{money(ledger.creditMinor)}</td>
                      <td className="px-3 py-2 text-right tnum">{drCr(ledger.closingMinor)}</td>
                    </tr>
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
