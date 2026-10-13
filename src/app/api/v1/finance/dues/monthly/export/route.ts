import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { csvResponse } from '@/lib/csv'
import { duesGridFilterSchema, FY_MONTH_LABELS, monthlyDuesGrid } from '@/server/modules/finance/dues-grid'

const rupees = (minor: number) => (minor / 100).toFixed(2)

/** GET /api/v1/finance/dues/monthly/export?fy=&classLevelId=&filter=&q= */
export const GET = route(
  async (req: NextRequest, ctx) => {
    ctx.require('fees.export')
    const filter = duesGridFilterSchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
    const grid = await monthlyDuesGrid(ctx, filter)
    return csvResponse(
      `month-wise-dues-${grid.fyLabel}.csv`,
      ['Student', 'Admission no.', 'Class', ...FY_MONTH_LABELS.map((m) => `${m} due`), 'Billed (FY)', 'Balance due', 'Overdue'],
      grid.rows.map((r) => [
        r.name,
        r.admissionNo,
        r.className,
        ...r.months.map((c) => (c && c.billedMinor > 0 ? rupees(Math.max(0, c.balanceMinor)) : '')),
        rupees(r.billedMinor),
        rupees(r.balanceMinor),
        rupees(r.overdueMinor),
      ]),
    )
  },
  { permission: 'fees.accounts' },
)
