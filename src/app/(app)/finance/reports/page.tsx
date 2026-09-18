import { requireContext } from '@/server/context'
import { feeReportsSummary } from '@/server/modules/finance/simplicity'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Metric } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { FeeSimulator } from './fee-simulator'

export const metadata = { title: 'Fee reports' }

export default async function FeeReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const ctx = await requireContext('fees.report')
  const params = await searchParams
  const [report, structures] = await Promise.all([
    feeReportsSummary(ctx, params.from, params.to),
    ctx.can('fees.owner_analytics')
      ? ctx.db.feeStructure.findMany({
          where: { deletedAt: null, status: 'PUBLISHED' },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])
  const currency = ctx.tenant.currency
  const rate = report.billedMinor > 0
    ? Math.round(((report.billedMinor - report.outstandingMinor) / report.billedMinor) * 100)
    : 0

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" description="Collection, outstanding and payment-method totals" />
      <Card>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="From" htmlFor="report-from">
              <Input id="report-from" name="from" type="date" defaultValue={params.from} />
            </Field>
            <Field label="To" htmlFor="report-to">
              <Input id="report-to" name="to" type="date" defaultValue={params.to} />
            </Field>
            <Button type="submit" variant="secondary">Apply</Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Expected billing" value={formatMoney(report.billedMinor, currency)} />
        <Metric label="Collected" value={formatMoney(report.collectedMinor, currency)} />
        <Metric label="Outstanding" value={formatMoney(report.outstandingMinor, currency)} />
        <Metric label="Collection rate" value={`${rate}%`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Payment methods</CardTitle></CardHeader>
          <CardContent className="p-0">
            <TableWrap>
              <Table>
                <THead><tr><TH>Method</TH><TH align="right">Payments</TH><TH align="right">Collected</TH></tr></THead>
                <TBody>
                  {report.byMode.map((row) => (
                    <TR key={row.mode}>
                      <TD className="text-sm">{row.mode.toLowerCase().replace('_', ' ')}</TD>
                      <TD align="right">{row._count._all}</TD>
                      <TD align="right" className="font-medium tnum">{formatMoney(row._sum.amountMinor ?? 0, currency)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Adjustments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between gap-3 text-sm"><span className="text-ink-muted">Concessions</span><span className="tnum">{formatMoney(report.concessionMinor, currency)}</span></div>
            <div className="flex justify-between gap-3 text-sm"><span className="text-ink-muted">Late fees</span><span className="tnum">{formatMoney(report.lateFeeMinor, currency)}</span></div>
            <div className="flex justify-between gap-3 text-sm"><span className="text-ink-muted">Refunds</span><span className="tnum">{formatMoney(report.refundMinor, currency)}</span></div>
          </CardContent>
        </Card>
      </div>
      {ctx.can('fees.owner_analytics') ? <FeeSimulator structures={structures} currency={currency} /> : null}
    </div>
  )
}
