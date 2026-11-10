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
    const { expenses, vendorPayments } = await exportExpenses(ctx, filter)
    const rows = [
      ...expenses.map((r) => ({
        date: r.expenseDate,
        cells: [
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
          r.spentBy ?? '',
          r.recordedByLabel ?? '',
          r.notes ?? '',
        ],
      })),
      ...vendorPayments.map((v) => ({
        date: v.paidOn,
        cells: [
          toDateInput(v.paidOn),
          `Payment to ${v.vendor.name} (${v.number})`,
          'Vendor payment',
          '',
          '',
          (v.amountMinor / 100).toFixed(2),
          paymentModeLabel(v.mode),
          v.vendor.name,
          v.reference ?? '',
          'No',
          '',
          v.createdByLabel ?? '',
          v.narration ?? '',
        ],
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime())
    return csvResponse(
      `expenses-${toDateInput(new Date())}.csv`,
      ['Date', 'Expense', 'Head', 'Type', 'Category', 'Amount (Rs)', 'Paid by', 'Vendor', 'Bill / invoice no.', 'Receipt attached', 'Expense by', 'Recorded by', 'Notes'],
      rows.map((r) => r.cells),
    )
  },
  { permission: 'expenses.view' },
)
