import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { attendanceDate, formatDay } from '@/lib/dates'
import { defaultRange } from '@/server/modules/accounts/service'
import { viewedPeriodOr } from '@/server/view-session'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { billsAwaitingApproval, getVendor360, payablesReconciliation, vendorLedgerFrom } from '@/server/modules/accounting/payables-service'
import { AccountsTabs, isoParam, Metric, moneyFmt, PeriodFilter } from '../ui'

export const metadata = { title: 'Vendor ledger' }

export default async function VendorLedgerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('accounts.view')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Vendor ledger" />
        <AccountsTabs active="/accounts/vendor-ledger" />
        <Notice tone="info" title="Not enabled">Accounting is switched off for this school.</Notice>
      </div>
    )
  }
  const params = await searchParams
  const def = await viewedPeriodOr(ctx, defaultRange())
  const from = isoParam(params.from, def.from)
  const to = isoParam(params.to, def.to)
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const vendors = await ctx.db.vendor.findMany({ orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, isActive: true } })
  const vendorId = vendors.some((v) => v.id === params.vendor) ? params.vendor! : null

  const picker = (
    <label className="block text-sm">
      <span className="text-ink-muted">Vendor</span>
      <Select name="vendor" defaultValue={vendorId ?? ''} className="mt-1 w-72">
        <option value="">All vendors (balances)</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>{v.name} · {v.code}{v.isActive ? '' : ' (inactive)'}</option>
        ))}
      </Select>
    </label>
  )

  if (!vendorId) {
    const rec = await payablesReconciliation(ctx)
    const rows = rec.vendors.filter((v) => v.netLiabilityMinor !== 0).sort((a, b) => b.netLiabilityMinor - a.netLiabilityMinor)
    return (
      <div className="space-y-4">
        <PageHeader title="Vendor ledger" description="What the school owes each vendor. Pick a vendor to see every bill, payment and debit note." />
        <AccountsTabs active="/accounts/vendor-ledger" />
        <PeriodFilter from={from} to={to}>{picker}</PeriodFilter>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Payable to vendors" value={money(rec.subledgerMinor)} hint={`${rows.length} vendors with a balance`} />
          <Metric label="Sundry creditors ledger" value={money(rec.ledgerBalanceMinor)} tone={rec.ok ? 'success' : 'danger'} hint={rec.ok ? 'Matches the vendor ledgers' : `Differs by ${money(rec.differenceMinor)}`} />
          <Metric label="Bills awaiting approval" value={money(rec.pendingMinor)} hint="Owed to vendors, not yet in the Balance sheet" />
        </div>
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState title="Nothing owed" description="No vendor has an open balance." />
          ) : (
            <TableWrap>
              <Table>
                <THead><tr><TH>Vendor</TH><TH align="right">Balance</TH><TH /></tr></THead>
                <TBody>
                  {rows.map((v) => (
                    <TR key={v.id}>
                      <TD>
                        <Link href={`/accounts/vendor-ledger?vendor=${v.id}&from=${from}&to=${to}`} className="font-medium text-[var(--brand-600)] hover:underline">{v.name}</Link>
                        <span className="block text-xs text-ink-subtle">{v.code}</span>
                      </TD>
                      <TD align="right" className="font-medium">{money(v.netLiabilityMinor)} {v.netLiabilityMinor < 0 ? 'Dr (advance)' : 'Cr'}</TD>
                      <TD align="right">{v.reconciled ? null : <Badge tone="danger">Check</Badge>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>
    )
  }

  const v360 = await getVendor360(ctx, vendorId)
  const all = vendorLedgerFrom(v360)
  const waiting = await billsAwaitingApproval(ctx.db, v360.vouchers.map((v) => v.id))
  const fromStore = new Map(v360.vouchers.filter((v) => v.storePurchaseId).map((v) => [v.id, v.storePurchaseId!]))
  const before = all.filter((r) => r.date < from)
  const opening = before.length ? before[before.length - 1]!.balanceMinor : 0
  const rows = all.filter((r) => r.date >= from && r.date <= to)
  const closing = rows.length ? rows[rows.length - 1]!.balanceMinor : opening
  const totals = rows.reduce((t, r) => ({ dr: t.dr + r.debitMinor, cr: t.cr + r.creditMinor }), { dr: 0, cr: 0 })
  const balance = (minor: number) => (minor === 0 ? '—' : `${money(minor)} ${minor > 0 ? 'Cr' : 'Dr'}`)

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Vendor ledger · ${v360.vendor.name}`}
        description={`${v360.vendor.code} · bills, payments, debit notes and discounts with bill-wise references`}
        actions={
          <Link href={`/accounts/vendors/${vendorId}`} className="text-sm font-medium text-[var(--brand-600)] hover:underline">Vendor 360 →</Link>
        }
      />
      <AccountsTabs active="/accounts/vendor-ledger" />
      <PeriodFilter from={from} to={to}>{picker}</PeriodFilter>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Opening balance" value={balance(opening)} />
        <Metric label="Bills (credit)" value={money(totals.cr)} />
        <Metric label="Paid and adjusted (debit)" value={money(totals.dr)} />
        <Metric label="Closing balance" value={balance(closing)} hint={closing > 0 ? 'Payable to the vendor' : closing < 0 ? 'Advance with the vendor' : undefined} />
      </div>

      {waiting.size ? (
        <Notice tone="warning" title="Bills awaiting approval">
          {waiting.size} {waiting.size === 1 ? 'bill is' : 'bills are'} owed to this vendor but not yet approved, so they stay out of the Balance sheet and cannot be paid.
          {' '}<Link href="/accounts/approvals" className="font-medium underline">Entry approvals</Link>
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="No transactions in this period" description="Change the dates to see earlier bills and payments." />
        ) : (
          <TableWrap sticky>
            <Table>
              <THead sticky>
                <tr>
                  <TH>Date</TH>
                  <TH>Voucher</TH>
                  <TH>Bill-wise details</TH>
                  <TH align="right">Debit</TH>
                  <TH align="right">Credit</TH>
                  <TH align="right">Balance</TH>
                </tr>
              </THead>
              <TBody>
                <tr className="bg-surface-2 text-sm">
                  <td className="px-3 py-2 text-ink-muted" colSpan={5}>Opening balance on {formatDay(attendanceDate(from))}</td>
                  <td className="px-3 py-2 text-right font-medium tnum">{balance(opening)}</td>
                </tr>
                {rows.map((r) => {
                  const store = fromStore.get(r.id)
                  return (
                    <TR key={`${r.voucherType}:${r.id}`}>
                      <TD className="whitespace-nowrap">{formatDay(attendanceDate(r.date))}</TD>
                      <TD>
                        <span className="block text-sm font-medium text-ink">{r.voucherNo}</span>
                        <span className="text-xs text-ink-subtle">{r.voucherType}</span>
                        {store ? (
                          <Link href={`/inventory/store/purchases/${store}`} className="ml-2 text-xs text-[var(--brand-600)] hover:underline">stock receipt</Link>
                        ) : null}
                        {waiting.has(r.id) ? <Badge tone="warning" className="ml-2">Awaiting approval</Badge> : null}
                      </TD>
                      <TD className="text-xs text-ink-muted">
                        {r.refs.map((ref, i) => (
                          <span key={i} className="block">{ref.type}{ref.bill ? ` · ${ref.bill}` : ''} · {money(ref.amountMinor)}</span>
                        ))}
                      </TD>
                      <TD align="right">{r.debitMinor ? money(r.debitMinor) : ''}</TD>
                      <TD align="right">{r.creditMinor ? money(r.creditMinor) : ''}</TD>
                      <TD align="right" className="font-medium">{balance(r.balanceMinor)}</TD>
                    </TR>
                  )
                })}
                <tr className="border-t-2 border-line-strong font-semibold">
                  <td className="px-3 py-2" colSpan={3}>Closing balance</td>
                  <td className="px-3 py-2 text-right tnum">{money(totals.dr)}</td>
                  <td className="px-3 py-2 text-right tnum">{money(totals.cr)}</td>
                  <td className="px-3 py-2 text-right tnum">{balance(closing)}</td>
                </tr>
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
