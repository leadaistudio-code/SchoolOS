import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getStockSummary } from '@/server/modules/store/stock-summary'
import { itemLabel } from '@/lib/store/options'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { StoreTabs } from '../store-tabs'

export const metadata = { title: 'Stock summary' }

function day(iso: string) {
  return formatDay(new Date(`${iso}T00:00:00Z`))
}

export default async function StockSummaryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('store.view')
  const summary = await getStockSummary(ctx, await searchParams)
  const money = (minor: number) => formatMoney(minor, ctx.tenant.currency)
  const t = summary.totals

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock summary"
        description={`Opening, inward, outward and closing stock at weighted average cost · ${day(summary.from)} to ${day(summary.to)}`}
      />
      <StoreTabs ctx={ctx} active="summary" />

      <Card className="no-print p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-ink-muted">From</span>
            <Input type="date" name="from" defaultValue={summary.from} className="mt-1 w-44" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">To</span>
            <Input type="date" name="to" defaultValue={summary.to} className="mt-1 w-44" />
          </label>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {summary.rows.length === 0 ? (
          <EmptyState title="No stock in this period" description="Add items or receive stock to see them here." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Item</TH>
                  <TH align="right">Opening qty</TH>
                  <TH align="right">Opening value</TH>
                  <TH align="right">Inward qty</TH>
                  <TH align="right">Inward value</TH>
                  <TH align="right">Outward qty</TH>
                  <TH align="right">Outward value</TH>
                  <TH align="right">Closing qty</TH>
                  <TH align="right">Rate</TH>
                  <TH align="right">Closing value</TH>
                </tr>
              </THead>
              <TBody>
                {summary.rows.map((r) => (
                  <TR key={r.itemId}>
                    <TD>
                      <Link href={`/inventory/store/movements?itemId=${r.itemId}`} className="font-medium text-[var(--brand-600)] hover:underline">{itemLabel(r)}</Link>
                      <span className="block text-xs text-ink-subtle">{r.sku}</span>
                    </TD>
                    <TD align="right" className="tnum">{r.openingQty} {r.unit}</TD>
                    <TD align="right" className="tnum">{money(r.openingValueMinor)}</TD>
                    <TD align="right" className="tnum">{r.inwardQty || '—'}</TD>
                    <TD align="right" className="tnum">{r.inwardValueMinor ? money(r.inwardValueMinor) : '—'}</TD>
                    <TD align="right" className="tnum">{r.outwardQty || '—'}</TD>
                    <TD align="right" className="tnum">{r.outwardValueMinor ? money(r.outwardValueMinor) : '—'}</TD>
                    <TD align="right" className={r.closingQty < 0 ? 'tnum text-[var(--danger)]' : 'tnum'}>{r.closingQty} {r.unit}</TD>
                    <TD align="right" className="tnum">{r.closingRateMinor ? money(r.closingRateMinor) : '—'}</TD>
                    <TD align="right" className="tnum font-medium">{money(r.closingValueMinor)}</TD>
                  </TR>
                ))}
                <TR>
                  <TD className="font-semibold">Total</TD>
                  <TD />
                  <TD align="right" className="tnum font-semibold">{money(t.openingValueMinor)}</TD>
                  <TD />
                  <TD align="right" className="tnum font-semibold">{money(t.inwardValueMinor)}</TD>
                  <TD />
                  <TD align="right" className="tnum font-semibold">{money(t.outwardValueMinor)}</TD>
                  <TD />
                  <TD />
                  <TD align="right" className="tnum font-semibold">{money(t.closingValueMinor)}</TD>
                </TR>
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
      <p className="text-xs text-ink-subtle">
        Valued at the store&apos;s running weighted average cost. Outward includes sales and stock taken out; voided bills come back as inward.
        No write-down to net realisable value is applied unless recorded as a stock adjustment.
      </p>
    </div>
  )
}
