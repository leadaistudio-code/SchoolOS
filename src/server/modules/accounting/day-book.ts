/**
 * Day Book (cash / bank register): pure functions over journal entries.
 *
 * A row is one journal entry that touches a cash or bank ledger.
 *   paid     = Σ credits to the selected cash/bank ledgers (money out)
 *   received = Σ debits to them (money in)
 * Reversals appear as their own rows with the opposite effect, so the register
 * always equals the ledger: Σ paid = Σ cash/bank credits, Σ received = Σ debits.
 *
 * Head summary: each row's paid amount is spread over the entry's other debit
 * lines (and received over its other credit lines) in proportion to their
 * size, the last line taking the rounding remainder. So the heads add up to
 * exactly the register totals, even for entries such as payroll where part of
 * the expense is withheld rather than paid.
 */

export type DayBookLine = { accountId: string; debitMinor: number; creditMinor: number }

export type DayBookEntry = {
  id: string
  number: string
  date: string
  voucherType: string
  sourceType: string
  sourceId: string | null
  narration: string | null
  reference: string | null
  isReversal: boolean
  reversedAt: Date | null
  createdByLabel: string | null
  createdAt: Date
  lines: DayBookLine[]
}

export type CounterShare = { accountId: string; paidMinor: number; receivedMinor: number }

export type DayBookRow = DayBookEntry & {
  paidMinor: number
  receivedMinor: number
  cashLines: DayBookLine[]
  counter: CounterShare[]
}

/** Splits `total` across `weights` pro rata; the last positive weight takes the remainder. */
export function allocateProRata(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0)
  if (total === 0 || sum <= 0) return weights.map(() => 0)
  const lastIndex = weights.reduce((last, w, i) => (w > 0 ? i : last), -1)
  let given = 0
  return weights.map((w, i) => {
    if (w <= 0) return 0
    if (i === lastIndex) return total - given
    const share = Math.floor((total * w) / sum)
    given += share
    return share
  })
}

export function buildDayBookRow(entry: DayBookEntry, cashIds: ReadonlySet<string>): DayBookRow | null {
  const cashLines = entry.lines.filter((l) => cashIds.has(l.accountId))
  if (cashLines.length === 0) return null
  const others = entry.lines.filter((l) => !cashIds.has(l.accountId))
  const paidMinor = cashLines.reduce((s, l) => s + l.creditMinor, 0)
  const receivedMinor = cashLines.reduce((s, l) => s + l.debitMinor, 0)

  const paidShares = allocateProRata(paidMinor, others.map((l) => l.debitMinor))
  const receivedShares = allocateProRata(receivedMinor, others.map((l) => l.creditMinor))
  const byAccount = new Map<string, CounterShare>()
  others.forEach((l, i) => {
    const paid = paidShares[i] ?? 0
    const received = receivedShares[i] ?? 0
    if (!paid && !received) return
    const share = byAccount.get(l.accountId) ?? { accountId: l.accountId, paidMinor: 0, receivedMinor: 0 }
    share.paidMinor += paid
    share.receivedMinor += received
    byAccount.set(l.accountId, share)
  })
  return { ...entry, paidMinor, receivedMinor, cashLines, counter: [...byAccount.values()] }
}

export type DayBookDirection = 'all' | 'payments' | 'receipts'

export function filterRows(rows: DayBookRow[], filter: { direction?: DayBookDirection; headAccountId?: string }) {
  return rows.filter((r) => {
    if (filter.direction === 'payments' && r.paidMinor === 0) return false
    if (filter.direction === 'receipts' && r.receivedMinor === 0) return false
    if (filter.headAccountId && !r.counter.some((c) => c.accountId === filter.headAccountId)) return false
    return true
  })
}

export function dayBookTotals(rows: DayBookRow[]) {
  const paidMinor = rows.reduce((s, r) => s + r.paidMinor, 0)
  const receivedMinor = rows.reduce((s, r) => s + r.receivedMinor, 0)
  return { paidMinor, receivedMinor, netMinor: receivedMinor - paidMinor, vouchers: rows.length }
}

export type DaySummary = { date: string; paidMinor: number; receivedMinor: number; vouchers: number }

