import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  allocateProRata,
  buildDayBookRow,
  checkExpensePostings,
  dayBookTotals,
  filterRows,
  movementByAccount,
  reconcileCashBank,
  summariseDays,
  summariseHeads,
  type DayBookEntry,
  type DayBookRow,
} from '@/server/modules/accounting/day-book'
import { nextDocumentNumber } from '@/server/numbering'

const flagsMock = vi.hoisted(() => ({ module: true }))
const syncMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/server/modules/accounting/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/modules/accounting/service')>()
  return {
    ...actual,
    getAccountingFlags: vi.fn(async () => ({
      module: flagsMock.module,
      studentLedger: false,
      approvals: false,
      whatsappReceipts: false,
      fiscalYearStartMonth: 4,
    })),
  }
})
vi.mock('@/server/modules/accounts/posting', () => ({ syncExpenseLedger: syncMock }))
vi.mock('@/server/audit', () => ({ audit: vi.fn(async () => undefined) }))

const CASH = 'cash'
const BANK = 'bank'
const BOTH = new Set([CASH, BANK])

let seq = 0
function entry(lines: DayBookEntry['lines'], extra: Partial<DayBookEntry> = {}): DayBookEntry {
  seq++
  return {
    id: `e${seq}`,
    number: `JV-2627-${String(seq).padStart(5, '0')}`,
    date: '2026-10-14',
    voucherType: 'PAYMENT',
    sourceType: 'EXPENSE',
    sourceId: `x${seq}`,
    narration: null,
    reference: null,
    isReversal: false,
    reversedAt: null,
    createdByLabel: null,
    createdAt: new Date('2026-10-14T05:00:00Z'),
    lines,
    ...extra,
  }
}
const dr = (accountId: string, amount: number) => ({ accountId, debitMinor: amount, creditMinor: 0 })
const cr = (accountId: string, amount: number) => ({ accountId, debitMinor: 0, creditMinor: amount })
const rowOf = (e: DayBookEntry, cash: ReadonlySet<string> = BOTH) => buildDayBookRow(e, cash) as DayBookRow

describe('pro-rata allocation', () => {
  it('always adds up to the total, the last weight taking the remainder', () => {
    expect(allocateProRata(100, [1, 1, 1])).toEqual([33, 33, 34])
    expect(allocateProRata(10_001, [7, 0, 3])).toEqual([7000, 0, 3001])
    expect(allocateProRata(0, [5, 5])).toEqual([0, 0])
    expect(allocateProRata(50, [0, 0])).toEqual([0, 0])
  })
})

describe('day book rows', () => {
  it('a paid expense is money out against its head', () => {
    const r = rowOf(entry([dr('electricity', 4_500_00), cr(CASH, 4_500_00)]))
    expect(r).toMatchObject({ paidMinor: 4_500_00, receivedMinor: 0 })
    expect(r.counter).toEqual([{ accountId: 'electricity', paidMinor: 4_500_00, receivedMinor: 0 }])
  })

  it('payroll: only the cash actually paid is attributed to salary', () => {
    const r = rowOf(entry([dr('salary', 100_000), cr(BANK, 90_000), cr('deductions', 10_000)]))
    expect(r.paidMinor).toBe(90_000)
    expect(r.counter).toEqual([{ accountId: 'salary', paidMinor: 90_000, receivedMinor: 0 }])
  })

  it('a reversal is its own row with money coming back', () => {
    const r = rowOf(entry([dr(CASH, 4_500_00), cr('electricity', 4_500_00)], { isReversal: true }))
    expect(r).toMatchObject({ paidMinor: 0, receivedMinor: 4_500_00 })
    expect(r.counter).toEqual([{ accountId: 'electricity', paidMinor: 0, receivedMinor: 4_500_00 }])
  })

  it('cash-to-bank contra shows both sides and no head; per-ledger view sees the other ledger', () => {
    const contra = entry([dr(BANK, 20_000), cr(CASH, 20_000)], { voucherType: 'CONTRA', sourceType: 'MANUAL' })
    expect(rowOf(contra)).toMatchObject({ paidMinor: 20_000, receivedMinor: 20_000, counter: [] })
    const cashOnly = rowOf(contra, new Set([CASH]))
    expect(cashOnly).toMatchObject({ paidMinor: 20_000, receivedMinor: 0 })
    expect(cashOnly.counter).toEqual([{ accountId: BANK, paidMinor: 20_000, receivedMinor: 0 }])
  })

  it('ignores entries that never touch cash or bank (e.g. a purchase on credit)', () => {
    expect(buildDayBookRow(entry([dr('stationery', 5_000), cr('creditors', 5_000)]), BOTH)).toBeNull()
  })
})

