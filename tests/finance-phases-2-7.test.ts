import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Deployment switches are read once by env(); set them before anything reads it.
const saved = vi.hoisted(() => {
  const prev = { module: process.env.ACCOUNTING_MODULE_ENABLED }
  process.env.ACCOUNTING_MODULE_ENABLED = 'true'
  return prev
})

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}))

vi.mock('@/server/modules/accounting/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/modules/accounting/service')>()
  return {
    ...actual,
    getAccountingFlags: vi.fn(async () => ({ module: true, studentLedger: false, approvals: false, whatsappReceipts: false, fiscalYearStartMonth: 4 })),
  }
})

import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import { yearWiseLedger, type LedgerEntry } from '../src/server/modules/accounting/student-ledger'
import { ageBills, ageingBucketOf, vendorLedger, type VendorLedgerInput } from '../src/server/modules/accounting/payables'
import { bookAccounts, cashBookDays } from '../src/server/modules/accounting/cash-book'
import { expenseBookDays } from '../src/server/modules/finance/expense-book'
import { approvalMode, ACCOUNTING_OFF } from '../src/server/modules/accounting/flags'
import { stockSummaryRow } from '../src/server/modules/store/stock-summary'
import { clearKpiCache, kpisFromSummary } from '../src/server/modules/accounting/analytics-kpis'
import { APPROVAL_STAGES, STAGE_ROLE } from '../src/server/modules/accounting/expense-approval'

const { payablesReport, payablesReconciliation, getVendor360, vendorLedgerFrom } = await import('../src/server/modules/accounting/payables-service')
const { getCashBook } = await import('../src/server/modules/accounting/cash-book')
const { generalLedger, profitAndLoss } = await import('../src/server/modules/accounts/service')
const { getStockSummary } = await import('../src/server/modules/store/stock-summary')
const { getExpenseBook } = await import('../src/server/modules/finance/expense-book')
const { getKpiStrip } = await import('../src/server/modules/accounting/analytics-kpis')
const { resolvePeriod } = await import('../src/server/modules/accounting/analytics')
const { refreshLedgerSummary } = await import('../src/server/modules/accounting/analytics-service')
const { schoolToday } = await import('../src/lib/periods')

const entry = (date: string, debitMinor: number, creditMinor: number): LedgerEntry => ({
  id: `${date}-${debitMinor}-${creditMinor}`, date, kind: 'INVOICE' as never, particulars: '', voucherType: '', voucherNo: '',
  debitMinor, creditMinor, source: { type: 'FeeInvoice', id: 'x' }, details: [],
})

describe('Phase 2: year-wise student ledger', () => {
  const years = [
    { label: '2025-26', startsOn: '2025-04-01', endsOn: '2026-03-31' },
    { label: '2024-25', startsOn: '2024-04-01', endsOn: '2025-03-31' },
  ]

  it('brings forward each year from the previous closing, including older entries', () => {
    const rows = yearWiseLedger([
      entry('2023-06-01', 5_000, 0),
      entry('2024-05-01', 10_000, 0),
      entry('2024-06-01', 0, 8_000),
      entry('2025-05-01', 12_000, 0),
      entry('2025-07-01', 0, 15_000),
    ], years)
    expect(rows.map((r) => r.label)).toEqual(['2024-25', '2025-26'])
    expect(rows[0]).toMatchObject({ openingMinor: 5_000, debitMinor: 10_000, creditMinor: 8_000, closingMinor: 7_000 })
    expect(rows[1]).toMatchObject({ openingMinor: 7_000, debitMinor: 12_000, creditMinor: 15_000, closingMinor: 4_000 })
  })
})