export function summariseDays(rows: DayBookRow[]): DaySummary[] {
  const days = new Map<string, DaySummary>()
  for (const r of rows) {
    const day = days.get(r.date) ?? { date: r.date, paidMinor: 0, receivedMinor: 0, vouchers: 0 }
    day.paidMinor += r.paidMinor
    day.receivedMinor += r.receivedMinor
    day.vouchers++
    days.set(r.date, day)
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export type HeadSummary = { accountId: string; paidMinor: number; receivedMinor: number; vouchers: number }

/**
 * Totals per account head. With a head filter, only that head's share counts,
 * so the summary never claims money another head was paid.
 */
export function summariseHeads(rows: DayBookRow[], headAccountId?: string): HeadSummary[] {
  const heads = new Map<string, HeadSummary>()
  for (const r of rows) {
    for (const c of r.counter) {
      if (headAccountId && c.accountId !== headAccountId) continue
      const head = heads.get(c.accountId) ?? { accountId: c.accountId, paidMinor: 0, receivedMinor: 0, vouchers: 0 }
      head.paidMinor += c.paidMinor
      head.receivedMinor += c.receivedMinor
      head.vouchers++
      heads.set(c.accountId, head)
    }
  }
  return [...heads.values()].sort((a, b) => b.paidMinor - a.paidMinor || b.receivedMinor - a.receivedMinor)
}

/** Register movement per cash/bank ledger, for comparison with the journal totals. */
export function movementByAccount(rows: DayBookRow[]) {
  const out = new Map<string, { debitMinor: number; creditMinor: number }>()
  for (const r of rows) {
    for (const l of r.cashLines) {
      const m = out.get(l.accountId) ?? { debitMinor: 0, creditMinor: 0 }
      m.debitMinor += l.debitMinor
      m.creditMinor += l.creditMinor
      out.set(l.accountId, m)
    }
  }
  return out
}

export type CashBankReconciliation = {
  accountId: string
  openingMinor: number
  ledgerDebitMinor: number
  ledgerCreditMinor: number
  registerDebitMinor: number
  registerCreditMinor: number
  closingMinor: number
  ledgerClosingMinor: number
  matches: boolean
}

/**
 * Opening + register receipts − register payments must equal the ledger's own
 * closing balance, and the register must carry every journal line in the period.
 */
export function reconcileCashBank(input: {
  accountId: string
  openingMinor: number
  ledger: { debitMinor: number; creditMinor: number }
  register: { debitMinor: number; creditMinor: number }
  ledgerClosingMinor: number
}): CashBankReconciliation {
  const closingMinor = input.openingMinor + input.register.debitMinor - input.register.creditMinor
  return {
    accountId: input.accountId,
    openingMinor: input.openingMinor,
    ledgerDebitMinor: input.ledger.debitMinor,
    ledgerCreditMinor: input.ledger.creditMinor,
    registerDebitMinor: input.register.debitMinor,
    registerCreditMinor: input.register.creditMinor,
    closingMinor,
    ledgerClosingMinor: input.ledgerClosingMinor,
    matches:
      input.register.debitMinor === input.ledger.debitMinor
      && input.register.creditMinor === input.ledger.creditMinor
      && closingMinor === input.ledgerClosingMinor,
  }
}

export type ExpenseFact = {
  id: string
  amountMinor: number
  expenseDate: string
  deleted: boolean
  cashAccountId: string | null
}

export type PostedFact = { sourceId: string; totalMinor: number; date: string; creditAccountIds: string[] }

export type ExpensePostingIssue = {
  expenseId: string
  kind: 'UNPOSTED' | 'AMOUNT' | 'DATE' | 'ACCOUNT' | 'NOT_REVERSED'
  message: string
}

/**
 * Expenses post in the background; this lists every expense whose journal
 * entry is missing or no longer matches it, so nothing silently drifts.
 */
export function checkExpensePostings(expenses: ExpenseFact[], posted: PostedFact[]): ExpensePostingIssue[] {
  const active = new Map(posted.map((p) => [p.sourceId, p]))
  const issues: ExpensePostingIssue[] = []
  for (const e of expenses) {
    const entry = active.get(e.id)
    if (e.deleted || e.amountMinor <= 0) {
      if (entry) issues.push({ expenseId: e.id, kind: 'NOT_REVERSED', message: 'Expense was removed but its entry is still in the books' })
      continue
    }
    if (!entry) {
      issues.push({ expenseId: e.id, kind: 'UNPOSTED', message: 'No journal entry yet' })
      continue
    }
    if (entry.totalMinor !== e.amountMinor) {
      issues.push({ expenseId: e.id, kind: 'AMOUNT', message: 'Journal amount differs from the expense' })
    } else if (entry.date !== e.expenseDate) {
      issues.push({ expenseId: e.id, kind: 'DATE', message: 'Journal date differs from the expense' })
    } else if (e.cashAccountId && !entry.creditAccountIds.includes(e.cashAccountId)) {
      issues.push({ expenseId: e.id, kind: 'ACCOUNT', message: 'Paid from a different cash / bank ledger than recorded' })
    }
  }
  return issues
}
