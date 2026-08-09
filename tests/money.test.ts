import { describe, expect, it } from 'vitest'
import {
  allocatePayment,
  applyConcession,
  assertMinor,
  computeInvoiceTotals,
  deriveInvoiceStatus,
  lateFeeFor,
  percentOf,
  refundableMinor,
  sumMinor,
} from '../src/lib/money'
import { financialYearLabel } from '../src/server/numbering'

/**
 * Money is the part of a school ERP that gets audited. These tests exist to
 * prove three things: nothing is stored as a float, no rupee is invented or
 * lost during allocation, and status always agrees with the balance.
 */
describe('minor units', () => {
  it('refuses a fractional amount', () => {
    expect(() => assertMinor(10.5)).toThrow(/integer number of paise/i)
  })

  it('accepts zero and large integers', () => {
    expect(assertMinor(0)).toBe(0)
    expect(assertMinor(2_46_00_000)).toBe(24600000)
  })

  it('refuses an unsafe integer', () => {
    expect(() => assertMinor(Number.MAX_SAFE_INTEGER + 2)).toThrow()
  })

  it('sums without float error', () => {
    // The classic failure: 0.1 + 0.2 !== 0.3 in floating point.
    expect(sumMinor([10, 20])).toBe(30)
    expect(sumMinor([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(55)
  })
})

describe('percentages', () => {
  it('computes a clean percentage', () => {
    expect(percentOf(1000000, 10)).toBe(100000) // 10% of 10,000
  })

  it('rounds half up, consistently', () => {
    expect(percentOf(333, 50)).toBe(167) // 166.5 -> 167
    expect(percentOf(101, 50)).toBe(51) // 50.5 -> 51
  })

  it('handles the boundaries', () => {
    expect(percentOf(12345, 0)).toBe(0)
    expect(percentOf(12345, 100)).toBe(12345)
  })

  it('refuses a nonsense percentage', () => {
    expect(() => percentOf(1000, 101)).toThrow()
    expect(() => percentOf(1000, -1)).toThrow()
  })
})

describe('concessions', () => {
  it('applies a percentage', () => {
    expect(applyConcession(1000000, 'PERCENT', 25)).toEqual({ discount: 250000, net: 750000 })
  })

  it('applies a flat amount', () => {
    expect(applyConcession(1000000, 'FLAT', 300000)).toEqual({ discount: 300000, net: 700000 })
  })

  it('never discounts more than the amount, so no credit is created', () => {
    // A 5,000 scholarship against a 3,000 fee zeroes it; it does not owe 2,000.
    expect(applyConcession(300000, 'FLAT', 500000)).toEqual({ discount: 300000, net: 0 })
  })

  it('never produces a negative net', () => {
    const { net } = applyConcession(1, 'FLAT', 999999)
    expect(net).toBe(0)
  })

  it('stacks two concessions on the diminished balance, not the original', () => {
    // 10,000 -> 50% -> 5,000 -> 10% of 5,000 -> 4,500. Not 4,000.
    const first = applyConcession(1000000, 'PERCENT', 50)
    const second = applyConcession(first.net, 'PERCENT', 10)
    expect(first.discount + second.discount).toBe(550000)
    expect(second.net).toBe(450000)
  })
})

describe('payment allocation', () => {
  const invoices = [
    { id: 'a', balanceMinor: 500000 },
    { id: 'b', balanceMinor: 300000 },
    { id: 'c', balanceMinor: 200000 },
  ]

  it('settles the oldest invoice first', () => {
    const { allocations } = allocatePayment(500000, invoices)
    expect(allocations).toEqual([{ id: 'a', amountMinor: 500000 }])
  })

  it('spills across invoices in order', () => {
    const { allocations, unallocatedMinor } = allocatePayment(700000, invoices)
    expect(allocations).toEqual([
      { id: 'a', amountMinor: 500000 },
      { id: 'b', amountMinor: 200000 },
    ])
    expect(unallocatedMinor).toBe(0)
  })

  it('never allocates more than the payment', () => {
    const { allocations } = allocatePayment(400000, invoices)
    expect(sumMinor(allocations.map((a) => a.amountMinor))).toBe(400000)
  })

  it('never allocates more to an invoice than it owes', () => {
    const { allocations } = allocatePayment(1000000, invoices)
    for (const a of allocations) {
      const invoice = invoices.find((i) => i.id === a.id)!
      expect(a.amountMinor).toBeLessThanOrEqual(invoice.balanceMinor)
    }
  })

  it('returns an overpayment as an advance rather than losing it', () => {
    const { allocations, unallocatedMinor } = allocatePayment(1200000, invoices)
    expect(sumMinor(allocations.map((a) => a.amountMinor))).toBe(1000000)
    expect(unallocatedMinor).toBe(200000)
  })

  it('conserves money: allocated + unallocated always equals the payment', () => {
    for (const amount of [1, 999, 100000, 700001, 1000000, 5000000]) {
      const { allocations, unallocatedMinor } = allocatePayment(amount, invoices)
      expect(sumMinor(allocations.map((a) => a.amountMinor)) + unallocatedMinor).toBe(amount)
    }
  })

  it('skips invoices that are already settled', () => {
    const { allocations } = allocatePayment(100000, [
      { id: 'paid', balanceMinor: 0 },
      { id: 'due', balanceMinor: 100000 },
    ])
    expect(allocations).toEqual([{ id: 'due', amountMinor: 100000 }])
  })

  it('holds the whole amount when there is nothing to settle', () => {
    const { allocations, unallocatedMinor } = allocatePayment(100000, [])
    expect(allocations).toEqual([])
    expect(unallocatedMinor).toBe(100000)
  })

  it('refuses a zero or negative payment', () => {
    expect(() => allocatePayment(0, invoices)).toThrow(/greater than zero/i)
    expect(() => allocatePayment(-100, invoices)).toThrow()
  })
})

describe('invoice totals', () => {
  it('derives totals from lines', () => {
    const totals = computeInvoiceTotals([
      { amountMinor: 1200000, discountMinor: 200000, taxPercent: 0 },
      { amountMinor: 500000, discountMinor: 0, taxPercent: 0 },
    ])
    expect(totals.subtotalMinor).toBe(1700000)
    expect(totals.discountMinor).toBe(200000)
    expect(totals.totalMinor).toBe(1500000)
  })

  it('applies tax to the discounted amount, not the gross', () => {
    const totals = computeInvoiceTotals([
      { amountMinor: 100000, discountMinor: 50000, taxPercent: 10 },
    ])
    expect(totals.taxMinor).toBe(5000) // 10% of 50,000 not of 100,000
    expect(totals.totalMinor).toBe(55000)
  })

  it('includes a late fee in the total', () => {
    const totals = computeInvoiceTotals(
      [{ amountMinor: 100000, discountMinor: 0, taxPercent: 0 }],
      25000,
    )
    expect(totals.totalMinor).toBe(125000)
  })

  it('handles an empty invoice', () => {
    expect(computeInvoiceTotals([]).totalMinor).toBe(0)
  })
})

describe('invoice status', () => {
  const future = new Date(Date.now() + 86_400_000)
  const past = new Date(Date.now() - 86_400_000)

  it('is PAID the moment the balance clears', () => {
    expect(deriveInvoiceStatus({ totalMinor: 1000, paidMinor: 1000, dueOn: past })).toBe('PAID')
  })

  it('is PAID even when overpaid', () => {
    expect(deriveInvoiceStatus({ totalMinor: 1000, paidMinor: 1500, dueOn: past })).toBe('PAID')
  })

  it('is ISSUED when nothing is paid and it is not yet due', () => {
    expect(deriveInvoiceStatus({ totalMinor: 1000, paidMinor: 0, dueOn: future })).toBe('ISSUED')
  })

  it('is PARTIALLY_PAID before the due date', () => {
    expect(deriveInvoiceStatus({ totalMinor: 1000, paidMinor: 400, dueOn: future })).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('is OVERDUE once the due date passes with a balance', () => {
    expect(deriveInvoiceStatus({ totalMinor: 1000, paidMinor: 0, dueOn: past })).toBe('OVERDUE')
    expect(deriveInvoiceStatus({ totalMinor: 1000, paidMinor: 400, dueOn: past })).toBe('OVERDUE')
  })

  it('reports a cancelled invoice as cancelled whatever the money says', () => {
    expect(
      deriveInvoiceStatus({ totalMinor: 1000, paidMinor: 0, dueOn: past, cancelled: true }),
    ).toBe('CANCELLED')
  })
})

describe('late fees', () => {
  const flatPerDay = {
    graceDays: 5,
    kind: 'FLAT' as const,
    value: 5000,
    perDay: true,
    maxMinor: 100000,
  }

  it('charges nothing inside the grace period', () => {
    expect(lateFeeFor(1000000, 5, flatPerDay)).toBe(0)
    expect(lateFeeFor(1000000, 3, flatPerDay)).toBe(0)
  })

  it('charges from the first day after grace', () => {
    expect(lateFeeFor(1000000, 6, flatPerDay)).toBe(5000)
    expect(lateFeeFor(1000000, 10, flatPerDay)).toBe(25000)
  })

  it('respects the cap', () => {
    expect(lateFeeFor(1000000, 400, flatPerDay)).toBe(100000)
  })

  it('charges nothing on a settled invoice', () => {
    expect(lateFeeFor(0, 60, flatPerDay)).toBe(0)
  })

  it('supports a one-off percentage penalty', () => {
    const rule = { graceDays: 0, kind: 'PERCENT' as const, value: 2, perDay: false, maxMinor: null }
    expect(lateFeeFor(1000000, 30, rule)).toBe(20000)
    expect(lateFeeFor(1000000, 1, rule)).toBe(20000)
  })
})

describe('refundable amount', () => {
  it('is the whole payment when nothing has been refunded', () => {
    expect(refundableMinor(500000, 0)).toBe(500000)
  })

  it('shrinks with each partial refund', () => {
    expect(refundableMinor(500000, 200000)).toBe(300000)
  })

  it('is zero once fully refunded, never negative', () => {
    expect(refundableMinor(500000, 500000)).toBe(0)
    expect(refundableMinor(500000, 600000)).toBe(0)
  })
})

describe('financial year labels', () => {
  it('starts the year in April, as Indian schools do', () => {
    expect(financialYearLabel(new Date('2026-04-01T00:00:00Z'))).toBe('2627')
    expect(financialYearLabel(new Date('2026-12-31T00:00:00Z'))).toBe('2627')
  })

  it('puts January to March in the previous financial year', () => {
    expect(financialYearLabel(new Date('2026-03-31T00:00:00Z'))).toBe('2526')
    expect(financialYearLabel(new Date('2026-01-15T00:00:00Z'))).toBe('2526')
  })
})