describe('Phase 3: payables', () => {
  it('ages bills by bill date into 0-30 / 31-60 / 61-90 / 90+', () => {
    expect(ageingBucketOf('2026-10-16', '2026-10-16')).toBe('d0_30')
    expect(ageingBucketOf('2026-09-16', '2026-10-16')).toBe('d0_30')
    expect(ageingBucketOf('2026-09-15', '2026-10-16')).toBe('d31_60')
    expect(ageingBucketOf('2026-07-18', '2026-10-16')).toBe('d61_90')
    expect(ageingBucketOf('2026-07-17', '2026-10-16')).toBe('d90_plus')
    const a = ageBills([
      { invoiceDate: '2026-10-01', outstandingMinor: 100 },
      { invoiceDate: '2026-08-20', outstandingMinor: 200 },
      { invoiceDate: '2026-01-01', outstandingMinor: 300 },
      { invoiceDate: '2026-01-01', outstandingMinor: 0 },
    ], '2026-10-16')
    expect(a).toEqual({ d0_30: 100, d31_60: 200, d61_90: 0, d90_plus: 300, totalMinor: 600 })
  })

  it('builds bill-wise ledger vouchers whose closing is the net liability', () => {
    const input: VendorLedgerInput = {
      vouchers: [
        { id: 'b1', number: 'PV-1', supplierInvoiceNo: 'S-1', invoiceDate: '2026-05-10', status: 'POSTED', totalMinor: 10_000 },
        { id: 'b2', number: 'PV-2', supplierInvoiceNo: 'S-2', invoiceDate: '2026-06-10', status: 'DRAFT', totalMinor: 99_999 },
      ],
      payments: [
        { id: 'p0', number: 'VP-0', paidOn: '2026-05-01', mode: 'UPI', status: 'POSTED', amountMinor: 1_000, allocations: [] },
        { id: 'p1', number: 'VP-1', paidOn: '2026-05-20', mode: 'UPI', status: 'POSTED', amountMinor: 6_000, allocations: [{ voucherId: 'b1', amountMinor: 4_000 }] },
      ],
      debitNotes: [{ id: 'd1', number: 'DN-1', noteDate: '2026-05-25', voucherId: 'b1', status: 'APPROVED', totalMinor: 500 }],
      adjustments: [{ id: 'a1', number: 'VA-1', adjustedOn: '2026-05-26', voucherId: 'b1', type: 'DISCOUNT', status: 'POSTED', amountMinor: 250 }],
    }
    const rows = vendorLedger(input)
    expect(rows.map((r) => r.voucherNo)).toEqual(['VP-0', 'PV-1', 'VP-1', 'DN-1', 'VA-1'])
    expect(rows[0]!.refs[0]!.type).toBe('Advance')
    expect(rows[2]!.refs.map((r) => r.type)).toEqual(['Agst Ref', 'On Account'])
    expect(rows.at(-1)!.balanceMinor).toBe(10_000 - 1_000 - 6_000 - 500 - 250)
  })
})

describe('Phase 4: books', () => {
  it('Cash Book days chain opening to closing', () => {
    const days = cashBookDays(1_000, [
      { date: '2026-10-02', debitMinor: 0, creditMinor: 300 },
      { date: '2026-10-01', debitMinor: 500, creditMinor: 0 },
      { date: '2026-10-02', debitMinor: 200, creditMinor: 0 },
    ])
    expect(days).toEqual([
      { date: '2026-10-01', openingMinor: 1_000, receiptsMinor: 500, paymentsMinor: 0, closingMinor: 1_500, vouchers: 1 },
      { date: '2026-10-02', openingMinor: 1_500, receiptsMinor: 200, paymentsMinor: 300, closingMinor: 1_400, vouchers: 2 },
    ])
  })

  it('splits cash and bank ledgers by the CASH key and the cash payment-mode mapping', () => {
    const acc = (id: string, systemKey: string | null) => ({ id, code: id, name: id, systemKey, isActive: true })
    const all = [acc('cash', 'CASH'), acc('bank', 'BANK'), acc('petty', null), acc('bank2', null)]
    expect(bookAccounts(all, new Set(['petty']), 'cash').map((a) => a.id)).toEqual(['cash', 'petty'])
    expect(bookAccounts(all, new Set(['petty']), 'bank').map((a) => a.id)).toEqual(['bank', 'bank2'])
  })

  it('Expense Book days total by nature with a running total', () => {
    const days = expenseBookDays([
      { date: '2026-10-02', nature: 'INDIRECT', amountMinor: 50 },
      { date: '2026-10-01', nature: 'DIRECT', amountMinor: 100 },
      { date: '2026-10-02', nature: 'DIRECT', amountMinor: 25 },
    ])
    expect(days).toEqual([
      { date: '2026-10-01', count: 1, directMinor: 100, indirectMinor: 0, totalMinor: 100, cumulativeMinor: 100 },
      { date: '2026-10-02', count: 2, directMinor: 25, indirectMinor: 50, totalMinor: 75, cumulativeMinor: 175 },
    ])
  })
})

