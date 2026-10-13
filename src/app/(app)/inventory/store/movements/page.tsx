import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listStockMovements, storeCatalogue } from '@/server/modules/store/service'
import { MOVEMENT_LABELS, itemLabel } from '@/lib/store/options'
import { PERIOD_PRESETS } from '@/lib/periods'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { TableToolbar, Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { StoreTabs } from '../store-tabs'
import { StoreFilters } from '../store-filters'

export const metadata = { title: 'Stock ledger' }

const STAMP = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default async function StockMovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('store.view')
  const params = await searchParams
  const [movements, items] = await Promise.all([
    listStockMovements(ctx, { itemId: params.itemId, type: params.type, preset: params.preset }),
    storeCatalogue(ctx),
  ])
  const currency = ctx.tenant.currency
  const selected = params.itemId ? items.find((i) => i.id === params.itemId) : undefined

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock ledger"
        description="Every unit in and out: opening stock, deliveries, sales, voided bills and adjustments, with who did it and the balance after."
      />
      <StoreTabs ctx={ctx} active="movements" />

      <Card className="overflow-hidden">
        <TableToolbar>
          <StoreFilters
            filters={[
              { param: 'itemId', label: 'Item', allLabel: 'All items', options: items.map((i) => ({ value: i.id, label: `${itemLabel(i)} · ${i.sku}` })) },
              { param: 'type', label: 'Movement', allLabel: 'All movements', options: Object.entries(MOVEMENT_LABELS).map(([value, m]) => ({ value, label: m.label })) },
              { param: 'preset', label: 'Period', allLabel: 'Any time', options: PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })) },
            ]}
          />
          {selected ? (
            <p className="ml-auto text-sm text-ink-muted">
              {itemLabel(selected)}: <span className="font-semibold text-ink">{selected.quantity} {selected.unit}</span> in hand
            </p>
          ) : null}
        </TableToolbar>
        {movements.length === 0 ? (
          <EmptyState title="No stock movements" description="Opening stock, deliveries, sales and adjustments appear here." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>Item</TH>
                  <TH>Movement</TH>
                  <TH align="right">In</TH>
                  <TH align="right">Out</TH>
                  <TH align="right">Balance</TH>
                  <TH align="right">Value</TH>
                  <TH>Reference / reason</TH>
                </tr>
              </THead>
              <TBody>
                {movements.map((m) => {
                  const meta = MOVEMENT_LABELS[m.type] ?? { label: m.type, tone: 'neutral' as const }
                  const ref = m.saleId ? `/inventory/store/sales/${m.saleId}` : m.purchaseId ? `/inventory/store/purchases/${m.purchaseId}` : null
                  return (
                    <TR key={m.id}>
                      <TD className="whitespace-nowrap">{STAMP.format(m.createdAt)}</TD>
                      <TD>
                        <Link href={`?itemId=${m.itemId}`} className="text-sm text-ink hover:underline">{itemLabel(m.item)}</Link>
                        <p className="text-xs text-ink-subtle">{m.item.sku}</p>
                      </TD>
                      <TD><Badge tone={meta.tone}>{meta.label}</Badge></TD>
                      <TD align="right" className="text-success">{m.quantity > 0 ? `+${m.quantity}` : ''}</TD>
                      <TD align="right" className="text-[var(--danger)]">{m.quantity < 0 ? m.quantity : ''}</TD>
                      <TD align="right" className="font-medium text-ink">{m.balanceAfter}</TD>
                      <TD align="right">{formatMoney(Math.abs(m.quantity) * m.unitCostMinor, currency)}</TD>
                      <TD>
                        {ref ? (
                          <Link href={ref} className="text-sm text-[var(--brand-600)] hover:underline">{m.reason}</Link>
                        ) : (
                          <span className="text-sm">{m.reason}</span>
                        )}
                        {m.actorLabel ? <p className="text-xs text-ink-subtle">by {m.actorLabel}</p> : null}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
