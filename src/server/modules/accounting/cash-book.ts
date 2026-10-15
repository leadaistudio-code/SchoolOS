import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { badRequest } from '@/server/api/response'
import { generalLedger } from '@/server/modules/accounts/service'
import { schoolToday } from '@/lib/periods'
import { cashBankAccounts, type CashBankAccount } from './cash-bank'
import { toIsoDay } from './fiscal-year'

export type CashBookLine = { date: string; debitMinor: number; creditMinor: number }
export type CashBookDay = {
  date: string
  openingMinor: number
  receiptsMinor: number
  paymentsMinor: number
  closingMinor: number
  vouchers: number
}

/**
 * Cash / Bank Book, day by day: each day opens at the previous day's closing,
 * receipts are the ledger's debits and payments its credits. Days with no
 * vouchers are skipped, as in Tally's Cash Book.
 */
export function cashBookDays(openingMinor: number, lines: CashBookLine[]): CashBookDay[] {
  const byDay = new Map<string, CashBookLine[]>()
  for (const l of [...lines].sort((a, b) => a.date.localeCompare(b.date))) {
    const list = byDay.get(l.date) ?? []
    list.push(l)
    byDay.set(l.date, list)
  }
  let running = openingMinor
  return [...byDay.entries()].map(([date, ls]) => {
    const receiptsMinor = ls.reduce((s, l) => s + l.debitMinor, 0)
    const paymentsMinor = ls.reduce((s, l) => s + l.creditMinor, 0)
    const openingMinor = running
    running += receiptsMinor - paymentsMinor
    return { date, openingMinor, receiptsMinor, paymentsMinor, closingMinor: running, vouchers: ls.length }
  })
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const cashBookQuerySchema = z.object({
  book: z.enum(['cash', 'bank']).catch('cash'),
  account: z.string().max(40).optional().catch(undefined),
  from: isoDay.optional().catch(undefined),
  to: isoDay.optional().catch(undefined),
})

/**
 * Ledgers for the Cash Book (the CASH account and any ledger the cash payment
 * mode posts to) or the Bank Book (every other cash/bank ledger).
 */
export function bookAccounts(accounts: CashBankAccount[], cashMappedIds: ReadonlySet<string>, book: 'cash' | 'bank') {
  const isCash = (a: CashBankAccount) => a.systemKey === 'CASH' || cashMappedIds.has(a.id)
  return accounts.filter((a) => (book === 'cash' ? isCash(a) : !isCash(a)))
}

export async function getCashBook(ctx: AppContext, raw: Record<string, string | undefined>) {
  ctx.require('accounts.view')
  const q = cashBookQuerySchema.parse(raw)
  const today = schoolToday()
  const to = q.to ?? today
  const from = q.from ?? `${to.slice(0, 8)}01`
  if (from > to) throw badRequest('The start date is after the end date')
  const [all, cashMaps] = await Promise.all([
    cashBankAccounts(ctx.db),
    ctx.db.ledgerAccountMap.findMany({ where: { kind: 'PAYMENT_MODE', localKey: 'CASH' }, select: { accountId: true } }),
  ])
  const accounts = bookAccounts(all, new Set(cashMaps.map((m) => m.accountId)), q.book)
  const account = accounts.find((a) => a.id === q.account) ?? accounts[0]
  if (!account) return { book: q.book, from, to, accounts, account: null, ledger: null, days: [] as CashBookDay[] }
  const ledger = await generalLedger(ctx, { accountId: account.id, from, to })
  const days = cashBookDays(
    ledger.openingMinor,
    ledger.rows.map((r) => ({ date: toIsoDay(r.date), debitMinor: r.debitMinor, creditMinor: r.creditMinor })),
  )
  return { book: q.book, from, to, accounts, account, ledger, days }
}
