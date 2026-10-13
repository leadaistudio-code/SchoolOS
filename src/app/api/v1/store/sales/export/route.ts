import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { csvResponse } from '@/lib/csv'
import { toDateInput } from '@/lib/dates'
import { storePaymentLabel } from '@/lib/store/options'
import { exportStoreSales } from '@/server/modules/store/service'

const STAMP = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
const rs = (minor: number) => (minor / 100).toFixed(2)

/** GET /api/v1/store/sales/export: same filters as the sales page. */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const p = req.nextUrl.searchParams
    const rows = await exportStoreSales(ctx, {
      q: p.get('q') ?? undefined,
      preset: p.get('preset') ?? undefined,
      status: p.get('status') ?? undefined,
      mode: p.get('mode') ?? undefined,
    })
    return csvResponse(
      `store-sales-${toDateInput(new Date())}.csv`,
      ['Bill no.', 'Date', 'Buyer', 'Admission no.', 'Phone', 'Items total (Rs)', 'Discount (Rs)', 'GST incl. (Rs)', 'Total (Rs)', 'Cost of goods (Rs)', 'Payment', 'Reference', 'Status', 'Void reason', 'Sold by'],
      rows.map((r) => [
        r.number,
        STAMP.format(r.soldAt),
        r.customerName ?? 'Walk-in',
        r.student?.admissionNo ?? '',
        r.customerPhone ?? '',
        rs(r.grossMinor),
        rs(r.discountMinor),
        rs(r.taxMinor),
        rs(r.totalMinor),
        rs(r.costMinor),
        storePaymentLabel(r.paymentMode),
        r.paymentRef ?? '',
        r.status === 'VOIDED' ? 'Voided' : 'Completed',
        r.voidReason ?? '',
        r.soldByLabel ?? '',
      ]),
    )
  },
  { permission: 'store.view' },
)
