import { route } from '@/server/api/handler'
import { csvResponse } from '@/lib/csv'
import { payablesReport } from '@/server/modules/accounting/payables-service'

const rupees = (minor: number) => (minor / 100).toFixed(2)

/** GET /api/v1/accounting/payables/export — Bills Payable with ageing, one row per vendor. */
export const GET = route(
  async (_req, ctx) => {
    const report = await payablesReport(ctx)
    const rows = report.rows.map((r) => [
      r.vendor.code,
      r.vendor.name,
      r.openBills,
      rupees(r.ageing.d0_30),
      rupees(r.ageing.d31_60),
      rupees(r.ageing.d61_90),
      rupees(r.ageing.d90_plus),
      rupees(r.ageing.totalMinor),
      rupees(r.overdueMinor),
      rupees(r.onAccountMinor),
      rupees(r.netLiabilityMinor),
    ])
    const t = report.totals
    rows.push(['', 'Total', '', rupees(t.d0_30), rupees(t.d31_60), rupees(t.d61_90), rupees(t.d90_plus), rupees(t.billsMinor), rupees(t.overdueMinor), rupees(t.onAccountMinor), rupees(t.netLiabilityMinor)])
    return csvResponse(
      `bills-payable-${report.asOf}.csv`,
      ['Vendor code', 'Vendor', 'Open bills', '0-30 days', '31-60 days', '61-90 days', '90+ days', 'Bills outstanding', 'Overdue', 'On account / advance', 'Net liability'],
      rows,
    )
  },
  { permission: 'accounts.view' },
)
