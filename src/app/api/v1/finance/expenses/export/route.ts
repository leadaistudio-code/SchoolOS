import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { csvResponse } from '@/lib/csv'
import { toDateInput } from '@/lib/dates'
import { categoryLabel, natureLabel, paymentModeLabel } from '@/lib/finance/expense-options'
import { expenseFilterSchema, exportExpenses } from '@/server/modules/finance/expenses'
import { getViewSession, withSessionPeriod } from '@/server/view-session'

/** GET /api/v1/finance/expenses/export — same filters as the expense page. */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const filter = withSessionPeriod(
      expenseFilterSchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries())),
      await getViewSession(ctx),
    )
    const rows = await exportExpenses(ctx, filter)
    return csvResponse(
      `expenses-${toDateInput(new Date())}.csv`,
      ['Date', 'Expense', 'Head', 'Type', 'Category', 'Amount (Rs)', 'Paid by', 'Vendor', 'Bill / invoice no.', 'Receipt attached', 'Recorded by', 'Notes'],
      rows.map((r) => [
        toDateInput(r.expenseDate),
        r.title,
        r.head?.name ?? '',
        natureLabel(r.nature),
        categoryLabel(r.category),
        (r.amountMinor / 100).toFixed(2),
        paymentModeLabel(r.paymentMode),
        r.vendor ?? '',
        r.referenceNo ?? '',
        r.receiptKey ? 'Yes' : 'No',
        r.recordedByLabel ?? '',
        r.notes ?? '',
      ]),
    )
  },
  { permission: 'expenses.view' },
)
