import { History, LayoutDashboard, Package, PackagePlus, Receipt, Scale, ShoppingCart } from 'lucide-react'
import { LinkTabs, type TabItem } from '@/components/ui/tabs'
import { ACCENT } from '@/components/ui/stat-card'
import type { AppContext } from '@/server/context'

type Key = 'dashboard' | 'sell' | 'items' | 'purchases' | 'sales' | 'movements' | 'summary'

export function StoreTabs({ ctx, active }: { ctx: AppContext; active: Key }) {
  const all: Array<TabItem & { key: Key; show: boolean }> = [
    { key: 'dashboard', label: 'Dashboard', href: '/inventory/store', icon: LayoutDashboard, accent: ACCENT.indigo, show: true, active: false },
    { key: 'sell', label: 'Sell (POS)', href: '/inventory/store/sell', icon: ShoppingCart, accent: ACCENT.emerald, show: ctx.can('store.sell'), active: false },
    { key: 'items', label: 'Items & stock', href: '/inventory/store/items', icon: Package, accent: ACCENT.sky, show: true, active: false },
    { key: 'purchases', label: 'Stock in', href: '/inventory/store/purchases', icon: PackagePlus, accent: ACCENT.amber, show: true, active: false },
    { key: 'sales', label: 'Sales & bills', href: '/inventory/store/sales', icon: Receipt, accent: ACCENT.pink, show: true, active: false },
    { key: 'movements', label: 'Stock ledger', href: '/inventory/store/movements', icon: History, accent: ACCENT.violet, show: true, active: false },
    { key: 'summary', label: 'Stock summary', href: '/inventory/store/summary', icon: Scale, accent: ACCENT.teal, show: true, active: false },
  ]
  return (
    <LinkTabs
      label="School store"
      items={all.filter((t) => t.show).map(({ key, show: _show, ...t }) => ({ ...t, active: key === active }))}
    />
  )
}