describe('register totals reconcile with the journal lines', () => {
  const entries = [
    entry([dr('electricity', 4_500_00), cr(CASH, 4_500_00)], { date: '2026-10-01' }),
    entry([dr('salary', 100_000), cr(BANK, 90_000), cr('deductions', 10_000)], { date: '2026-10-01' }),
    entry([dr(BANK, 250_000), cr('tuition', 250_000)], { voucherType: 'RECEIPT', sourceType: 'FEE_PAYMENT', date: '2026-10-02' }),
    entry([dr(CASH, 4_500_00), cr('electricity', 4_500_00)], { isReversal: true, date: '2026-10-03' }),
    entry([dr('creditors', 33_333), cr(BANK, 33_333)], { sourceType: 'VENDOR_PAYMENT', date: '2026-10-03' }),
    entry([dr('repairs', 1_001), dr('stationery', 2_002), cr(CASH, 3_003)], { date: '2026-10-03' }),
  ]
  const rows = entries.map((e) => rowOf(e))

  it('Σ paid = Σ cash/bank credits and Σ received = Σ cash/bank debits', () => {
    const lines = entries.flatMap((e) => e.lines).filter((l) => BOTH.has(l.accountId))
    const totals = dayBookTotals(rows)
    expect(totals.paidMinor).toBe(lines.reduce((s, l) => s + l.creditMinor, 0))
    expect(totals.receivedMinor).toBe(lines.reduce((s, l) => s + l.debitMinor, 0))
    expect(totals.vouchers).toBe(6)
  })

  it('head summary adds up exactly to the register', () => {
    const heads = summariseHeads(rows)
    const totals = dayBookTotals(rows)
    expect(heads.reduce((s, h) => s + h.paidMinor, 0)).toBe(totals.paidMinor)
    expect(heads.reduce((s, h) => s + h.receivedMinor, 0)).toBe(totals.receivedMinor)
    const electricity = heads.find((h) => h.accountId === 'electricity')!
    expect(electricity.paidMinor - electricity.receivedMinor).toBe(0)
  })

  it('per-ledger movement matches the lines of each ledger', () => {
    const m = movementByAccount(rows)
    expect(m.get(CASH)).toEqual({ debitMinor: 4_500_00, creditMinor: 4_500_00 + 3_003 })
    expect(m.get(BANK)).toEqual({ debitMinor: 250_000, creditMinor: 90_000 + 33_333 })
  })

  it('days are newest first with their own totals', () => {
    const days = summariseDays(rows)
    expect(days.map((d) => d.date)).toEqual(['2026-10-03', '2026-10-02', '2026-10-01'])
    expect(days[2]).toMatchObject({ paidMinor: 4_500_00 + 90_000, receivedMinor: 0, vouchers: 2 })
  })

  it('direction and head filters', () => {
    expect(filterRows(rows, { direction: 'payments' })).toHaveLength(4)
    expect(filterRows(rows, { direction: 'receipts' })).toHaveLength(2)
    const stationery = filterRows(rows, { headAccountId: 'stationery' })
    expect(stationery).toHaveLength(1)
    expect(summariseHeads(stationery, 'stationery')).toEqual([{ accountId: 'stationery', paidMinor: 2_002, receivedMinor: 0, vouchers: 1 }])
  })
})

