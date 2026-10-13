import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { csvResponse } from '@/lib/csv'
import { toDateInput } from '@/lib/dates'
import { stockState, storeCategory } from '@/lib/store/options'
import { listStoreItems, type ItemFilter } from '@/server/modules/store/service'

const rs = (minor: number) => (minor / 100).toFixed(2)

/** GET /api/v1/store/items/export: stock report with the items page filters. */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const p = req.nextUrl.searchParams
    const stock = p.get('stock')
    const status = p.get('status')
    const filter: ItemFilter = {
      q: p.get('q') ?? undefined,
      category: p.get('category') ?? undefined,
      stock: stock === 'low' || stock === 'out' || stock === 'ok' ? stock : undefined,
      status: status === 'inactive' || status === 'all' ? status : 'active',
    }
    const items = await listStoreItems(ctx, filter)
    return csvResponse(
      `store-stock-${toDateInput(new Date())}.csv`,
      ['SKU', 'Item', 'Size / variant', 'Category', 'Barcode', 'HSN', 'GST %', 'Selling price (Rs)', 'In stock', 'Unit', 'Reorder level', 'Status', 'Avg cost (Rs)', 'Stock value at cost (Rs)', 'Stock value at MRP (Rs)', 'On sale'],
      items.map((i) => {
        const qty = Math.max(i.quantity, 0)
        const state = stockState(i.quantity, i.reorderLevel)
        return [
          i.sku,
          i.name,
          i.variant ?? '',
          storeCategory(i.category).label,
          i.barcode ?? '',
          i.hsnCode ?? '',
          i.taxPercent,
          rs(i.sellingPriceMinor),
          i.quantity,
          i.unit,
          i.reorderLevel,
          state === 'OUT' ? 'Out of stock' : state === 'LOW' ? 'Reorder' : 'OK',
          rs(i.avgCostMinor),
          rs(qty * i.avgCostMinor),
          rs(qty * i.sellingPriceMinor),
          i.isActive ? 'Yes' : 'No',
        ]
      }),
    )
  },
  { permission: 'store.view' },
)
