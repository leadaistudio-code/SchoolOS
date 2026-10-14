import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isTenantScoped } from '@/server/db/tenant-models'
import {
  allocateVendorPayment,
  billOutstanding,
  billReducible,
  cancelledInvoiceKey,
  checkVendorTaxIds,
  computePurchaseLine,
  gstinCheckChar,
  isValidGstin,
  isValidPan,
  priceDebitNote,
  sumPurchaseLines,
  summariseVendor,
  supplierInvoiceKey,
  type VendorFacts,
  type VoucherLineFacts,
} from '@/server/modules/accounting/payables'

const flagsMock = vi.hoisted(() => ({ module: true }))

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

// A GSTIN built with a computed check character, so the test does not depend
// on any real taxpayer's number.
const BODY = '27AAPFU0939F1Z'
const GSTIN = BODY + gstinCheckChar(BODY)

describe('vendor identifiers', () => {
  it('accepts a well-formed GSTIN and rejects a wrong check character', () => {
    expect(isValidGstin(GSTIN)).toBe(true)
    const wrong = BODY + (GSTIN.endsWith('A') ? 'B' : 'A')
    expect(isValidGstin(wrong)).toBe(false)
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false)
  })

  it('validates PAN shape and that it matches the GSTIN', () => {
    expect(isValidPan('AAPFU0939F')).toBe(true)
    expect(isValidPan('AAPF00939F')).toBe(false)
    expect(checkVendorTaxIds(GSTIN, 'AAPFU0939F')).toEqual([])
    expect(checkVendorTaxIds(GSTIN, 'ABCDE1234F').map((i) => i.field)).toEqual(['pan'])
    expect(checkVendorTaxIds(null, null)).toEqual([])
  })

  it('treats supplier invoice numbers that differ only in punctuation or case as duplicates', () => {
    expect(supplierInvoiceKey('inv/2026-27/001')).toBe(supplierInvoiceKey('INV 2026 27 001'))
    expect(cancelledInvoiceKey('INV1', 'pv_1')).not.toBe('INV1')
  })
})

describe('purchase voucher lines', () => {
  it('computes tax half-up and totals', () => {
    const line = computePurchaseLine({ quantity: 3, unitCostMinor: 333, taxPercent: 18 })
    expect(line).toEqual({ amountMinor: 999, taxMinor: 180, totalMinor: 1179 })
    expect(sumPurchaseLines([line, { amountMinor: 1000, taxMinor: 0, totalMinor: 1000 }])).toEqual({
      subtotalMinor: 1999,
      taxMinor: 180,
      totalMinor: 2179,
    })
  })

  it('rejects zero quantity, negative cost and impossible tax', () => {
    expect(() => computePurchaseLine({ quantity: 0, unitCostMinor: 100, taxPercent: 0 })).toThrow()
    expect(() => computePurchaseLine({ quantity: 1, unitCostMinor: -1, taxPercent: 0 })).toThrow()
    expect(() => computePurchaseLine({ quantity: 1, unitCostMinor: 100, taxPercent: 101 })).toThrow()
  })
})

const LINE: VoucherLineFacts = {
  id: 'l1',
  quantity: 3,
  amountMinor: 1000_00,
  taxMinor: 180_00,
  taxPercent: 18,
  returnedQuantity: 0,
  returnedAmountMinor: 0,
  returnedTaxMinor: 0,
}