describe('cash and bank reconciliation', () => {
  it('matches when the register carries every line and closes at the ledger balance', () => {
    const ok = reconcileCashBank({
      accountId: CASH,
      openingMinor: 10_000,
      ledger: { debitMinor: 5_000, creditMinor: 2_000 },
      register: { debitMinor: 5_000, creditMinor: 2_000 },
      ledgerClosingMinor: 13_000,
    })
    expect(ok).toMatchObject({ closingMinor: 13_000, matches: true })
  })

  it('flags a register that misses a line', () => {
    const bad = reconcileCashBank({
      accountId: CASH,
      openingMinor: 10_000,
      ledger: { debitMinor: 5_000, creditMinor: 2_000 },
      register: { debitMinor: 5_000, creditMinor: 1_500 },
      ledgerClosingMinor: 13_000,
    })
    expect(bad.matches).toBe(false)
  })
})

describe('expense posting check', () => {
  const base = { amountMinor: 1_000, expenseDate: '2026-10-14', deleted: false, cashAccountId: null }
  const posted = (sourceId: string, extra: Partial<{ totalMinor: number; date: string; creditAccountIds: string[] }> = {}) => ({
    sourceId, totalMinor: 1_000, date: '2026-10-14', creditAccountIds: [CASH], ...extra,
  })

  it('finds missing, stale and un-reversed postings and passes good ones', () => {
    const issues = checkExpensePostings(
      [
        { id: 'good', ...base },
        { id: 'missing', ...base },
        { id: 'amount', ...base, amountMinor: 1_200 },
        { id: 'date', ...base, expenseDate: '2026-10-13' },
        { id: 'account', ...base, cashAccountId: BANK },
        { id: 'removed', ...base, deleted: true },
        { id: 'removed-clean', ...base, deleted: true },
      ],
      [posted('good'), posted('amount'), posted('date'), posted('account'), posted('removed')],
    )
    expect(Object.fromEntries(issues.map((i) => [i.expenseId, i.kind]))).toEqual({
      missing: 'UNPOSTED',
      amount: 'AMOUNT',
      date: 'DATE',
      account: 'ACCOUNT',
      removed: 'NOT_REVERSED',
    })
  })
})

describe('expense voucher numbers', () => {
  it('number from the SchoolExpense voucherNumber column under the advisory lock', async () => {
    const calls: string[] = []
    const tx = {
      $queryRawUnsafe: vi.fn(async (sql: string) => {
        calls.push(sql)
        return sql.includes('FOR UPDATE') ? [{ value: 'EXP-2627-00041' }] : []
      }),
    }
    await expect(nextDocumentNumber(tx as never, { tenantId: 't1', kind: 'EXPENSE_VOUCHER', sessionLabel: '2627' })).resolves.toBe('EXP-2627-00042')
    expect(calls[0]).toContain('pg_advisory_xact_lock')
    expect(calls[1]).toContain('"voucherNumber" AS value FROM "SchoolExpense"')
  })
})

