import { requireContext } from '@/server/context'
import { storeCatalogue } from '@/server/modules/store/service'
import { schoolToday } from '@/lib/periods'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { PageHeader } from '@/components/page-header'
import { StoreTabs } from '../../store-tabs'
import { GrnForm } from './grn-form'

export const metadata = { title: 'Receive stock' }

export default async function NewStorePurchasePage({ searchParams }: { searchParams: Promise<{ itemId?: string }> }) {
  const ctx = await requireContext('store.manage')
  const { itemId } = await searchParams
  const [items, flags] = await Promise.all([storeCatalogue(ctx), getAccountingFlags(ctx.db)])
  const vendors = flags.module
    ? await ctx.db.vendor.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true } })
    : []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Receive stock"
        description="Record a delivery from a vendor (goods receipt). Stock goes up and the payment is booked in Accounts."
      />
      <StoreTabs ctx={ctx} active="purchases" />
      <GrnForm
        currency={ctx.tenant.currency}
        today={schoolToday()}
        preselect={itemId}
        vendors={vendors}
        items={items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, variant: i.variant, unit: i.unit, quantity: i.quantity, avgCostMinor: i.avgCostMinor }))}
      />
    </div>
  )
}