describe('debit notes', () => {
  it('prices a partial return pro rata and the last units at exactly what is left', () => {
    const first = priceDebitNote([LINE], [{ voucherLineId: 'l1', quantity: 1 }], 10_000_00)
    expect(first).toEqual({ ok: true, totalMinor: 393_33, lines: [{ voucherLineId: 'l1', quantity: 1, amountMinor: 333_33, taxMinor: 60_00, totalMinor: 393_33 }] })
    const afterFirst = { ...LINE, returnedQuantity: 1, returnedAmountMinor: 333_33, returnedTaxMinor: 60_00 }
    const rest = priceDebitNote([afterFirst], [{ voucherLineId: 'l1', quantity: 2 }], 10_000_00)
    expect(rest.ok && rest.lines[0]).toMatchObject({ amountMinor: 666_67, taxMinor: 120_00 })
  })

  it('refuses to return more than was bought, counting earlier returns', () => {
    const afterTwo = { ...LINE, returnedQuantity: 2, returnedAmountMinor: 666_66, returnedTaxMinor: 120_00 }
    const result = priceDebitNote([afterTwo], [{ voucherLineId: 'l1', quantity: 2 }], 10_000_00)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.issues[0]!.code).toBe('QUANTITY_EXCEEDED')
  })

  it('caps value-only allowances at the remaining line value', () => {
    const over = priceDebitNote([LINE], [{ voucherLineId: 'l1', quantity: 0, amountMinor: 1000_01 }], 10_000_00)
    expect(!over.ok && over.issues[0]!.code).toBe('VALUE_EXCEEDED')
    const allowance = priceDebitNote([LINE], [{ voucherLineId: 'l1', quantity: 0, amountMinor: 100_00 }], 10_000_00)
    expect(allowance.ok && allowance.lines[0]).toMatchObject({ amountMinor: 100_00, taxMinor: 18_00, totalMinor: 118_00 })
  })

  it('cannot exceed what is still payable on the bill', () => {
    const result = priceDebitNote([LINE], [{ voucherLineId: 'l1', quantity: 3 }], 500_00)
    expect(!result.ok && result.issues[0]!.code).toBe('EXCEEDS_BILL_BALANCE')
  })

  it('rejects unknown and repeated lines', () => {
    const result = priceDebitNote([LINE], [{ voucherLineId: 'l1', quantity: 1 }, { voucherLineId: 'l1', quantity: 1 }, { voucherLineId: 'zz', quantity: 1 }], 10_000_00)
    expect(!result.ok && result.issues.map((i) => i.code)).toEqual(['DUPLICATE_LINE', 'UNKNOWN_LINE'])
  })

  it('pending notes reserve bill balance', () => {
    const facts = { totalMinor: 1000, allocatedMinor: 300, approvedNotesMinor: 100, adjustmentsMinor: 50, pendingNotesMinor: 200 }
    expect(billOutstanding(facts)).toBe(550)
    expect(billReducible(facts)).toBe(350)
  })
})

describe('vendor payments', () => {
  const bills = [
    { id: 'b2', number: 'PV-2', dueDate: '2026-05-10', reducibleMinor: 500 },
    { id: 'b1', number: 'PV-1', dueDate: '2026-04-10', reducibleMinor: 300 },
  ]

  it('settles oldest due first and parks the rest on account', () => {
    expect(allocateVendorPayment(1000, bills)).toEqual({
      ok: true,
      allocations: [{ voucherId: 'b1', amountMinor: 300 }, { voucherId: 'b2', amountMinor: 500 }],
      onAccountMinor: 200,
    })
  })

  it('supports a partial payment against a chosen bill', () => {
    expect(allocateVendorPayment(200, bills, [{ voucherId: 'b2', amountMinor: 200 }])).toEqual({
      ok: true,
      allocations: [{ voucherId: 'b2', amountMinor: 200 }],
      onAccountMinor: 0,
    })
  })

  it('refuses over-allocation and unknown bills', () => {
    expect(allocateVendorPayment(1000, bills, [{ voucherId: 'b1', amountMinor: 301 }]).ok).toBe(false)
    expect(allocateVendorPayment(100, bills, [{ voucherId: 'b1', amountMinor: 50 }, { voucherId: 'b2', amountMinor: 60 }]).ok).toBe(false)
    expect(allocateVendorPayment(100, bills, [{ voucherId: 'nope', amountMinor: 50 }]).ok).toBe(false)
    expect(allocateVendorPayment(0, bills).ok).toBe(false)
  })
})