describe('Phase 5: stock summary row', () => {
  it('closing = opening + inward − outward, in quantity and value', () => {
    const r = stockSummaryRow({ id: 'i', sku: 'S', name: 'Tie', variant: null, unit: 'pcs' }, { oq: 10, ov: 1_000, iq: 5n, iv: 600n, xq: 4, xv: 420 })
    expect(r).toMatchObject({ closingQty: 11, closingValueMinor: 1_180, closingRateMinor: 107 })
  })
})

describe('Phase 6: approval mode and labels', () => {
  it('is mandatory only with the school switch, optional when the deployment allows it, else off', () => {
    const on = { ...ACCOUNTING_OFF, module: true }
    expect(approvalMode({ ...on, approvals: true }, true)).toBe('mandatory')
    expect(approvalMode(on, true)).toBe('optional')
    expect(approvalMode(on, false)).toBe('off')
    expect(approvalMode(ACCOUNTING_OFF, true)).toBe('off')
  })

  it('names the stages Creator, Validator, Approver, Approver, Final Approver', () => {
    expect(Object.values(STAGE_ROLE)).toEqual(['Creator', 'Validator', 'Approver', 'Approver', 'Final Approver'])
    expect(APPROVAL_STAGES.map((s) => s.label.split(' (')[0])).toEqual(['Validator', 'Approver', 'Approver', 'Final Approver'])
  })
})

describe('Phase 7: KPIs from the monthly summary', () => {
  it('uses P&L definitions: income Cr−Dr, expenses Dr−Cr split by nature', () => {
    const accounts = [
      { id: 'inc', type: 'INCOME', expenseNature: null, systemKey: null, openingBalanceMinor: 0 },
      { id: 'dir', type: 'EXPENSE', expenseNature: 'DIRECT', systemKey: null, openingBalanceMinor: 0 },
      { id: 'ind', type: 'EXPENSE', expenseNature: null, systemKey: null, openingBalanceMinor: 0 },
    ]
    const k = kpisFromSummary([
      { month: '2026-04', accountId: 'inc', debitMinor: 100, creditMinor: 1_100 },
      { month: '2026-04', accountId: 'dir', debitMinor: 300, creditMinor: 0 },
      { month: '2026-05', accountId: 'ind', debitMinor: 250, creditMinor: 50 },
      { month: '2026-06', accountId: 'inc', debitMinor: 0, creditMinor: 999 },
    ], accounts, ['2026-04', '2026-05'])
    expect(k).toMatchObject({ incomeMinor: 1_000, directMinor: 300, indirectMinor: 200, grossSurplusMinor: 700, surplusMinor: 500 })
    expect(k.months.map((m) => m.surplusMinor)).toEqual([700, -200])
  })
})

// ------------------------------------------------------------- database (read-only)

const prisma = new PrismaClient()
let ctx: AppContext

function contextFor(id: string, held: string[]): AppContext {
  const set = new Set(held)
  return {
    user: {
      sessionId: 's_test', userId: 'u_test', tenantId: id, isSuperAdmin: false,
      firstName: 'Phase', lastName: 'Tester', email: null, phone: null, avatarUrl: null, displayName: null,
      mustChangePassword: false, roleKeys: ['SCHOOL_ADMIN'], permissions: set, impersonatedById: null,
    },
    tenant: { id, name: 'Test School', currency: 'INR' } as never,
    db: tenantDb(id),
    can: (p: string) => set.has(p),
    canAny: (...ps: string[]) => ps.some((p) => set.has(p)),
    require: (p: string) => {
      if (!set.has(p)) throw new Error(`Missing permission: ${p}`)
    },
  }
}

