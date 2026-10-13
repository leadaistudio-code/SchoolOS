import { requireContext } from '@/server/context'
import { storeCatalogue } from '@/server/modules/store/service'
import { PageHeader } from '@/components/page-header'
import { StoreTabs } from '../store-tabs'
import { PointOfSale } from './pos'

export const metadata = { title: 'Store counter' }

export default async function StoreSellPage() {
  const ctx = await requireContext('store.sell')
  const items = await storeCatalogue(ctx)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Store counter"
        description="Scan or tap items, pick the student, take payment. Stock reduces the moment the bill is saved."
      />
      <StoreTabs ctx={ctx} active="sell" />
      <PointOfSale
        currency={ctx.tenant.currency}
        items={items.map(({ avgCostMinor: _cost, reorderLevel: _r, ...i }) => i)}
      />
    </div>
  )
}