describe('vendor summary', () => {
  const facts: VendorFacts = {
    vouchers: [
      { id: 'b1', number: 'PV-1', supplierInvoiceNo: 'A1', invoiceDate: '2026-04-01', dueDate: '2026-04-30', status: 'POSTED', totalMinor: 10_000 },
      { id: 'b2', number: 'PV-2', supplierInvoiceNo: 'A2', invoiceDate: '2026-05-01', dueDate: '2026-06-30', status: 'POSTED', totalMinor: 5_000 },
      { id: 'bx', number: 'PV-3', supplierInvoiceNo: 'A3', invoiceDate: '2026-05-01', dueDate: '2026-06-30', status: 'CANCELLED', totalMinor: 99_999 },
      { id: 'bd', number: 'PV-4', supplierInvoiceNo: 'A4', invoiceDate: '2026-05-01', dueDate: '2026-06-30', status: 'DRAFT', totalMinor: 77_777 },
    ],
    payments: [
      { id: 'p1', status: 'POSTED', amountMinor: 7_000, allocations: [{ voucherId: 'b1', amountMinor: 6_000 }] },
      { id: 'p2', status: 'CANCELLED', amountMinor: 3_000, allocations: [{ voucherId: 'b1', amountMinor: 3_000 }] },
    ],
    debitNotes: [
      { id: 'n1', voucherId: 'b1', status: 'APPROVED', totalMinor: 1_000 },
      { id: 'n2', voucherId: 'b2', status: 'SUBMITTED', totalMinor: 500 },
      { id: 'n3', voucherId: 'b2', status: 'REJECTED', totalMinor: 4_000 },
    ],
    adjustments: [{ id: 'a1', voucherId: 'b1', status: 'POSTED', type: 'DISCOUNT', amountMinor: 200 }],
  }

  it('computes the metrics from posted and approved documents only', () => {
    const s = summariseVendor(facts, '2026-05-15')
    expect(s).toMatchObject({
      totalInvoicedMinor: 15_000,
      totalSettledMinor: 7_000,
      totalDebitNotesMinor: 1_000,
      totalAdjustmentsMinor: 200,
      netLiabilityMinor: 6_800,
      onAccountMinor: 1_000,
      billOutstandingMinor: 7_800,
      pendingDebitNotesMinor: 500,
      reconciled: true,
    })
    const b1 = s.bills.find((b) => b.voucherId === 'b1')!
    expect(b1).toMatchObject({ outstandingMinor: 2_800, overdue: true })
    const b2 = s.bills.find((b) => b.voucherId === 'b2')!
    expect(b2).toMatchObject({ outstandingMinor: 5_000, reducibleMinor: 4_500, overdue: false })
  })

  it('flags allocations to bills that are not posted', () => {
    const broken: VendorFacts = { ...facts, payments: [{ id: 'p9', status: 'POSTED', amountMinor: 100, allocations: [{ voucherId: 'bx', amountMinor: 100 }] }] }
    expect(summariseVendor(broken, '2026-05-15').reconciled).toBe(false)
  })
})

describe('payables access and isolation', () => {
  function fakeCtx(permissions: string[]) {
    const can = (p: string) => permissions.includes(p)
    return {
      user: { userId: 'u1', firstName: 'A', lastName: 'B', roleKeys: [] },
      tenant: { id: 't1', currency: 'INR' },
      can,
      canAny: (...ps: string[]) => ps.some(can),
      require: (p: string) => {
        if (!can(p)) throw new Error(`Missing permission: ${p}`)
      },
      db: {
        vendor: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
        purchaseVoucher: { findMany: vi.fn(async () => []) },
        vendorPayment: { findMany: vi.fn(async () => []) },
        debitNote: { findMany: vi.fn(async () => []) },
        vendorAdjustment: { findMany: vi.fn(async () => []) },
      },
    } as never
  }

  beforeEach(() => {
    flagsMock.module = true
  })

  it('every payables table is tenant scoped', () => {
    for (const model of ['Vendor', 'PurchaseVoucher', 'PurchaseVoucherLine', 'VendorPayment', 'VendorPaymentAllocation', 'DebitNote', 'DebitNoteLine', 'VendorAdjustment']) {
      expect(isTenantScoped(model)).toBe(true)
    }
  })

  it('is closed while the accounting module is switched off', async () => {
    flagsMock.module = false
    const { listVendors } = await import('@/server/modules/accounting/payables-service')
    await expect(listVendors(fakeCtx(['accounts.view']), {})).rejects.toMatchObject({ status: 403, code: 'FEATURE_DISABLED' })
  })

  it('needs accounts.view to read and accounts.manage to write', async () => {
    const { listVendors, createVendor } = await import('@/server/modules/accounting/payables-service')
    await expect(listVendors(fakeCtx(['fees.view']), {})).rejects.toThrow('Missing permission: accounts.view')
    await expect(listVendors(fakeCtx(['accounts.view']), {})).resolves.toMatchObject({ total: 0, rows: [] })
    await expect(createVendor(fakeCtx(['accounts.view']), { name: 'Acme' })).rejects.toThrow('Missing permission: accounts.manage')
  })

  it('rejects a malformed GSTIN before touching the database', async () => {
    const { createVendor } = await import('@/server/modules/accounting/payables-service')
    await expect(createVendor(fakeCtx(['accounts.manage']), { name: 'Acme Supplies', gstin: '27AAPFU0939F1ZX' }))
      .rejects.toMatchObject({ status: 400 })
  })
})
