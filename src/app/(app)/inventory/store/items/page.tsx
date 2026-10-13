import Link from 'next/link'
import { AlertTriangle, History, Package, PackageX, Wallet } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listStoreItems, type ItemFilter } from '@/server/modules/store/service'
import { STORE_CATEGORIES, stockState, storeCategory } from '@/lib/store/options'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { ACCENT, StatCard } from '@/components/ui/stat-card'
import { RowActions, Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney, formatNumber } from '@/lib/utils'
import { StoreTabs } from '../store-tabs'
import { StoreFilters } from '../store-filters'
import { AdjustStockButton, ItemDialogButton, ToggleActiveButton } from './item-dialogs'

export const metadata = { title: 'Store items & stock' }

export default async function StoreItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('store.view')
  const params = await searchParams
  const filter: ItemFilter = {
    q: params.q,
    category: params.category,
    stock: params.stock === 'low' || params.stock === 'out' || params.stock === 'ok' ? params.stock : undefined,
    status: params.status === 'inactive' || params.status === 'all' ? params.status : 'active',
  }
  const items = await listStoreItems(ctx, filter)
  const canManage = ctx.can('store.manage')
  const currency = ctx.tenant.currency
  const value = items.reduce((s, i) => s + Math.max(i.quantity, 0) * i.avgCostMinor, 0)
  const units = items.reduce((s, i) => s + Math.max(i.quantity, 0), 0)
  const out = items.filter((i) => i.quantity <= 0).length
  const low = items.filter((i) => i.quantity > 0 && i.quantity <= i.reorderLevel).length
  const exportQs = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => !!e[1]),
  ).toString()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Items & stock"
        description="Every product the school sells, with live stock, reorder alerts and value at cost."
        actions={
          <>
            <a href={`/api/v1/store/items/export${exportQs ? `?${exportQs}` : ''}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Stock report CSV
            </a>
            {canManage ? <ItemDialogButton /> : null}
          </>
        }
      />
      <StoreTabs ctx={ctx} active="items" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Items listed" value={formatNumber(items.length)} hint={`${formatNumber(units)} units in hand`} icon={Package} accent={ACCENT.sky} />
        <StatCard label="Stock value" value={formatMoney(value, currency)} hint="At weighted average cost" icon={Wallet} accent={ACCENT.indigo} />
        <StatCard label="Running low" value={formatNumber(low)} hint="At or below reorder level" icon={AlertTriangle} accent={ACCENT.amber} tone={low ? 'warning' : undefined} href="?stock=low" />
        <StatCard label="Out of stock" value={formatNumber(out)} hint="Cannot be sold" icon={PackageX} accent={ACCENT.rose} tone={out ? 'danger' : undefined} href="?stock=out" />
      </div>

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search name, size, SKU or barcode">
          <StoreFilters
            filters={[
              { param: 'category', label: 'Category', allLabel: 'All categories', options: STORE_CATEGORIES.map((c) => ({ value: c.value, label: c.label })) },
              {
                param: 'stock',
                label: 'Stock',
                allLabel: 'Any stock',
                options: [
                  { value: 'low', label: 'Running low' },
                  { value: 'out', label: 'Out of stock' },
                  { value: 'ok', label: 'Healthy' },
                ],
              },
              {
                param: 'status',
                label: 'Status',
                allLabel: 'On sale',
                options: [
                  { value: 'inactive', label: 'Stopped' },
                  { value: 'all', label: 'All' },
                ],
              },
            ]}
          />
        </SearchBar>

        {items.length === 0 ? (
          <EmptyState
            title={params.q || params.category || params.stock ? 'No items match' : 'No store items yet'}
            description="Add uniforms (one per size), books, bags, shoes and stationery with the stock already on the shelf."
            action={canManage ? <ItemDialogButton /> : undefined}
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Item</TH>
                  <TH>Category</TH>
                  <TH align="right">Price</TH>
                  <TH align="right">In stock</TH>
                  <TH align="right">Reorder at</TH>
                  <TH align="right">Avg cost</TH>
                  <TH align="right">Value</TH>
                  <TH align="right"> </TH>
                </tr>
              </THead>
              <TBody>
                {items.map((i) => {
                  const cat = storeCategory(i.category)
                  const state = stockState(i.quantity, i.reorderLevel)
                  return (
                    <TR key={i.id} className={i.isActive ? undefined : 'opacity-60'}>
                      <TD>
                        <p className="text-sm font-medium text-ink">
                          {i.name}
                          {i.variant ? <span className="font-normal text-ink-muted"> · {i.variant}</span> : null}
                        </p>
                        <p className="text-xs text-ink-subtle">
                          {[i.sku, i.barcode, i.taxPercent ? `GST ${i.taxPercent}%` : null].filter(Boolean).join(' · ')}
                          {!i.isActive ? ' · stopped' : ''}
                        </p>
                      </TD>
                      <TD>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span className="size-2 rounded-full" style={{ background: cat.colour }} aria-hidden />
                          {cat.label}
                        </span>
                      </TD>
                      <TD align="right" className="text-ink">{formatMoney(i.sellingPriceMinor, currency)}</TD>
                      <TD align="right">
                        <Badge tone={state === 'OUT' ? 'danger' : state === 'LOW' ? 'warning' : 'success'}>
                          {i.quantity} {i.unit}
                        </Badge>
                      </TD>
                      <TD align="right">{i.reorderLevel}</TD>
                      <TD align="right">{formatMoney(i.avgCostMinor, currency)}</TD>
                      <TD align="right" className="text-ink">{formatMoney(Math.max(i.quantity, 0) * i.avgCostMinor, currency)}</TD>
                      <TD align="right">
                        <RowActions className="gap-1">
                          <Link
                            href={`/inventory/store/movements?itemId=${i.id}`}
                            title="Stock history"
                            className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-2 hover:text-ink"
                          >
                            <History className="size-3.5" aria-label="Stock history" />
                          </Link>
                          {canManage ? (
                            <>
                              <AdjustStockButton item={i} />
                              <ItemDialogButton item={i} />
                              <ToggleActiveButton id={i.id} active={i.isActive} />
                            </>
                          ) : null}
                        </RowActions>
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
