import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { badRequest } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { schoolToday } from '@/lib/periods'
import { ensureExpenseHeads } from './expense-heads'

export type ExpenseBookLine = { date: string; nature: string; amountMinor: number }
export type ExpenseBookDay = {
  date: string
  count: number
  directMinor: number
  indirectMinor: number
  totalMinor: number
  /** Running total from the start of the period, as in a register. */
  cumulativeMinor: number
}

/** Day-wise totals of the Expense Book, oldest day first, with a running total. */
export function expenseBookDays(lines: ExpenseBookLine[]): ExpenseBookDay[] {
  const byDay = new Map<string, ExpenseBookDay>()
  for (const l of lines) {
    const d = byDay.get(l.date) ?? { date: l.date, count: 0, directMinor: 0, indirectMinor: 0, totalMinor: 0, cumulativeMinor: 0 }
    d.count += 1
    if (l.nature === 'DIRECT') d.directMinor += l.amountMinor
    else d.indirectMinor += l.amountMinor
    d.totalMinor += l.amountMinor
    byDay.set(l.date, d)
  }
  let running = 0
  return [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      running += d.totalMinor
      return { ...d, cumulativeMinor: running }
    })
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const expenseBookQuerySchema = z.object({
  from: isoDay.optional().catch(undefined),
  to: isoDay.optional().catch(undefined),
})

export const EXPENSE_BOOK_ROW_LIMIT = 2000
const MAX_DAYS = 366

/** The Expense Book: every live expense in the period, by day, as recorded. */
export async function getExpenseBook(ctx: AppContext, raw: Record<string, string | undefined>) {
  ctx.require('expenses.view')
  await ensureExpenseHeads(ctx)
  const q = expenseBookQuerySchema.parse(raw)
  const to = q.to ?? schoolToday()
  const from = q.from ?? `${to.slice(0, 8)}01`
  if (from > to) throw badRequest('The start date is after the end date')
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_DAYS) throw badRequest('Choose a period of a year or less')
  const where = { deletedAt: null, expenseDate: { gte: attendanceDate(from), lte: attendanceDate(to) } }
  const [rows, agg] = await Promise.all([
    ctx.db.schoolExpense.findMany({
      where,
      orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
      take: EXPENSE_BOOK_ROW_LIMIT,
      include: { head: { select: { name: true } } },
    }),
    ctx.db.schoolExpense.aggregate({ where, _sum: { amountMinor: true }, _count: { _all: true } }),
  ])
  const lines = rows.map((r) => ({ ...r, day: toDateInput(r.expenseDate) }))
  return {
    from,
    to,
    rows: lines,
    days: expenseBookDays(lines.map((r) => ({ date: r.day, nature: r.nature, amountMinor: r.amountMinor }))),
    totalMinor: agg._sum.amountMinor ?? 0,
    count: agg._count._all,
    truncated: agg._count._all > rows.length,
  }
}
