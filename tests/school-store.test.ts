import { describe, expect, it } from 'vitest'
import { priceLine, stockState, weightedAverageCost, itemLabel, STORE_CATEGORIES } from '@/lib/store/options'
import {
  stockAdjustmentSchema,
  storeItemSchema,
  storePurchaseSchema,
  storeSaleSchema,
} from '@/server/modules/store/service'
import { DEFAULT_CHART } from '@/server/modules/accounts/chart'
import { totals } from '@/server/modules/accounts/math'

describe('store bill line pricing (GST-inclusive)', () => {
  it('carves GST out of the price instead of adding it', () => {
    // 2 shirts at ₹525 incl. 5% GST
    const p = priceLine({ quantity: 2, unitPriceMinor: 52500, taxPercent: 5 })
    expect(p.amount).toBe(105000)
    expect(p.tax).toBe(5000)
    expect(p.net).toBe(100000)
  })

  it('applies the discount before tax and never below zero', () => {
    const p = priceLine({ quantity: 1, unitPriceMinor: 11800, discountMinor: 1800, taxPercent: 18 })
    expect(p.amount).toBe(10000)
    expect(p.tax).toBe(1525)
    const capped = priceLine({ quantity: 1, unitPriceMinor: 1000, discountMinor: 5000, taxPercent: 0 })
    expect(capped.discount).toBe(1000)
    expect(capped.amount).toBe(0)
  })

  it('has no tax for exempt items such as textbooks', () => {
    const p = priceLine({ quantity: 3, unitPriceMinor: 24000, taxPercent: 0 })
    expect(p).toMatchObject({ gross: 72000, amount: 72000, tax: 0, net: 72000 })
  })
})

describe('weighted average cost', () => {
  it('blends the new delivery with stock in hand', () => {
    // 10 at ₹100, receive 30 at ₹120 → (1000 + 3600) / 40 = ₹115
    expect(weightedAverageCost(10, 10000, 30, 12000)).toBe(11500)
  })

  it('takes the delivery cost when the shelf was empty', () => {
    expect(weightedAverageCost(0, 9000, 5, 12000)).toBe(12000)
    expect(weightedAverageCost(-2, 9000, 5, 12000)).toBe(12000)
  })
})

describe('stock state', () => {
  it('flags out, low and healthy stock', () => {
    expect(stockState(0, 5)).toBe('OUT')
    expect(stockState(5, 5)).toBe('LOW')
    expect(stockState(6, 5)).toBe('OK')
  })

  it('labels sizes on bills', () => {
    expect(itemLabel({ name: 'Shirt', variant: 'Size 32' })).toBe('Shirt (Size 32)')
    expect(itemLabel({ name: 'Bag', variant: null })).toBe('Bag')
  })
})

describe('store input validation', () => {
  it('converts rupees to paise and defaults opening stock to zero', () => {
    const item = storeItemSchema.parse({ name: 'Summer shirt', category: 'UNIFORM', sellingPrice: '525.50' })
    expect(item.sellingPrice).toBe(52550)
    expect(item.openingQuantity).toBe(0)
    expect(item.sku).toBeNull()
  })

  it('rejects an item without a price or with an unknown category', () => {
    expect(() => storeItemSchema.parse({ name: 'Tie', category: 'UNIFORM', sellingPrice: 0 })).toThrow()
    expect(() => storeItemSchema.parse({ name: 'Tie', category: 'FOOD', sellingPrice: 50 })).toThrow()
  })

  it('needs a student or a buyer name on every bill', () => {
    const lines = [{ itemId: 'i1', quantity: 1 }]
    expect(() => storeSaleSchema.parse({ paymentMode: 'CASH', lines })).toThrow(/student or enter the buyer/)
    expect(storeSaleSchema.parse({ paymentMode: 'CASH', studentId: 's1', lines }).lines[0]!.discount).toBe(0)
    expect(storeSaleSchema.parse({ paymentMode: 'UPI', customerName: 'Walk-in parent', lines }).customerName).toBe('Walk-in parent')
  })

  it('refuses fractional or zero quantities', () => {
    expect(() => storeSaleSchema.parse({ paymentMode: 'CASH', studentId: 's1', lines: [{ itemId: 'i1', quantity: 1.5 }] })).toThrow()
    expect(() => stockAdjustmentSchema.parse({ itemId: 'i1', direction: 'OUT', quantity: 0, reason: 'Damaged' })).toThrow()
  })

  it('requires a vendor and at least one line on a stock receipt', () => {
    expect(() => storePurchaseSchema.parse({ vendorName: 'Book Depot', purchaseDate: '2026-10-02', paymentMode: 'CASH', lines: [] })).toThrow()
    const ok = storePurchaseSchema.parse({
      vendorName: 'Book Depot',
      purchaseDate: '2026-10-02',
      paymentMode: 'BANK_TRANSFER',
      lines: [{ itemId: 'i1', quantity: '20', unitCost: '180' }],
    })
    expect(ok.lines[0]).toEqual({ itemId: 'i1', quantity: 20, unitCost: 18000 })
  })
})

describe('store accounting', () => {
  it('seeds every system account the store postings use', () => {
    const keys = new Set(DEFAULT_CHART.map((a) => a.systemKey))
    for (const key of ['STORE_STOCK', 'GST_PAYABLE', 'STORE_SALES_INCOME', 'EXP_STORE_COGS', 'EXP_STOCK_LOSS', 'OPENING_EQUITY']) {
      expect(keys.has(key), key).toBe(true)
    }
    const codes = DEFAULT_CHART.map((a) => a.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('a sale entry balances: cash = income + GST, and COGS = stock relief', () => {
    const p = priceLine({ quantity: 2, unitPriceMinor: 52500, taxPercent: 5 })
    const cost = 2 * 40000
    const lines = [
      { accountId: 'cash', debitMinor: p.amount, creditMinor: 0 },
      { accountId: 'income', debitMinor: 0, creditMinor: p.amount - p.tax },
      { accountId: 'gst', debitMinor: 0, creditMinor: p.tax },
      { accountId: 'cogs', debitMinor: cost, creditMinor: 0 },
      { accountId: 'stock', debitMinor: 0, creditMinor: cost },
    ]
    expect(totals(lines).balanced).toBe(true)
  })

  it('has a colour and code prefix for every category', () => {
    const prefixes = STORE_CATEGORIES.map((c) => c.prefix)
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })
})
