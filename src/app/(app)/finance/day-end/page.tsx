import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { formatDay, attendanceDate } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { schoolToday } from '@/lib/periods'
import { dayEndSheet } from '@/server/modules/finance/dashboard'
import { PrintButton } from '../payments/[id]/print-button'

export const metadata = { title: 'Day-end sheet' }

const modeLabel = (m: string) => {
  const s = m.toLowerCase().replaceAll('_', ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default async function DayEndPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('fees.report')
  const params = await searchParams
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : schoolToday()
  const sheet = await dayEndSheet(ctx, date)
  const currency = ctx.tenant.currency
  const money = (m: number) => formatMoney(m, currency)

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
          title="Day-end sheet"
          description="Everything collected on one day, by mode and by cashier, to tally the cash drawer."
          actions={
            <div className="flex items-center gap-2">
              <PrintButton />
              <BackButton fallbackHref="/finance" />
            </div>
          }
        />
        <Card className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-ink-muted">Date</span>
              <Input type="date" name="date" defaultValue={date} max={schoolToday()} className="mt-1 w-44" />
            </label>
            <Button type="submit" variant="secondary">Show</Button>
            <Link href={`/finance/payments?from=${date}&to=${date}`} className="text-sm text-[var(--brand-600)] hover:underline">
              Open in receipts
            </Link>
          </form>
        </Card>
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">{ctx.tenant.name} — Day-end fee collection</h1>
        <p className="text-sm">{formatDay(attendanceDate(date), 'EEEE, d MMMM yyyy')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-ink-muted">Total received</div>
          <div className="mt-1 text-lg font-semibold tnum">{money(sheet.totalMinor)}</div>
          <div className="text-xs text-ink-subtle">{sheet.byMode.reduce((t, m) => t + m.count, 0)} receipts</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-ink-muted">Cash in drawer</div>
          <div className="mt-1 text-lg font-semibold tnum">{money(sheet.cashMinor)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-ink-muted">Cheques to deposit</div>
          <div className="mt-1 text-lg font-semibold tnum">{money(sheet.pendingChequeMinor)}</div>
          <div className="text-xs text-ink-subtle">{sheet.pendingChequeCount} pending clearance</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-ink-muted">Cancelled receipts</div>
          <div className="mt-1 text-lg font-semibold tnum">{money(sheet.cancelledMinor)}</div>
          <div className="text-xs text-ink-subtle">{sheet.cancelledCount} cancelled</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-base font-semibold">By payment mode</h2></div>
          <TableWrap>
            <Table>
              <THead><tr><TH>Mode</TH><TH align="right">Receipts</TH><TH align="right">Amount</TH></tr></THead>
              <TBody>
                {sheet.byMode.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-3 text-sm text-ink-muted">Nothing received.</td></tr>
                ) : sheet.byMode.map((m) => (
                  <TR key={m.mode}><TD>{modeLabel(m.mode)}</TD><TD align="right">{m.count}</TD><TD align="right">{money(m.amountMinor)}</TD></TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-base font-semibold">By cashier</h2></div>
          <TableWrap>
            <Table>
              <THead><tr><TH>Collected by</TH><TH align="right">Receipts</TH><TH align="right">Cash</TH><TH align="right">Total</TH></tr></THead>
              <TBody>
                {sheet.byCollector.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-3 text-sm text-ink-muted">Nothing received.</td></tr>
                ) : sheet.byCollector.map((c) => (
                  <TR key={c.name}><TD>{c.name}</TD><TD align="right">{c.count}</TD><TD align="right">{money(c.cashMinor)}</TD><TD align="right">{money(c.amountMinor)}</TD></TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-base font-semibold">Receipts</h2></div>
        {sheet.rows.length === 0 ? (
          <EmptyState title="No receipts on this day" description="Pick another date." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Receipt</TH>
                  <TH>Student</TH>
                  <TH>Class</TH>
                  <TH>Mode</TH>
                  <TH>Reference</TH>
                  <TH>Cashier</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {sheet.rows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/finance/payments/${r.id}`} className="text-[var(--brand-600)] hover:underline">{r.receiptNumber || '—'}</Link>
                      {r.billBookNo ? <span className="block text-xs text-ink-subtle">Book {r.billBookNo}</span> : null}
                    </TD>
                    <TD>{r.student}<span className="block text-xs text-ink-subtle">{r.admissionNo}</span></TD>
                    <TD className="text-sm">{r.className}</TD>
                    <TD className="text-sm">
                      {modeLabel(r.mode)}{' '}
                      {r.status === 'PENDING' ? <Badge tone="warning">Pending clearance</Badge> : null}
                      {r.status === 'REVERSED' ? <Badge tone="neutral">Cancelled</Badge> : null}
                      {r.status === 'FAILED' ? <Badge tone="danger">Bounced</Badge> : null}
                    </TD>
                    <TD className="text-sm">{r.reference}</TD>
                    <TD className="text-sm">{r.collector}</TD>
                    <TD align="right" className={r.status === 'REVERSED' || r.status === 'FAILED' ? 'text-ink-subtle line-through' : undefined}>
                      {money(r.amountMinor)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
      <p className="hidden pt-8 text-sm print:block">Cashier signature: ____________________ &nbsp;&nbsp; Accountant signature: ____________________</p>
    </div>
  )
}
