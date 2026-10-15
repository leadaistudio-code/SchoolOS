import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { payablesReport } from '@/server/modules/accounting/payables-service'
import { PAYABLE_AGEING_BUCKETS } from '@/server/modules/accounting/payables'
import { drillHref } from '@/server/drill/descriptor'
import { formatDay } from '@/lib/dates'
import { AccountsTabs, Metric, moneyFmt } from '../ui'

export const metadata = { title: 'Bills payable' }

export default async function PayablesPage() {
  const ctx = await requireContext('accounts.view')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Bills payable" />
        <AccountsTabs active="/accounts/payables" />
        <Notice tone="info" title="Not enabled">Vendor accounting is switched off for this school.</Notice>
      </div>
    )
  }

  const report = await payablesReport(ctx)
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const t = report.totals
  const creditorsHref = report.creditorsAccountId
    ? drillHref(ctx.tenant.id, { k: 'ledger', a: report.creditorsAccountId, t: report.asOf, v: 'closing' })
    : undefined

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bills payable"
        description={`Sundry creditors, bill-wise, as on ${formatDay(new Date(`${report.asOf}T00:00:00Z`))}. Ageing counts days from the supplier bill date.`}
        actions={
          <div className="flex gap-2">
            <Link href="/accounts/vendors" className={buttonVariants({ variant: 'secondary' })}>Vendors</Link>
            <a href="/api/v1/accounting/payables/export" className={buttonVariants({ variant: 'secondary' })}>Export CSV</a>
          </div>
        }
      />
      <AccountsTabs active="/accounts/payables" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Net liability (Sundry Creditors)" value={money(t.netLiabilityMinor)} hint={t.netLiabilityMinor < 0 ? 'Net advance to vendors' : 'Open to the Sundry Creditors ledger'} href={creditorsHref} />
        <Metric label="Bills outstanding" value={money(t.billsMinor)} hint={`${report.rows.reduce((s, r) => s + r.openBills, 0)} open bills`} />
        <Metric label="Overdue (past credit days)" value={money(t.overdueMinor)} tone={t.overdueMinor > 0 ? 'danger' : undefined} />
        <Metric label="Payments on account / advance" value={money(t.onAccountMinor)} hint="Paid but not set against a bill" />
      </div>

      <Card className="overflow-hidden">
        {report.rows.length === 0 ? (
          <EmptyState title="Nothing payable" description="No vendor has an open bill, advance or balance." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Vendor</TH>
                  <TH align="right">Open bills</TH>
                  {PAYABLE_AGEING_BUCKETS.map((b) => <TH key={b.key} align="right">{b.label}</TH>)}
                  <TH align="right">Overdue</TH>
                  <TH align="right">On account</TH>
                  <TH align="right">Net liability</TH>
                </tr>
              </THead>
              <TBody>
                {report.rows.map((r) => {
                  const href = `/accounts/vendors/${r.vendor.id}`
                  const cell = (minor: number) => (minor ? <Link href={href} className="hover:underline">{money(minor)}</Link> : '—')
                  return (
                    <TR key={r.vendor.id}>
                      <TD>
                        <Link href={href} className="font-medium text-[var(--brand-600)] hover:underline">{r.vendor.name}</Link>
                        <span className="block text-xs text-ink-subtle">{r.vendor.code}{r.vendor.isActive ? '' : ' · inactive'}</span>
                      </TD>
                      <TD align="right">{r.openBills}</TD>
                      {PAYABLE_AGEING_BUCKETS.map((b) => <TD key={b.key} align="right" className="tnum">{cell(r.ageing[b.key])}</TD>)}
                      <TD align="right" className={r.overdueMinor > 0 ? 'tnum text-[var(--danger)]' : 'tnum'}>{cell(r.overdueMinor)}</TD>
                      <TD align="right" className="tnum">{cell(r.onAccountMinor)}</TD>
                      <TD align="right" className="tnum font-medium text-ink">
                        <Link href={href} className="hover:underline">{money(r.netLiabilityMinor)}{r.netLiabilityMinor < 0 ? ' Dr' : ''}</Link>
                      </TD>
                    </TR>
                  )
                })}
                <TR>
                  <TD className="font-semibold">Total</TD>
                  <TD />
                  {PAYABLE_AGEING_BUCKETS.map((b) => <TD key={b.key} align="right" className="tnum font-semibold">{money(t[b.key])}</TD>)}
                  <TD align="right" className="tnum font-semibold">{money(t.overdueMinor)}</TD>
                  <TD align="right" className="tnum font-semibold">{money(t.onAccountMinor)}</TD>
                  <TD align="right" className="tnum font-semibold">
                    {creditorsHref ? <Link href={creditorsHref} className="hover:underline">{money(t.netLiabilityMinor)}</Link> : money(t.netLiabilityMinor)}
                  </TD>
                </TR>
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
