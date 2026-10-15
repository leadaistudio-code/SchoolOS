import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { formatDay } from '@/lib/dates'
import { drillHref } from '@/server/drill/descriptor'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { getCashBook } from '@/server/modules/accounting/cash-book'
import { toIsoDay } from '@/server/modules/accounting/fiscal-year'
import { AccountsTabs, Metric, PeriodFilter, SOURCE_LABEL, moneyFmt, sourceHref } from '../ui'

function day(iso: string) {
  return formatDay(new Date(`${iso}T00:00:00Z`))
}

/** Cash Book or Bank Book for one ledger: day-wise opening, receipts, payments and closing, then the vouchers. */
export async function BookView({ book, params }: { book: 'cash' | 'bank'; params: Record<string, string | undefined> }) {
  const ctx = await requireContext('accounts.view')
  const title = book === 'cash' ? 'Cash Book' : 'Bank Book'
  const path = book === 'cash' ? '/accounts/cash-book' : '/accounts/bank-book'
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title={title} />
        <AccountsTabs active={path} />
        <Notice tone="info" title="Not enabled">The {title} is part of the accounting module, which is switched off for this school.</Notice>
      </div>
    )
  }

  const cb = await getCashBook(ctx, { ...params, book })
  const { money, drCr } = moneyFmt(ctx.tenant.currency || 'INR')
  const ledger = cb.ledger
  const closingHref = cb.account ? drillHref(ctx.tenant.id, { k: 'ledger', a: cb.account.id, f: cb.from, t: cb.to, v: 'closing' }) : undefined
  const periodHref = cb.account ? drillHref(ctx.tenant.id, { k: 'ledger', a: cb.account.id, f: cb.from, t: cb.to, v: 'period' }) : undefined

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        description={cb.account ? `${cb.account.code} · ${cb.account.name} · ${day(cb.from)} to ${day(cb.to)}` : undefined}
        actions={<Link href={book === 'cash' ? '/accounts/bank-book' : '/accounts/cash-book'} className="text-sm text-[var(--brand-600)] hover:underline">{book === 'cash' ? 'Bank Book' : 'Cash Book'} →</Link>}
      />
      <AccountsTabs active={path} />

      <PeriodFilter from={cb.from} to={cb.to}>
        {cb.accounts.length > 1 ? (
          <label className="block text-sm">
            <span className="text-ink-muted">Ledger</span>
            <Select name="account" defaultValue={cb.account?.id} className="mt-1 w-64">
              {cb.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}{a.isActive ? '' : ' (inactive)'}</option>)}
            </Select>
          </label>
        ) : null}
      </PeriodFilter>

      {!cb.account || !ledger ? (
        <EmptyState title={`No ${book} ledger`} description="Map a payment mode to a ledger in Posting rules, or seed the chart of accounts." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Opening balance" value={drCr(ledger.openingMinor)} />
            <Metric label="Receipts (Dr)" value={money(ledger.debitMinor)} href={periodHref} />
            <Metric label="Payments (Cr)" value={money(ledger.creditMinor)} href={periodHref} />
            <Metric label="Closing balance" value={drCr(ledger.closingMinor)} href={closingHref} tone={ledger.closingMinor < 0 ? 'danger' : undefined} hint={ledger.closingMinor < 0 ? 'Negative cash/bank: check for missing receipts' : undefined} />
          </div>

          <Card>
            <CardHeader><CardTitle>Day-wise summary</CardTitle></CardHeader>
            <CardContent className="p-0">
              {cb.days.length === 0 ? (
                <EmptyState title="No vouchers in this period" description="The closing balance equals the opening balance." />
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Date</TH>
                        <TH align="right">Opening</TH>
                        <TH align="right">Receipts</TH>
                        <TH align="right">Payments</TH>
                        <TH align="right">Closing</TH>
                        <TH align="right">Vouchers</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {cb.days.map((d) => (
                        <TR key={d.date}>
                          <TD>
                            <Link href={`${path}?account=${cb.account!.id}&from=${d.date}&to=${d.date}`} className="text-[var(--brand-600)] hover:underline">{day(d.date)}</Link>
                          </TD>
                          <TD align="right" className="tnum">{drCr(d.openingMinor)}</TD>
                          <TD align="right" className="tnum">{d.receiptsMinor ? money(d.receiptsMinor) : '—'}</TD>
                          <TD align="right" className="tnum">{d.paymentsMinor ? money(d.paymentsMinor) : '—'}</TD>
                          <TD align="right" className="tnum font-medium">{drCr(d.closingMinor)}</TD>
                          <TD align="right">{d.vouchers}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>

          {ledger.rows.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Vouchers</CardTitle></CardHeader>
              <CardContent className="p-0">
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Date</TH>
                        <TH>Voucher</TH>
                        <TH>Particulars</TH>
                        <TH align="right">Receipt</TH>
                        <TH align="right">Payment</TH>
                        <TH align="right">Balance</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {ledger.rows.slice(0, 500).map((r) => {
                        const src = sourceHref(r.sourceType, r.sourceId)
                        return (
                          <TR key={r.id}>
                            <TD className="whitespace-nowrap">{day(toIsoDay(r.date))}</TD>
                            <TD>
                              <Link href={`/accounts/journals/${r.entryId}`} className="text-[var(--brand-600)] hover:underline">{r.number}</Link>
                              <span className="block text-xs text-ink-subtle">
                                {src ? <Link href={src} className="hover:underline">{SOURCE_LABEL[r.sourceType] ?? r.sourceType}</Link> : (SOURCE_LABEL[r.sourceType] ?? r.sourceType)}
                              </span>
                            </TD>
                            <TD className="text-sm">
                              {r.particulars}
                              {r.narration ? <span className="block text-xs text-ink-subtle">{r.narration}</span> : null}
                            </TD>
                            <TD align="right" className="tnum">{r.debitMinor ? money(r.debitMinor) : ''}</TD>
                            <TD align="right" className="tnum">{r.creditMinor ? money(r.creditMinor) : ''}</TD>
                            <TD align="right" className="tnum">{drCr(r.balanceMinor)}</TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                </TableWrap>
                {ledger.rows.length > 500 ? (
                  <p className="px-4 py-3 text-xs text-ink-subtle">Showing the first 500 vouchers. Click a date above to see one day, or open the General ledger.</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}