beforeAll(async () => {
  const demo = await prisma.tenant.findFirstOrThrow({ where: { slug: 'demo' }, select: { id: true } })
  ctx = contextFor(demo.id, ['accounts.view', 'store.view', 'expenses.view'])
})

afterAll(async () => {
  await prisma.$disconnect()
  if (saved.module === undefined) delete process.env.ACCOUNTING_MODULE_ENABLED
  else process.env.ACCOUNTING_MODULE_ENABLED = saved.module
})

describe('database checks on the demo school', () => {
  it('payables report totals equal the vendor sub-ledger, and buckets sum to bills outstanding', async () => {
    const [report, rec] = await Promise.all([payablesReport(ctx), payablesReconciliation(ctx)])
    expect(report.totals.netLiabilityMinor).toBe(rec.subledgerMinor)
    const t = report.totals
    expect(t.d0_30 + t.d31_60 + t.d61_90 + t.d90_plus).toBe(t.billsMinor)
  })

  it('each vendor ledger closes at its net liability', async () => {
    const vendors = await ctx.db.vendor.findMany({ select: { id: true }, take: 20 })
    for (const v of vendors) {
      const v360 = await getVendor360(ctx, v.id)
      const rows = vendorLedgerFrom(v360)
      expect(rows.at(-1)?.balanceMinor ?? 0).toBe(v360.summary.netLiabilityMinor)
    }
  })

  it('Cash Book and Bank Book close where the general ledger closes', async () => {
    const to = schoolToday()
    const from = `${to.slice(0, 4)}-04-01` <= to ? `${to.slice(0, 4)}-04-01` : `${Number(to.slice(0, 4)) - 1}-04-01`
    for (const book of ['cash', 'bank'] as const) {
      const cb = await getCashBook(ctx, { book, from, to })
      if (!cb.account || !cb.ledger) continue
      const gl = await generalLedger(ctx, { accountId: cb.account.id, from, to })
      expect(cb.days.at(-1)?.closingMinor ?? gl.openingMinor).toBe(gl.closingMinor)
      expect(cb.days.reduce((s, d) => s + d.receiptsMinor - d.paymentsMinor, 0)).toBe(gl.debitMinor - gl.creditMinor)
    }
  })

  it('stock summary closing quantity as of today equals each item’s quantity in hand', async () => {
    const summary = await getStockSummary(ctx, { from: '2000-01-01', to: schoolToday() })
    const items = await ctx.db.storeItem.findMany({ select: { id: true, quantity: true } })
    const qty = new Map(items.map((i) => [i.id, i.quantity]))
    for (const r of summary.rows) expect(r.closingQty).toBe(qty.get(r.itemId))
  })

  it('Expense Book day totals add up to the period total', async () => {
    const to = schoolToday()
    const book = await getExpenseBook(ctx, { from: `${to.slice(0, 7)}-01`, to })
    expect(book.days.reduce((s, d) => s + d.totalMinor, 0)).toBe(book.truncated ? expect.any(Number) : book.totalMinor)
  })

  it('KPI strip matches the Profit & Loss for the same months, and caches', async () => {
    await refreshLedgerSummary(ctx.tenant.id)
    clearKpiCache()
    const period = resolvePeriod({}, schoolToday())
    const [kpis, pl] = await Promise.all([getKpiStrip(ctx, period), profitAndLoss(ctx, { from: period.from, to: period.to })])
    expect(kpis.measured).toMatchObject({ cached: false, queries: 2 })
    expect(kpis.incomeMinor).toBe(pl.incomeMinor)
    expect(kpis.directMinor).toBe(pl.directMinor)
    expect(kpis.indirectMinor).toBe(pl.indirectMinor)
    expect(kpis.surplusMinor).toBe(pl.surplusMinor)
    const again = await getKpiStrip(ctx, period)
    expect(again.measured.cached).toBe(true)
    expect(again.incomeMinor).toBe(kpis.incomeMinor)
  })
})