describe('duplicate submissions', () => {
  const head = { id: 'h1', name: 'Electricity', isActive: true, category: 'UTILITIES', nature: 'INDIRECT' }
  const input = {
    title: 'October electricity bill',
    headId: 'h1',
    amount: 4_500_00,
    expenseDate: '2026-10-14',
    paymentMode: 'CASH' as const,
    idempotencyKey: 'key-12345678',
  }
  function ctxWith(db: Record<string, unknown>, permissions = ['expenses.manage', 'accounts.view']) {
    const can = (p: string) => permissions.includes(p)
    return {
      user: { userId: 'u1', firstName: 'A', lastName: 'B', roleKeys: [] },
      tenant: { id: 't1', currency: 'INR' },
      can,
      canAny: (...ps: string[]) => ps.some(can),
      require: (p: string) => {
        if (!can(p)) throw new Error(`Missing permission: ${p}`)
      },
      db,
    } as never
  }

  beforeEach(() => {
    flagsMock.module = true
    syncMock.mockClear()
  })

  it('a retried submission returns the first expense and creates nothing', async () => {
    const { createExpense } = await import('@/server/modules/finance/expenses')
    const first = { id: 'exp1', voucherNumber: 'EXP-2627-00001', idempotencyKey: input.idempotencyKey }
    const create = vi.fn()
    const db = {
      schoolExpense: { findFirst: vi.fn(async () => first), create },
      expenseHead: { findFirst: vi.fn(async () => head) },
      $transaction: vi.fn(),
    }
    await expect(createExpense(ctxWith(db), input)).resolves.toBe(first)
    expect(create).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('two simultaneous submissions: the loser gets the winner back', async () => {
    const { createExpense } = await import('@/server/modules/finance/expenses')
    const winner = { id: 'exp1', voucherNumber: 'EXP-2627-00001' }
    const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winner)
    const db = {
      schoolExpense: { findFirst },
      expenseHead: { findFirst: vi.fn(async () => head) },
      $transaction: vi.fn(async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
      }),
    }
    await expect(createExpense(ctxWith(db), input)).resolves.toBe(winner)
  })

  it('a new expense gets a voucher number inside the same transaction', async () => {
    const { createExpense } = await import('@/server/modules/finance/expenses')
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'exp2', ...data }))
    const tx = {
      $queryRawUnsafe: vi.fn(async (sql: string) => (sql.includes('FOR UPDATE') ? [] : [])),
      schoolExpense: { create },
    }
    const db = {
      schoolExpense: { findFirst: vi.fn(async () => null) },
      expenseHead: { findFirst: vi.fn(async () => head) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    }
    const created = await createExpense(ctxWith(db), input)
    expect(created).toMatchObject({ voucherNumber: 'EXP-2627-00001', idempotencyKey: input.idempotencyKey, amountMinor: input.amount, cashAccountId: null })
  })
})

describe('day book access', () => {
  function ctxWith(permissions: string[]) {
    const can = (p: string) => permissions.includes(p)
    return {
      user: { userId: 'u1', firstName: 'A', lastName: 'B', roleKeys: [] },
      tenant: { id: 't1', currency: 'INR' },
      can,
      canAny: (...ps: string[]) => ps.some(can),
      require: (p: string) => {
        if (!can(p)) throw new Error(`Missing permission: ${p}`)
      },
      db: {},
    } as never
  }

  beforeEach(() => {
    flagsMock.module = true
  })

  it('is closed while the accounting module is switched off', async () => {
    flagsMock.module = false
    const { getDayBook, recordDayBookExpense } = await import('@/server/modules/accounting/day-book-service')
    await expect(getDayBook(ctxWith(['accounts.view']), {})).rejects.toMatchObject({ status: 403, code: 'FEATURE_DISABLED' })
    await expect(recordDayBookExpense(ctxWith(['expenses.manage']), {})).rejects.toMatchObject({ status: 403 })
  })

  it('reading needs accounts.view, recording needs expenses.manage, repair needs accounts.manage', async () => {
    const { getDayBook, recordDayBookExpense, repairExpensePostings } = await import('@/server/modules/accounting/day-book-service')
    await expect(getDayBook(ctxWith(['expenses.view']), {})).rejects.toThrow('Missing permission: accounts.view')
    await expect(recordDayBookExpense(ctxWith(['accounts.view']), {})).rejects.toThrow('Missing permission: expenses.manage')
    await expect(repairExpensePostings(ctxWith(['accounts.view']), {})).rejects.toThrow('Missing permission: accounts.manage')
  })

  it('a cheque or bank payment needs a reference and a retry key, checked before the database', async () => {
    const { recordDayBookExpense } = await import('@/server/modules/accounting/day-book-service')
    const ctx = ctxWith(['expenses.manage'])
    const body = { title: 'Generator repair', headId: 'h1', amount: '1200', expenseDate: '2026-10-14', paymentMode: 'CHEQUE', idempotencyKey: 'key-12345678' }
    await expect(recordDayBookExpense(ctx, body)).rejects.toMatchObject({ issues: [expect.objectContaining({ path: ['referenceNo'] })] })
    await expect(recordDayBookExpense(ctx, { ...body, paymentMode: 'CASH', idempotencyKey: undefined })).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['idempotencyKey'] })],
    })
  })
})
