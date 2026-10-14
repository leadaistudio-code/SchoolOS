import { describe, expect, it } from 'vitest'
import { JournalSourceType } from '@prisma/client'
import {
  AGING_BUCKETS,
  CASH_FLOW_GROUPS,
  addMonths,
  agingBucketOf,
  agingRange,
  cashFlowBreakdown,
  cashFlowGroupOf,
  daysOverdue,
  expenseDistribution,
  lastDay,
  monthsBetween,
  parseDrill,
  planRefresh,
  resolvePeriod,
  wdvSeries,
  type SummaryRow,
} from '@/server/modules/accounting/analytics'

const row = (month: string, accountId: string, sourceType: string, debitMinor: number, creditMinor: number): SummaryRow => ({
  month,
  accountId,
  sourceType,
  debitMinor,
  creditMinor,
  lineCount: 1,
})

describe('analytics periods', () => {
  it('defaults to the financial year to date', () => {
    expect(resolvePeriod({}, '2026-10-14')).toMatchObject({ fromMonth: '2026-04', toMonth: '2026-10', from: '2026-04-01', to: '2026-10-31', isDefault: true })
    expect(resolvePeriod({}, '2027-02-03')).toMatchObject({ fromMonth: '2026-04', toMonth: '2027-02', to: '2027-02-28' })
  })

  it('swaps reversed months, ignores junk and caps the span at 36 months', () => {
    expect(resolvePeriod({ from: '2026-09', to: '2026-05' }, '2026-10-14')).toMatchObject({ fromMonth: '2026-05', toMonth: '2026-09', isDefault: false })
    expect(resolvePeriod({ from: '2026-13', to: "2026-09' OR 1=1" }, '2026-10-14')).toMatchObject({ fromMonth: '2026-04', toMonth: '2026-10' })
    const wide = resolvePeriod({ from: '2015-01', to: '2026-10' }, '2026-10-14')
    expect(wide.months).toHaveLength(36)
    expect(wide.fromMonth).toBe('2023-11')
  })

  it('handles month arithmetic across years and leap Februaries', () => {
    expect(lastDay('2028-02')).toBe('2028-02-29')
    expect(lastDay('2027-02')).toBe('2027-02-28')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
})

describe('summary refresh plan', () => {
  const state = { entryCount: 100, watermark: new Date('2026-10-14T05:00:00Z') }

  it('rebuilds in full the first time and on request', () => {
    expect(planRefresh(null, { count: 0, newer: 0 })).toBe('full')
    expect(planRefresh(null, { count: 50, newer: 50 })).toBe('full')
    expect(planRefresh(state, { count: 100, newer: 0 }, true)).toBe('full')
  })

  it('does nothing when no entry is new and none went missing', () => {
    expect(planRefresh(state, { count: 100, newer: 0 })).toBe('none')
  })

  it('refreshes only new months when every new entry is accounted for', () => {
    expect(planRefresh(state, { count: 103, newer: 3 })).toBe('incremental')
    expect(planRefresh({ entryCount: 0, watermark: null }, { count: 4, newer: 4 })).toBe('incremental')
  })

  it('rebuilds when an entry was deleted or committed late with an older timestamp', () => {
    expect(planRefresh(state, { count: 99, newer: 0 })).toBe('full')
    expect(planRefresh(state, { count: 101, newer: 0 })).toBe('full')
    expect(planRefresh(state, { count: 102, newer: 1 })).toBe('full')
  })
})

describe('cash flow breakdown', () => {
  it('maps every journal source to exactly one group', () => {
    for (const source of Object.values(JournalSourceType)) {
      const hits = CASH_FLOW_GROUPS.filter((g) => (g.sources as readonly string[]).includes(source))
      expect(hits, source).toHaveLength(1)
      expect(cashFlowGroupOf(source)).toBe(hits[0]!.key)
    }
  })

  it('counts cash debits as money in and credits as money out, by source and month', () => {
    const cash = new Set(['cash', 'bank'])
    const r = cashFlowBreakdown(
      [
        row('2026-04', 'cash', 'FEE_PAYMENT', 50_000_00, 0),
        row('2026-04', 'bank', 'FEE_PAYMENT', 20_000_00, 0),
        row('2026-05', 'cash', 'EXPENSE', 0, 4_500_00),
        row('2026-05', 'cash', 'EXPENSE', 4_500_00, 0), // reversal
        row('2026-05', 'bank', 'PAYROLL', 0, 30_000_00),
        row('2026-05', 'income', 'FEE_PAYMENT', 0, 70_000_00), // not a cash ledger
        row('2026-06', 'cash', 'MANUAL', 0, 10_000_00), // contra: cash to bank
        row('2026-06', 'bank', 'MANUAL', 10_000_00, 0),
      ],
      cash,
      ['2026-04', '2026-05', '2026-06'],
    )
    const g = Object.fromEntries(r.groups.map((x) => [x.key, x]))
    expect(g.fees).toMatchObject({ inflowMinor: 70_000_00, outflowMinor: 0, netMinor: 70_000_00 })
    expect(g.expenses).toMatchObject({ inflowMinor: 4_500_00, outflowMinor: 4_500_00, netMinor: 0 })
    expect(g.payroll).toMatchObject({ netMinor: -30_000_00 })
    expect(g.manual).toMatchObject({ inflowMinor: 10_000_00, outflowMinor: 10_000_00, netMinor: 0 })
    expect(r.netMinor).toBe(40_000_00)
    expect(r.months.map((m) => m.netMinor)).toEqual([70_000_00, -30_000_00, 0])
    expect(r.groups.reduce((s, x) => s + x.netMinor, 0)).toBe(r.netMinor)
  })
})

describe('expense distribution', () => {
  const accounts = [
    { id: 'sal', code: '5001', name: 'Salaries & Wages', expenseNature: 'DIRECT' },
    { id: 'adm', code: '5008', name: 'Administrative Expenses', expenseNature: null },
    { id: 'dep', code: '5020', name: 'Depreciation', expenseNature: 'INDIRECT' },
    { id: 'misc', code: '5099', name: 'Miscellaneous', expenseNature: null },
  ]

  it('nets debits and credits per ledger, drops zero heads and gives shares of the total', () => {
    const r = expenseDistribution(
      [
        row('2026-04', 'sal', 'PAYROLL', 60_000_00, 0),
        row('2026-05', 'sal', 'PAYROLL', 30_000_00, 0),
        row('2026-05', 'adm', 'EXPENSE', 4_500_00, 0),
        row('2026-06', 'adm', 'EXPENSE', 0, 4_500_00),
        row('2026-06', 'dep', 'DEPRECIATION', 10_000_00, 0),
      ],
      accounts,
    )
    expect(r.heads.map((h) => h.id)).toEqual(['sal', 'dep'])
    expect(r.totalMinor).toBe(100_000_00)
    expect(r.heads.map((h) => h.sharePct)).toEqual([90, 10])
  })
})

describe('dues aging', () => {
  it('puts every due date in exactly one bucket, with today not yet due', () => {
    const today = '2026-10-14'
    expect(agingBucketOf('2026-10-14', today)).toBe('not_due')
    expect(agingBucketOf('2026-10-13', today)).toBe('d0_30')
    expect(agingBucketOf('2026-09-14', today)).toBe('d0_30') // 30 days
    expect(agingBucketOf('2026-09-13', today)).toBe('d31_60') // 31 days
    expect(agingBucketOf('2026-08-15', today)).toBe('d31_60') // 60 days
    expect(agingBucketOf('2026-08-14', today)).toBe('d60_plus') // 61 days
    expect(daysOverdue('2026-08-14', today)).toBe(61)
  })

  it('date ranges agree with the bucket rule for every day around the boundaries', () => {
    const today = '2026-03-01'
    for (let offset = -10; offset <= 120; offset++) {
      const d = new Date(Date.UTC(2026, 2, 1 - offset)).toISOString().slice(0, 10)
      const inRanges = AGING_BUCKETS.filter((b) => {
        const r = agingRange(b.key, today)
        return (!r.gte || d >= r.gte) && (!r.lte || d <= r.lte)
      })
      expect(inRanges.map((b) => b.key), d).toEqual([agingBucketOf(d, today)])
    }
  })
})

describe('fixed asset WDV trend', () => {
  it('values assets held at each month end from posted depreciation only', () => {
    const assets = [
      { id: 'bus', costMinor: 10_00_000_00, openingAccumulatedMinor: 2_00_000_00, capitalisedOn: '2025-04-01', disposedOn: null },
      { id: 'pc', costMinor: 50_000_00, openingAccumulatedMinor: 0, capitalisedOn: '2026-05-10', disposedOn: '2026-08-20' },
    ]
    const lines = [
      { assetId: 'bus', amountMinor: 50_000_00, periodEnd: '2026-06-30' },
      { assetId: 'pc', amountMinor: 5_000_00, periodEnd: '2026-06-30' },
    ]
    const s = wdvSeries(assets, lines, ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
    expect(s.map((p) => p.assets)).toEqual([1, 2, 2, 2, 1])
    expect(s.map((p) => p.wdvMinor)).toEqual([8_00_000_00, 8_50_000_00, 7_95_000_00, 7_95_000_00, 7_50_000_00])
    expect(s[2]).toMatchObject({ costMinor: 10_50_000_00, accumulatedMinor: 2_55_000_00 })
  })
})

describe('drilldown parameters', () => {
  it('accepts known metrics and keys only', () => {
    expect(parseDrill('cash_flow:fees')).toEqual({ metric: 'cash_flow', key: 'fees' })
    expect(parseDrill('cash_flow:2026-05')).toEqual({ metric: 'cash_flow', key: '2026-05' })
    expect(parseDrill('cash_flow:all')).toEqual({ metric: 'cash_flow', key: 'all' })
    expect(parseDrill('expense:cmv7qkq7r0017vj4sak3kuvps')).toEqual({ metric: 'expense', key: 'cmv7qkq7r0017vj4sak3kuvps' })
    expect(parseDrill('aging:d31_60')).toEqual({ metric: 'aging', key: 'd31_60' })
    expect(parseDrill('aging:overdue')).toEqual({ metric: 'aging', key: 'overdue' })
    expect(parseDrill('wdv:2026-09')).toEqual({ metric: 'wdv', key: '2026-09' })
  })

  it('rejects anything else', () => {
    for (const bad of [undefined, '', 'cash_flow', 'cash_flow:salary', 'aging:d90', 'wdv:2026-13', 'expense:x y', "expense:a'--", 'ledger:all', ':all']) {
      expect(parseDrill(bad), String(bad)).toBeNull()
    }
  })
})
