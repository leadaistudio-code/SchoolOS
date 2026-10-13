import { describe, expect, it } from 'vitest'
import {
  naturalBalance,
  normalizeLines,
  reverseLines,
  sameLines,
  splitByWeights,
  splitInvoiceAmount,
  totals,
} from '@/server/modules/accounts/math'
import { financialYearRange, presetRange, schoolToday } from '@/lib/periods'

describe('splitByWeights', () => {
  it('always sums back to the amount', () => {
    for (const amount of [1, 7, 100, 9999, 123457]) {
      const parts = splitByWeights(amount, [1, 1, 1])
      expect(parts.reduce((s, p) => s + p, 0)).toBe(amount)
    }
  })

  it('gives larger remainders the extra paise', () => {
    expect(splitByWeights(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(splitByWeights(10, [2, 1])).toEqual([7, 3])
  })

  it('handles negatives, zero weights and an empty weight set', () => {
    expect(splitByWeights(-100, [1, 1, 1])).toEqual([-34, -33, -33])
    expect(splitByWeights(50, [0, 0], 1)).toEqual([0, 50])
    expect(splitByWeights(50, [0, 3, -2])).toEqual([0, 50, 0])
    expect(splitByWeights(50, [])).toEqual([])
  })
})

describe('journal line helpers', () => {
  const a = [
    { accountId: 'cash', debitMinor: 500, creditMinor: 0 },
    { accountId: 'tuition', debitMinor: 0, creditMinor: 300 },
    { accountId: 'tuition', debitMinor: 0, creditMinor: 200 },
  ]

  it('nets lines per account and puts debits first', () => {
    expect(normalizeLines(a)).toEqual([
      { accountId: 'cash', debitMinor: 500, creditMinor: 0, memo: null },
      { accountId: 'tuition', debitMinor: 0, creditMinor: 500, memo: null },
    ])
  })

  it('drops accounts that net to zero', () => {
    const lines = [
      { accountId: 'x', debitMinor: 100, creditMinor: 0 },
      { accountId: 'x', debitMinor: 0, creditMinor: 100 },
    ]
    expect(normalizeLines(lines)).toEqual([])
  })

  it('treats equivalent drafts as the same and different amounts as changed', () => {
    const b = [
      { accountId: 'tuition', debitMinor: 0, creditMinor: 500 },
      { accountId: 'cash', debitMinor: 500, creditMinor: 0 },
    ]
    expect(sameLines(a, b)).toBe(true)
    expect(sameLines(a, [{ accountId: 'cash', debitMinor: 400, creditMinor: 0 }, { accountId: 'tuition', debitMinor: 0, creditMinor: 400 }])).toBe(false)
  })

  it('reverses sides and stays balanced', () => {
    const rev = reverseLines(normalizeLines(a))
    expect(rev[0]).toMatchObject({ accountId: 'cash', debitMinor: 0, creditMinor: 500 })
    expect(totals(rev).balanced).toBe(true)
    expect(sameLines([...a, ...rev], [])).toBe(true)
  })
})

describe('splitInvoiceAmount', () => {
  const invoice = {
    lateFeeMinor: 10000,
    lines: [
      { feeHeadId: 'tuition', label: 'Tuition', amountMinor: 300000, discountMinor: 0, taxPercent: 0 },
      { feeHeadId: 'transport', label: 'Transport', amountMinor: 120000, discountMinor: 20000, taxPercent: 0 },
    ],
  }

  it('splits a full payment exactly by line including the late fee', () => {
    const slices = splitInvoiceAmount(invoice, 410000)
    expect(slices).toEqual([
      { feeHeadId: 'tuition', label: 'Tuition', amountMinor: 300000, isLateFee: false },
      { feeHeadId: 'transport', label: 'Transport', amountMinor: 100000, isLateFee: false },
      { feeHeadId: null, label: 'Late fee', amountMinor: 10000, isLateFee: true },
    ])
  })

  it('splits a part payment proportionally and sums exactly', () => {
    const slices = splitInvoiceAmount(invoice, 100001)
    expect(slices.reduce((s, x) => s + x.amountMinor, 0)).toBe(100001)
    expect(slices[0]!.amountMinor).toBeGreaterThan(slices[1]!.amountMinor)
  })

  it('weights tax into the line share', () => {
    const slices = splitInvoiceAmount(
      {
        lateFeeMinor: 0,
        lines: [
          { feeHeadId: 'a', label: 'A', amountMinor: 1000, discountMinor: 0, taxPercent: 100 },
          { feeHeadId: 'b', label: 'B', amountMinor: 1000, discountMinor: 0, taxPercent: 0 },
        ],
      },
      300,
    )
    expect(slices.map((s) => s.amountMinor)).toEqual([200, 100])
  })

  it('falls back to a single slice for an invoice with no lines', () => {
    expect(splitInvoiceAmount({ lateFeeMinor: 0, lines: [] }, 500)).toEqual([
      { feeHeadId: null, label: 'Fees', amountMinor: 500, isLateFee: false },
    ])
  })
})

describe('naturalBalance', () => {
  it('shows assets and expenses debit-side, others credit-side', () => {
    expect(naturalBalance('ASSET', 100)).toBe(100)
    expect(naturalBalance('EXPENSE', 100)).toBe(100)
    expect(naturalBalance('INCOME', -100)).toBe(100)
    expect(naturalBalance('LIABILITY', -50)).toBe(50)
  })
})

describe('periods', () => {
  // 2026-10-01 00:30 IST is still 2026-09-30 in UTC.
  const now = new Date('2026-09-30T19:00:00.000Z')

  it('uses the India calendar date', () => {
    expect(schoolToday(now)).toBe('2026-10-01')
  })

  it('resolves April-to-March financial years', () => {
    expect(financialYearRange('2026-10-01')).toEqual({ from: '2026-04-01', to: '2027-03-31' })
    expect(financialYearRange('2027-03-31')).toEqual({ from: '2026-04-01', to: '2027-03-31' })
    expect(financialYearRange('2027-04-01')).toEqual({ from: '2027-04-01', to: '2028-03-31' })
  })

  it('computes presets', () => {
    expect(presetRange('today', now)).toEqual({ from: '2026-10-01', to: '2026-10-01' })
    expect(presetRange('yesterday', now)).toEqual({ from: '2026-09-30', to: '2026-09-30' })
    expect(presetRange('week', now)).toEqual({ from: '2026-09-25', to: '2026-10-01' })
    expect(presetRange('month', now)).toEqual({ from: '2026-10-01', to: '2026-10-01' })
    expect(presetRange('last_month', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetRange('fy', now)).toEqual({ from: '2026-04-01', to: '2026-10-01' })
    expect(presetRange('nonsense', now)).toBeNull()
  })
})
